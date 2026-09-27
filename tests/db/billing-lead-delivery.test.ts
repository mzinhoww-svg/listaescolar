import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  activePlanId,
  assertLedgerInvariant,
  CHARGING_PLAN,
  confirmInvoice,
  createPackageInvoice,
  ensureTestBillingPlan,
  leadCreate,
  ledgerOf,
  packageOf,
  plan,
  publishPlanOk,
  purchasePass,
  topUp,
} from "./billing-fixtures";
import { cleanupUsers, IDS, seedCart, seedLead, seedStationery, seedUsers, withClaims } from "./helpers";

/** Recarrega uma carteira REAL (provedor pix, já que fake/demo são só para is_demo). Devolve o valor creditado. */
async function topUpReal(c: Client, o: { actor: string; stationery: string; pkg: string }): Promise<number> {
  const inv = await createPackageInvoice(c, { ...o, provider: "pix" });
  if (inv.error) throw new Error(`fatura: ${inv.error} (${inv.hint})`);
  const invoiceId = inv.rows[0]!.id as string;
  const amount = Number((await c.query("select amount_cents from public.invoices where id = $1", [invoiceId])).rows[0].amount_cents);
  const ok = await confirmInvoice(c, { invoice: invoiceId, provider: "pix", amount });
  if (ok.error) throw new Error(`confirmar: ${ok.error} (${ok.hint})`);
  return amount;
}

async function counts(c: Client): Promise<Record<string, number>> {
  const r = await c.query(
    `select (select count(*) from public.leads) as leads, (select count(*) from public.lead_items) as items,
            (select count(*) from public.lead_events) as events, (select count(*) from public.consents where purpose = 'lead_whatsapp_quote') as consents,
            (select count(*) from public.notifications where event_type = 'lead_received') as notifications,
            (select count(*) from public.credit_ledger) as ledger`,
  );
  return Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
}

describe("S21 · débito só na entrega do lead (gatilho em leads, mesma transação do lead_create)", () => {
  beforeAll(async () => {
    await seedUsers();
    await ensureTestBillingPlan();
  });
  afterAll(cleanupUsers);

  it("sem passe e com grátis -> free_lead de 0; grátis esgotado e sem saldo -> billing_required e nada nasce", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 1 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const cart = await seedCart(c, IDS.parent);
      const first = await leadCreate(c, { cart, stationery: st, itemCount: 3 });
      expect(first.error).toBeNull();
      expect(first.rows[0]!.created).toBe(true);
      let rows = await ledgerOf(c, st);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ entry_type: "free_lead", amount_cents: 0, lead_id: first.rows[0]!.lead_id, item_count: 3 });
      expect(Number(rows[0]!.balance_after_cents)).toBe(0);

      const before = await counts(c);
      const second = await leadCreate(c, { cart, stationery: st, itemCount: 3 });
      expect(second.hint).toBe("billing_required");
      expect(second.code).toBe("P0001");
      const after = await counts(c);
      expect(after).toEqual(before); // lead, itens, consentimento, evento, notificação e razão: nada ficou
      rows = await ledgerOf(c, st);
      expect(rows).toHaveLength(1);
      await assertLedgerInvariant(c, st);
      // billing_can_receive_lead reflete a mesma regra, sem gravar
      const can = (await c.query("select * from public.billing_can_receive_lead($1::uuid[], 3)", [[st]])).rows;
      expect(can).toEqual([{ stationery_id: st, can_receive: false }]);
    });
  });

  it("grátis vencido e saldo suficiente -> lead_debit com o preço da faixa do item_count (bordas 20/21)", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 5, free_leads_validity_days: 1 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      // ativação há 3 dias: grátis já venceram (validade 1 dia)
      await c.query("reset role");
      await c.query("insert into public.stationery_status_events (stationery_id, from_status, to_status, actor_role, created_at) values ($1, 'approved', 'active', 'owner', now() - interval '3 days')", [st]);
      await c.query("set local role service_role");
      const pkg = await packageOf(c, await activePlanId(c), 2); // 10000
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg });
      const cart = await seedCart(c, IDS.parent);
      const a = await leadCreate(c, { cart, stationery: st, itemCount: 20 });
      const b = await leadCreate(c, { cart, stationery: st, itemCount: 21 });
      const d = await leadCreate(c, { cart, stationery: st, itemCount: 1 });
      expect([a.error, b.error, d.error]).toEqual([null, null, null]);
      const rows = await ledgerOf(c, st);
      expect(rows.map((r) => [r.entry_type, r.amount_cents, r.item_count])).toEqual([
        ["topup", 10000, null],
        ["lead_debit", -500, 20],
        ["lead_debit", -900, 21],
        ["lead_debit", -500, 1],
      ]);
      expect(rows.map((r) => Number(r.balance_after_cents))).toEqual([10000, 9500, 8600, 8100]);
      expect(rows[1]!.tier_id).not.toBeNull();
      expect(rows[1]!.tier_id).not.toBe(rows[2]!.tier_id);
      const s = (await c.query("select public.billing_wallet_summary($1::uuid) as s", [st])).rows[0]!.s as Record<string, unknown>;
      expect(s.free_left).toBe(0);
      expect(s.balance_cents).toBe(8100);
      await assertLedgerInvariant(c, st);
    });
  });

  it("saldo insuficiente para a faixa do lead -> billing_required (mesmo com saldo para faixa mais barata)", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, packages: [{ amount_cents: 700 }] }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, await activePlanId(c)) });
      const cart = await seedCart(c, IDS.parent);
      const big = await leadCreate(c, { cart, stationery: st, itemCount: 25 }); // 900 > 700
      expect(big.hint).toBe("billing_required");
      const can = (await c.query("select * from public.billing_can_receive_lead($1::uuid[], $2)", [[st], 25])).rows;
      expect(can).toEqual([{ stationery_id: st, can_receive: false }]);
      const canSmall = (await c.query("select * from public.billing_can_receive_lead($1::uuid[], $2)", [[st], 5])).rows;
      expect(canSmall).toEqual([{ stationery_id: st, can_receive: true }]);
      const small = await leadCreate(c, { cart, stationery: st, itemCount: 5 });
      expect(small.error).toBeNull();
      expect((await ledgerOf(c, st)).map((r) => r.amount_cents)).toEqual([700, -500]);
    });
  });

  it("sem plano ativo (e sem passe/grátis) -> billing_unavailable; papelaria sem carteira e sem plano some do can_receive", async () => {
    await withClaims("system", async (c) => {
      await c.query("reset role");
      await c.query("update public.plans set status = 'archived' where status = 'active'");
      await c.query("set local role service_role");
      // `overrides: { is_demo: true }` casa com o carrinho demo padrão (`seedCart`): sem isso, o cenário seria
      // papelaria REAL + lead demo, que a revisão de segurança (item 3) agora intercepta ANTES de checar o plano
      // (pula o débito em silêncio, sem levantar `billing_unavailable`) — o teste quer isolar "sem plano ativo",
      // não o descarte de lead demo contra papelaria real (esse é o `billing-lead-delivery` mais abaixo).
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const cart = await seedCart(c, IDS.parent);
      const r = await leadCreate(c, { cart, stationery: st, itemCount: 2 });
      expect(r.hint).toBe("billing_unavailable");
      expect((await c.query("select count(*)::int as n from public.leads where stationery_id = $1", [st])).rows[0]!.n).toBe(0);
      const can = (await c.query("select * from public.billing_can_receive_lead($1::uuid[], 2)", [[st]])).rows;
      expect(can).toEqual([{ stationery_id: st, can_receive: false }]);
    });
  });

  it("papelaria sem carteira ainda: can_receive usa o plano ativo (grátis > 0 -> true; grátis 0 -> false)", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ free_leads: 1 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const yes = (await c.query("select * from public.billing_can_receive_lead($1::uuid[], 2)", [[st]])).rows;
      expect(yes).toEqual([{ stationery_id: st, can_receive: true }]);
      expect((await c.query("select count(*)::int as n from public.stationery_wallets where stationery_id = $1", [st])).rows[0]!.n).toBe(0); // não gravou
      await publishPlanOk(c, plan({ free_leads: 0 }));
      const st2 = await seedStationery(c, { status: "active", ownerId: IDS.school_member });
      // sem carteira, a papelaria usa sempre o plano ATIVO (não um snapshot): com o plano trocado para grátis:0,
      // st também vira false (só ganha snapshot próprio quando a carteira é criada, na 1ª cobrança).
      const no = (await c.query("select * from public.billing_can_receive_lead($1::uuid[], 2)", [[st2, st, randomUUID()]])).rows;
      expect(no).toEqual(expect.arrayContaining([{ stationery_id: st2, can_receive: false }, { stationery_id: st, can_receive: false }]));
      expect(no).toHaveLength(2); // id desconhecido não aparece
    });
  });

  it("replay idempotente do lead_create não debita de novo; seedLead (inserção direta) também passa pelo gatilho", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, CHARGING_PLAN);
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, await activePlanId(c)) });
      const cart = await seedCart(c, IDS.parent);
      const key = randomUUID();
      const list = randomUUID();
      const a = await leadCreate(c, { cart, stationery: st, itemCount: 2, key, list });
      const b = await leadCreate(c, { cart, stationery: st, itemCount: 2, key, list });
      expect(a.rows[0]!.lead_id).toBe(b.rows[0]!.lead_id);
      expect(b.rows[0]!.created).toBe(false);
      // mesma (solicitante, papelaria, lista) aberta com outra chave: devolve o existente, sem débito
      const d = await leadCreate(c, { cart, stationery: st, itemCount: 2, list });
      expect(d.rows[0]!.created).toBe(false);
      let rows = await ledgerOf(c, st);
      expect(rows.map((r) => r.entry_type)).toEqual(["topup", "lead_debit"]);
      const seeded = await seedLead(c, { stationeryId: st, cartId: cart, overrides: { item_count: 30 } });
      rows = await ledgerOf(c, st);
      expect(rows[2]).toMatchObject({ entry_type: "lead_debit", amount_cents: -900, lead_id: seeded.id, item_count: 30 });
      // idempotência por lead: a chave 'lead:<id>' é única
      const dup = await c.query("select count(*)::int as n from public.credit_ledger where lead_id = $1", [seeded.id]);
      expect(dup.rows[0]!.n).toBe(1);
      await assertLedgerInvariant(c, st);
    });
  });

  it("com passe ativo e cota -> pass_lead de 0 (antes dos grátis); cota esgotada cai para grátis e depois crédito", async () => {
    await withClaims("system", async (c) => {
      const today = (await c.query("select extract(month from (now() at time zone 'America/Cuiaba'))::int as m")).rows[0]!.m as number;
      // temporada que contém hoje: começa no mês corrente e termina no seguinte
      const end = (today % 12) + 1;
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 1, season: { start_month: today, end_month: end }, pass: { price_cents: 3000, included_leads: 2, max_installments: 1 } }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      await topUp(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, await activePlanId(c)) });
      const pass = await purchasePass(c, { actor: IDS.stationery_member, stationery: st, installments: 1 });
      expect(pass.error).toBeNull();
      const inv = (await c.query("select id, amount_cents from public.invoices where season_pass_id = $1", [pass.rows[0]!.id])).rows[0];
      const cart = await seedCart(c, IDS.parent);
      // passe pendente não conta: 1º lead usa o grátis
      await leadCreate(c, { cart, stationery: st, itemCount: 2 });
      const ok = await confirmInvoice(c, { invoice: inv.id, amount: Number(inv.amount_cents) });
      expect(ok.rows[0]!.ok).toBe(true);
      expect((await c.query("select status from public.season_passes where id = $1", [pass.rows[0]!.id])).rows[0]!.status).toBe("active");
      await leadCreate(c, { cart, stationery: st, itemCount: 2 });
      await leadCreate(c, { cart, stationery: st, itemCount: 2 });
      await leadCreate(c, { cart, stationery: st, itemCount: 2 }); // cota esgotada, grátis já usado -> crédito
      const rows = await ledgerOf(c, st);
      expect(rows.map((r) => [r.entry_type, r.amount_cents])).toEqual([
        ["topup", 5000],
        ["free_lead", 0],
        ["pass_lead", 0],
        ["pass_lead", 0],
        ["lead_debit", -500],
      ]);
      expect(rows[2]!.season_pass_id).toBe(pass.rows[0]!.id);
      const s = (await c.query("select public.billing_wallet_summary($1::uuid) as s", [st])).rows[0]!.s as { active_pass: { id: string; leads_left: number } | null };
      expect(s.active_pass?.id).toBe(pass.rows[0]!.id);
      expect(s.active_pass?.leads_left).toBe(0);
      await assertLedgerInvariant(c, st);
    });
  });

  it("gatilho de cobrança dispara antes da notificação e a falha desfaz tudo (ordem alfabética dos AFTER INSERT)", async () => {
    await withClaims("system", async (c) => {
      const t = (await c.query("select tgname from pg_trigger where tgrelid = 'public.leads'::regclass and not tgisinternal and tgtype & 2 = 0 and tgtype & 4 = 4 order by tgname")).rows.map((r) => r.tgname as string);
      expect(t.indexOf("leads_billing_charge")).toBeLessThan(t.indexOf("notify_lead_created"));
    });
  });

  it("revisão de segurança: lead de DEMONSTRAÇÃO não debita carteira REAL (nasce normalmente, sem lançamento)", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 0 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: false } });
      await topUpReal(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, await activePlanId(c)) });
      const cart = await seedCart(c, IDS.parent);
      const balanceBefore = (await c.query("select coalesce(sum(amount_cents), 0)::int as n from public.credit_ledger e join public.stationery_wallets w on w.id = e.wallet_id where w.stationery_id = $1", [st])).rows[0]!.n as number;
      const attempt = await leadCreate(c, { cart, stationery: st, itemCount: 2, isDemo: true });
      expect(attempt.error).toBeNull(); // não quebra o carrinho de demonstração da S12 contra papelaria real
      expect(attempt.rows[0]!.created).toBe(true);
      const balanceAfter = (await c.query("select coalesce(sum(amount_cents), 0)::int as n from public.credit_ledger e join public.stationery_wallets w on w.id = e.wallet_id where w.stationery_id = $1", [st])).rows[0]!.n as number;
      expect(balanceAfter).toBe(balanceBefore); // saldo real intacto: nenhum lançamento saiu por um lead de brincadeira
      const ledgerRows = await c.query("select count(*)::int as n from public.credit_ledger where lead_id = $1", [attempt.rows[0]!.lead_id]);
      expect(ledgerRows.rows[0]!.n).toBe(0); // nenhum lançamento associado a este lead
      // seedLead (inserção direta) também pula o débito pelo mesmo gatilho.
      const seeded = await seedLead(c, { stationeryId: st, cartId: cart, overrides: { is_demo: true, item_count: 2 } });
      const seededLedger = await c.query("select count(*)::int as n from public.credit_ledger where lead_id = $1", [seeded.id]);
      expect(seededLedger.rows[0]!.n).toBe(0);
      await assertLedgerInvariant(c, st);
    });
  });

  // D-099 (S23): cobre por teste o item 3 da revisão de segurança da S21 ("lead demo criava a carteira REAL antes
  // de checar is_demo") — antes da correção, `billing_ensure_wallet` rodava ANTES do pulo de débito; hoje roda
  // depois, então uma papelaria REAL sem carteira nenhuma não ganha carteira (nem lançamento) só por um lead demo.
  it("D-099: lead de demonstração em papelaria REAL sem carteira NÃO cria stationery_wallets", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 0 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: false } });
      const before = await c.query("select count(*)::int as n from public.stationery_wallets where stationery_id = $1", [st]);
      expect(before.rows[0]!.n).toBe(0); // ninguém criou carteira ainda (sem topUp, sem lead real)

      const cart = await seedCart(c, IDS.parent);
      const attempt = await leadCreate(c, { cart, stationery: st, itemCount: 2, isDemo: true });
      expect(attempt.error).toBeNull();

      const after = await c.query("select count(*)::int as n from public.stationery_wallets where stationery_id = $1", [st]);
      expect(after.rows[0]!.n).toBe(0); // lead de brincadeira não cria carteira real
    });
  });

  it("lead REAL (não-demo) numa carteira REAL debita normalmente (sem falso positivo do pulo de débito demo)", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 0 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: false } });
      await topUpReal(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, await activePlanId(c)) });
      const cart = await seedCart(c, IDS.parent, false);
      const ok = await leadCreate(c, { cart, stationery: st, itemCount: 2, isDemo: false });
      expect(ok.error).toBeNull();
      expect(ok.rows[0]!.created).toBe(true);
      const rows = await ledgerOf(c, st);
      expect(rows.at(-1)).toMatchObject({ entry_type: "lead_debit" });
      await assertLedgerInvariant(c, st);
    });
  });

  it("revisão de segurança: billing_wallet_summary_readonly NUNCA cria carteira (leitura passiva do admin); billing_wallet_summary continua criando (ação da própria papelaria)", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 3 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: false } });
      const before = (await c.query("select count(*)::int as n from public.stationery_wallets where stationery_id = $1", [st])).rows[0]!.n as number;
      expect(before).toBe(0);

      // leitura passiva (admin navegando papelarias): NUNCA cria a carteira, mesmo lida várias vezes.
      for (let i = 0; i < 3; i++) {
        const s = (await c.query("select public.billing_wallet_summary_readonly($1::uuid) as s", [st])).rows[0]!.s as {
          available: boolean;
          balance_cents: number;
          free_left: number;
          active_pass: unknown;
        };
        expect(s.available).toBe(true);
        expect(s.balance_cents).toBe(0);
        expect(s.free_left).toBe(3); // projeta o plano ativo sem carteira
        expect(s.active_pass).toBeNull();
      }
      const stillNone = (await c.query("select count(*)::int as n from public.stationery_wallets where stationery_id = $1", [st])).rows[0]!.n as number;
      expect(stillNone).toBe(0);

      // a AÇÃO da própria papelaria (Pap06) continua criando a carteira, como antes desta revisão.
      const s2 = (await c.query("select public.billing_wallet_summary($1::uuid) as s", [st])).rows[0]!.s as { free_left: number };
      expect(s2.free_left).toBe(3);
      const after = (await c.query("select count(*)::int as n from public.stationery_wallets where stationery_id = $1", [st])).rows[0]!.n as number;
      expect(after).toBe(1);
    });
  });
});
