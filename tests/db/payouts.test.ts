import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  batchCreate,
  batchMarkExecuted,
  confirmSale,
  flagLatePayment,
  ledgerFor,
  pendingFor,
  publishPayoutSettings,
  publishPayoutSettingsOk,
  publishSchoolConfig,
  purgePayouts,
  resolveAlert,
} from "./payout-fixtures";
import {
  asServiceCommitted,
  attemptH,
  cleanupUsers,
  ensureSchool,
  IDS,
  purgeLeads,
  purgeStationeries,
  seedCart,
  seedLead,
  seedStationery,
  seedUsers,
  withClaims,
  withSuperuser,
} from "./helpers";

/**
 * `invoices` não tem grant de INSERT nem para service_role (escrita só pelas funções SECURITY DEFINER da 0401):
 * roda `sql` como superuser (reset role) e volta ao papel anterior — mesmo padrão de `seedStationery`/`seedLead`.
 */
async function asOwnerQuery<T extends { rows: unknown[] }>(c: Client, sql: string, params: unknown[]): Promise<T> {
  const prev = (await c.query("select current_user as u")).rows[0].u as string;
  await c.query("reset role");
  try {
    return (await c.query(sql, params)) as unknown as T;
  } finally {
    await c.query(`set local role ${prev}`).catch(() => undefined);
  }
}

async function leadForSale(c: Client, opts: { stationeryId: string; amountCents?: number | null; isDemo?: boolean }) {
  return seedLead(c, {
    stationeryId: opts.stationeryId,
    status: "converted",
    overrides: {
      declared_sale_cents: opts.amountCents === undefined ? 10000 : opts.amountCents,
      declared_at: opts.amountCents === null ? null : new Date().toISOString(),
      is_demo: opts.isDemo ?? false,
    },
  });
}

describe("S23 · payout_settings / school_payout_settings (config)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("só admin publica; comissão e prazos fora do intervalo são recusados", async () => {
    await withClaims("system", async (c) => {
      for (const who of [IDS.parent, IDS.stationery_member, IDS.school_member]) {
        const r = await publishPayoutSettings(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 }, who);
        expect(r.hint, who).toBe("forbidden");
      }
      const badCommission = await publishPayoutSettings(c, { commissionBps: 10001, graceDays: 5, blockDays: 15 });
      expect(badCommission.hint).toBe("invalid_input");
      const badDays = await publishPayoutSettings(c, { commissionBps: 1000, graceDays: 15, blockDays: 15 });
      expect(badDays.hint).toBe("invalid_input");
      const ok = await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      expect(ok).toBeTruthy();
    });
  });

  it("publicar de novo arquiva a versão anterior (uma ativa por vez)", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 500, graceDays: 5, blockDays: 15 });
      await publishPayoutSettingsOk(c, { commissionBps: 800, graceDays: 7, blockDays: 20 });
      const r = await c.query<{ status: string; commission_bps: number }>("select status, commission_bps from public.payout_settings order by created_at");
      expect(r.rows.map((x) => x.status)).toEqual(["archived", "active"]);
      expect(r.rows[1]!.commission_bps).toBe(800);
    });
  });

  it("payout_settings é imutável fora da transição active->archived (nem para o dono do banco)", async () => {
    await withClaims("system", async (c) => {
      const id = await publishPayoutSettingsOk(c, { commissionBps: 500, graceDays: 5, blockDays: 15 });
      const bad = await attemptH(c, "update public.payout_settings set commission_bps = 999 where id = $1", [id]);
      expect(bad.code).toBe("42501");
    });
  });

  it("school config: alvo none zera bps/pix; escola inexistente -> not_found; repasse maior que a comissão vigente -> invalid_input", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const school = await ensureSchool(c);
      const none = await publishSchoolConfig(c, { schoolId: school, target: "none" });
      expect(none.error).toBeNull();
      const row = await c.query("select payout_bps, pix_key from public.school_payout_settings where id = $1", [none.rows[0]!.id]);
      expect(row.rows[0]).toMatchObject({ payout_bps: 0, pix_key: null });

      const missing = await publishSchoolConfig(c, { schoolId: randomUUID(), target: "school", payoutBps: 500 });
      expect(missing.hint).toBe("not_found");

      const tooMuch = await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 1500 });
      expect(tooMuch.hint).toBe("invalid_input");

      const ok = await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 400 });
      expect(ok.error).toBeNull();
    });
  });
});

describe("S23 · payout_confirm_sale (registro declarativo de Pix pela plataforma)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("só membro da papelaria do lead, admin ou system; ator de outra papelaria é recusado", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const lead = await leadForSale(c, { stationeryId: st });
      const other = await confirmSale(c, { actorId: IDS.school_member, actorRole: "stationery_member", leadId: lead.id });
      expect(other.hint).toBe("forbidden");
      const ok = await confirmSale(c, { actorId: IDS.stationery_member, actorRole: "stationery_member", leadId: lead.id });
      expect(ok.error).toBeNull();
    });
  });

  it("lead sem venda declarada (não convertido, ou sem valor) -> invalid_state", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const notConverted = await seedLead(c, { stationeryId: st, status: "received" });
      const r1 = await confirmSale(c, { actorId: null, actorRole: "system", leadId: notConverted.id });
      expect(r1.hint).toBe("invalid_state");
      const noAmount = await seedLead(c, { stationeryId: st, status: "converted", overrides: { declared_sale_cents: null } });
      const r2 = await confirmSale(c, { actorId: null, actorRole: "system", leadId: noAmount.id });
      expect(r2.hint).toBe("invalid_state");
    });
  });

  it("sem payout_settings ativo -> payout_unavailable (nunca inventa taxa)", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const lead = await leadForSale(c, { stationeryId: st });
      const r = await confirmSale(c, { actorId: null, actorRole: "system", leadId: lead.id });
      expect(r.hint).toBe("payout_unavailable");
    });
  });

  it("idempotente por lead: 2ª confirmação devolve o mesmo id, sem lançamento novo no razão", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 20000 });
      const r1 = await confirmSale(c, { actorId: null, actorRole: "system", leadId: lead.id });
      const r2 = await confirmSale(c, { actorId: null, actorRole: "system", leadId: lead.id });
      expect(r1.rows[0]!.id).toBe(r2.rows[0]!.id);
      const rows = await ledgerFor(c, "platform", null);
      expect(rows.filter((r) => r.sale_payment_id === r1.rows[0]!.id)).toHaveLength(1);
    });
  });

  it("gera comissão sempre; repasse_due só com escola resolvida e config ativa alvo != none", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 }); // 10%
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 300 }); // 3%

      const leadNoSchool = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const r1 = await confirmSale(c, { actorId: null, actorRole: "system", leadId: leadNoSchool.id });
      const rows1 = await ledgerFor(c, "platform", null);
      expect(rows1.filter((r) => r.sale_payment_id === r1.rows[0]!.id)).toMatchObject([{ entry_type: "commission", amount_cents: 1000 }]);

      const leadWithSchool = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const r2 = await confirmSale(c, { actorId: null, actorRole: "system", leadId: leadWithSchool.id, schoolId: school });
      const commission2 = await ledgerFor(c, "platform", null);
      expect(commission2.filter((r) => r.sale_payment_id === r2.rows[0]!.id)).toMatchObject([{ entry_type: "commission", amount_cents: 1000 }]);
      const repasse = await ledgerFor(c, "apm", school);
      expect(repasse.filter((r) => r.sale_payment_id === r2.rows[0]!.id)).toMatchObject([{ entry_type: "repasse_due", amount_cents: 300 }]);
    });
  });

  it("escola com config arquivada (não ativa) -> sem repasse_due, sem erro", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 300 });
      await publishSchoolConfig(c, { schoolId: school, target: "none" }); // arquiva a anterior
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const r = await confirmSale(c, { actorId: null, actorRole: "system", leadId: lead.id, schoolId: school });
      expect(r.error).toBeNull();
      const repasse = await ledgerFor(c, "apm", school);
      expect(repasse.filter((x) => x.sale_payment_id === r.rows[0]!.id)).toHaveLength(0);
    });
  });

  it("venda de demonstração: registra sale_payment mas SEM efeito no razão", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000, isDemo: true });
      const r = await confirmSale(c, { actorId: null, actorRole: "system", leadId: lead.id });
      expect(r.error).toBeNull();
      const rows1 = await ledgerFor(c, "platform", null);
      expect(rows1.filter((x) => x.sale_payment_id === r.rows[0]!.id)).toHaveLength(0);
      const saleRow = await c.query("select is_demo from public.sale_payments where id = $1", [r.rows[0]!.id]);
      expect(saleRow.rows[0].is_demo).toBe(true);
    });
  });

  it("D-105: lead_conversion_signals.pix_confirmed passa a ser verdadeiro após payout_confirm_sale", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const before = await c.query("select pix_confirmed, signal_count from public.lead_conversion_signals($1)", [lead.id]);
      expect(before.rows[0]).toMatchObject({ pix_confirmed: false, signal_count: 1 }); // só a declaração da papelaria
      await confirmSale(c, { actorId: null, actorRole: "system", leadId: lead.id });
      const after = await c.query("select pix_confirmed, signal_count, confirmed from public.lead_conversion_signals($1)", [lead.id]);
      expect(after.rows[0]).toMatchObject({ pix_confirmed: true, signal_count: 2, confirmed: true });
    });
  });
});

describe("S23 · concorrência (aceite do PLAN: relatório = livro-razão)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("duas confirmações concorrentes da mesma venda geram só 1 sale_payment e 1 lançamento de comissão", async () => {
    let stationeryId = "";
    let leadId = "";
    let cartId = "";
    try {
      await asServiceCommitted(async (c) => {
        await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
        stationeryId = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        cartId = await seedCart(c, IDS.parent, false);
        const lead = await seedLead(c, {
          stationeryId,
          cartId,
          requesterId: IDS.parent,
          status: "converted",
          overrides: { declared_sale_cents: 15000, declared_at: new Date().toISOString(), is_demo: false },
        });
        leadId = lead.id;
      });

      const results = await Promise.all(
        [1, 2].map(() => asServiceCommitted((c) => confirmSale(c, { actorId: null, actorRole: "system", leadId }))),
      );
      for (const r of results) expect(r.error, r.error ?? undefined).toBeNull();
      const ids = new Set(results.map((r) => r.rows[0]!.id as string));
      expect(ids.size).toBe(1); // as duas chamadas devolvem o MESMO sale_payment id

      await withSuperuser(async (c) => {
        const sales = await c.query("select count(*)::int as n from public.sale_payments where lead_id = $1", [leadId]);
        expect(sales.rows[0].n).toBe(1);
        const ledger = await c.query(
          "select count(*)::int as n from public.payout_ledger where sale_payment_id = (select id from public.sale_payments where lead_id = $1)",
          [leadId],
        );
        expect(ledger.rows[0].n).toBe(1); // só 1 lançamento de comissão, não 2 (sem lock, a 2ª corrida duplicaria)
      });
    } finally {
      if (leadId) await purgePayouts({ leadIds: [leadId] });
      if (leadId) await purgeLeads({ leadIds: [leadId], cartIds: cartId ? [cartId] : [] });
      if (stationeryId) await purgeStationeries([stationeryId]);
      // payout_settings é imutável (só a transição active -> archived): arquiva, nunca apaga.
      await withSuperuser((c) => c.query("update public.payout_settings set status = 'archived' where status = 'active'"));
    }
  });
});

describe("S23 · payout_batch_create / payout_batch_mark_executed (lote de repasse)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("soma exatamente o pendente; sem nada pendente -> nothing_due; executar 2x é idempotente", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "school", payoutBps: 200 });

      const l1 = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      await confirmSale(c, { actorId: null, actorRole: "system", leadId: l1.id, schoolId: school });
      const l2 = await leadForSale(c, { stationeryId: st, amountCents: 5000 });
      await confirmSale(c, { actorId: null, actorRole: "system", leadId: l2.id, schoolId: school });

      const pendingBefore = await pendingFor(c, "school", school);
      expect(pendingBefore).toBe(200 + 100); // 2% de 10000 + 2% de 5000

      const noQuota = await batchCreate(c, { actorId: IDS.parent, schoolId: school, beneficiaryType: "school" });
      expect(noQuota.hint).toBe("forbidden");

      const batch = await batchCreate(c, { actorId: IDS.admin, schoolId: school, beneficiaryType: "school" });
      expect(batch.error).toBeNull();
      const pendingAfter = await pendingFor(c, "school", school);
      expect(pendingAfter).toBe(0);

      const again = await batchCreate(c, { actorId: IDS.admin, schoolId: school, beneficiaryType: "school" });
      expect(again.hint).toBe("nothing_due");

      const exec1 = await batchMarkExecuted(c, { actorId: IDS.admin, batchId: batch.rows[0]!.id as string });
      const exec2 = await batchMarkExecuted(c, { actorId: IDS.admin, batchId: batch.rows[0]!.id as string });
      expect(exec1.rows[0]!.id).toBe(exec2.rows[0]!.id);
      const row = await c.query("select status from public.payout_batches where id = $1", [batch.rows[0]!.id]);
      expect(row.rows[0].status).toBe("executed");
    });
  });
});

describe("S23 · inadimplência (payout_delinquency_status / pausa de lead)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  // Parcela de PASSE vencida, real (is_demo=false) — só isso conta para a régua (revisão de segurança: uma recarga
  // de crédito pré-paga abandonada não é dívida, e fatura de demonstração nunca deve pausar papelaria nenhuma).
  async function withOverdueInvoice(c: Client, stationeryId: string, daysOverdue: number): Promise<void> {
    const passId = (
      await asOwnerQuery<{ rows: { id: string }[] }>(
        c,
        `insert into public.season_passes (stationery_id, plan_id, status, price_cents, included_leads, installments, season_start, season_end, is_demo, idempotency_key)
         values ($1, (select id from public.plans where status = 'active'), 'active', 30000, 40, 1, current_date, current_date + 90, false, $2) returning id`,
        [stationeryId, randomUUID()],
      )
    ).rows[0]!.id;
    await asOwnerQuery(
      c,
      `insert into public.invoices (stationery_id, kind, season_pass_id, installment_no, amount_cents, due_date, status, provider, is_demo, idempotency_key)
       values ($1, 'season_pass_installment', $2, 1, 30000, ((now() at time zone 'America/Cuiaba')::date - $3::int), 'open', 'pix', false, $4)`,
      [stationeryId, passId, daysOverdue, randomUUID()],
    );
  }

  // Recarga de crédito (não é parcela de passe) e fatura de DEMONSTRAÇÃO: nenhuma das duas conta para a régua.
  async function withOverdueCreditPackageInvoice(c: Client, stationeryId: string, daysOverdue: number): Promise<void> {
    await asOwnerQuery(
      c,
      `insert into public.invoices (stationery_id, kind, package_id, amount_cents, due_date, status, provider, is_demo, idempotency_key)
       values ($1, 'credit_package', (select id from public.plan_credit_packages limit 1), 1000, ((now() at time zone 'America/Cuiaba')::date - $2::int), 'open', 'fake', true, $3)`,
      [stationeryId, daysOverdue, randomUUID()],
    );
  }

  async function withOverdueDemoPassInvoice(c: Client, stationeryId: string, daysOverdue: number): Promise<void> {
    const passId = (
      await asOwnerQuery<{ rows: { id: string }[] }>(
        c,
        `insert into public.season_passes (stationery_id, plan_id, status, price_cents, included_leads, installments, season_start, season_end, is_demo, idempotency_key)
         values ($1, (select id from public.plans where status = 'active'), 'active', 30000, 40, 1, current_date, current_date + 90, true, $2) returning id`,
        [stationeryId, randomUUID()],
      )
    ).rows[0]!.id;
    await asOwnerQuery(
      c,
      `insert into public.invoices (stationery_id, kind, season_pass_id, installment_no, amount_cents, due_date, status, provider, is_demo, idempotency_key)
       values ($1, 'season_pass_installment', $2, 1, 30000, ((now() at time zone 'America/Cuiaba')::date - $3::int), 'open', 'demo', true, $4)`,
      [stationeryId, passId, daysOverdue, randomUUID()],
    );
  }

  it("sem payout_settings ativo -> sempre em_dia, mesmo com fatura vencida (falha aberta)", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await withOverdueInvoice(c, st, 400);
      const r = await c.query("select status from public.payout_delinquency_status($1)", [st]);
      expect(r.rows[0].status).toBe("em_dia");
    });
  });

  it("fronteiras exatas de grace_days/block_days", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await withOverdueInvoice(c, st, 5);
      expect((await c.query("select status from public.payout_delinquency_status($1)", [st])).rows[0].status).toBe("em_dia");
    });
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await withOverdueInvoice(c, st, 6);
      expect((await c.query("select status from public.payout_delinquency_status($1)", [st])).rows[0].status).toBe("atraso");
    });
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await withOverdueInvoice(c, st, 15);
      expect((await c.query("select status from public.payout_delinquency_status($1)", [st])).rows[0].status).toBe("atraso");
    });
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await withOverdueInvoice(c, st, 16);
      expect((await c.query("select status from public.payout_delinquency_status($1)", [st])).rows[0].status).toBe("pausado");
    });
  });

  it("revisão de segurança: recarga de crédito vencida (credit_package) NUNCA conta para a régua", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await withOverdueCreditPackageInvoice(c, st, 400);
      expect((await c.query("select status from public.payout_delinquency_status($1)", [st])).rows[0].status).toBe("em_dia");
    });
  });

  it("revisão de segurança: parcela de passe de DEMONSTRAÇÃO vencida NUNCA conta para a régua", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await withOverdueDemoPassInvoice(c, st, 400);
      expect((await c.query("select status from public.payout_delinquency_status($1)", [st])).rows[0].status).toBe("em_dia");
    });
  });

  it("papelaria pausada some de billing_can_receive_lead e o gatilho de entrega recusa o lead (delinquency_blocked)", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await withOverdueInvoice(c, st, 30);
      const canReceive = await c.query("select can_receive from public.billing_can_receive_lead(array[$1]::uuid[], 1)", [st]);
      expect(canReceive.rows[0].can_receive).toBe(false);

      const cart = await seedCart(c, IDS.parent, false);
      const items = JSON.stringify([{ name: "Caderno", item_key: "caderno", quantity: 1 }]);
      const muni = (await c.query("select id from public.municipalities order by ibge_code limit 1")).rows[0].id;
      const created = await attemptH(
        c,
        `select * from public.lead_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::int,$8::uuid,$9::text,$10::jsonb,$11::text,$12::uuid,$13::boolean,$14::int,$15::int)`,
        [IDS.parent, cart, randomUUID(), st, "Escola X", "5º ano", 2027, muni, "centro", items, "v1", randomUUID(), false, 10, 5],
      );
      expect(created.hint).toBe("delinquency_blocked");
    });
  });
});

describe("S23 · billing_flag_late_payment / billing_resolve_payment_alert (D-101)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("registra 1x por (fatura, cobrança); fatura ainda aberta é recusada; admin resolve com nota (idempotente)", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const openInv = await asOwnerQuery<{ rows: { id: string }[] }>(
        c,
        `insert into public.invoices (stationery_id, kind, package_id, amount_cents, due_date, status, provider, is_demo, idempotency_key)
         values ($1,'credit_package',(select id from public.plan_credit_packages limit 1),1000, current_date, 'open','fake', true, $2) returning id`,
        [st, randomUUID()],
      );
      const stillOpen = await flagLatePayment(c, { invoiceId: openInv.rows[0]!.id, providerChargeId: "fake-x", amountCents: 1000 });
      expect(stillOpen.hint).toBe("invalid_input");

      const paidInv = await asOwnerQuery<{ rows: { id: string }[] }>(
        c,
        `insert into public.invoices (stationery_id, kind, package_id, amount_cents, due_date, status, provider, is_demo, paid_at, paid_amount_cents, idempotency_key)
         values ($1,'credit_package',(select id from public.plan_credit_packages limit 1),1000, current_date, 'paid','fake', true, now(), 1000, $2) returning id`,
        [st, randomUUID()],
      );
      const a1 = await flagLatePayment(c, { invoiceId: paidInv.rows[0]!.id, providerChargeId: "fake-late-1", amountCents: 1000 });
      const a2 = await flagLatePayment(c, { invoiceId: paidInv.rows[0]!.id, providerChargeId: "fake-late-1", amountCents: 1000 });
      expect(a1.rows[0]!.id).toBe(a2.rows[0]!.id);

      const notAdmin = await resolveAlert(c, { actorId: IDS.parent, alertId: a1.rows[0]!.id as string });
      expect(notAdmin.hint).toBe("forbidden");
      const r1 = await resolveAlert(c, { actorId: IDS.admin, alertId: a1.rows[0]!.id as string, note: "estornado manualmente" });
      const r2 = await resolveAlert(c, { actorId: IDS.admin, alertId: a1.rows[0]!.id as string, note: "outra nota" });
      expect(r1.rows[0]!.id).toBe(r2.rows[0]!.id);
      const row = await c.query("select resolution_note from public.billing_payment_alerts where id = $1", [a1.rows[0]!.id]);
      expect(row.rows[0].resolution_note).toBe("estornado manualmente"); // 2ª chamada não regrava
    });
  });

  it("revisão de segurança: billing_flag_late_payment recusa ator que não se autoidentifica como 'system'", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const paidInv = await asOwnerQuery<{ rows: { id: string }[] }>(
        c,
        `insert into public.invoices (stationery_id, kind, package_id, amount_cents, due_date, status, provider, is_demo, paid_at, paid_amount_cents, idempotency_key)
         values ($1,'credit_package',(select id from public.plan_credit_packages limit 1),1000, current_date, 'paid','fake', true, now(), 1000, $2) returning id`,
        [st, randomUUID()],
      );
      const bad = await flagLatePayment(c, { invoiceId: paidInv.rows[0]!.id, providerChargeId: "fake-late-x", amountCents: 1000, actorRole: "admin" });
      expect(bad.hint).toBe("invalid_input");
    });
  });
});

describe("S23 · imutabilidade (sale_payments, payout_ledger)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("sale_payments e payout_ledger recusam update/delete/truncate", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const r = await confirmSale(c, { actorId: null, actorRole: "system", leadId: lead.id });
      const saleId = r.rows[0]!.id as string;

      const upd = await attemptH(c, "update public.sale_payments set amount_cents = 1 where id = $1", [saleId]);
      expect(upd.code).toBe("42501");
      const del = await attemptH(c, "delete from public.sale_payments where id = $1", [saleId]);
      expect(del.code).toBe("42501");
      const trunc = await attemptH(c, "truncate public.sale_payments");
      expect(trunc.code).toBe("42501");

      const ledgerId = (await c.query("select id from public.payout_ledger where sale_payment_id = $1 limit 1", [saleId])).rows[0].id;
      const updL = await attemptH(c, "update public.payout_ledger set amount_cents = 1 where id = $1", [ledgerId]);
      expect(updL.code).toBe("42501");
      const delL = await attemptH(c, "delete from public.payout_ledger where id = $1", [ledgerId]);
      expect(delL.code).toBe("42501");
      const truncL = await attemptH(c, "truncate public.payout_ledger");
      expect(truncL.code).toBe("42501");
    });
  });
});

describe("S23 · correções da revisão de segurança (Opus, rodada única)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("BLOQUEANTE 1: EXECUTE negado a anon/authenticated em toda função nova; service_role só nas 9 principais", async () => {
    await withSuperuser(async (c) => {
      const main = [
        "payout_confirm_sale(uuid,text,uuid,uuid)",
        "payout_settings_publish(uuid,integer,integer,integer)",
        "payout_school_config_publish(uuid,uuid,text,integer,text,text,text)",
        "payout_batch_create(uuid,uuid,text)",
        "payout_batch_mark_executed(uuid,uuid)",
        "payout_admin_delinquency_list(uuid)",
        "payout_reverse_entry(uuid,uuid,text)",
        "billing_flag_late_payment(uuid,text,text,integer,text)",
        "billing_resolve_payment_alert(uuid,uuid,text)",
      ];
      const triggers = ["payout_settings_guard()", "school_payout_settings_guard()", "payout_batches_guard()", "billing_payment_alerts_guard()", "payout_ledger_no_truncate()"];
      for (const fn of main) {
        for (const role of ["anon", "authenticated"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, `public.${fn}`]);
          expect(r.rows[0]?.ok, `${role} em ${fn}`).toBe(false);
        }
        const svc = await c.query<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'execute') as ok", [`public.${fn}`]);
        expect(svc.rows[0]?.ok, `service_role em ${fn}`).toBe(true);
      }
      for (const fn of triggers) {
        for (const role of ["anon", "authenticated", "service_role"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, `public.${fn}`]);
          expect(r.rows[0]?.ok, `${role} em ${fn}`).toBe(false);
        }
      }
    });
  });

  it("BLOQUEANTE 2: audit_log nunca guarda pix_key nem beneficiary_name de school_payout_settings", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 300, beneficiaryName: "Nome Sensível Beneficiário", pixKey: "chave-pix-secreta@fixture.invalid", pixKeyKind: "email" });
      const rows = await c.query<{ before: unknown; after: unknown }>(
        "select before, after from public.audit_log where entity_table = 'school_payout_settings' order by created_at desc limit 1",
      );
      const text = JSON.stringify(rows.rows[0]);
      expect(text).not.toContain("chave-pix-secreta");
      expect(text).not.toContain("Nome Sensível Beneficiário");
    });
  });

  it("payout_check_admin recusa quando o sub do JWT difere do ator informado (mesmo padrão de billing_check_admin)", async () => {
    await withClaims("system", async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub: IDS.school_member })]);
      const r = await publishPayoutSettings(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 }, IDS.admin);
      expect(r.hint).toBe("forbidden");
    });
  });

  it("payout_confirm_sale: ator 'system' com p_actor_id não-nulo é recusado", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const r = await confirmSale(c, { actorId: IDS.admin, actorRole: "system", leadId: lead.id });
      expect(r.hint).toBe("invalid_input");
    });
  });

  it("payout_confirm_sale: papelaria suspensa é recusada", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "suspended", ownerId: IDS.stationery_member });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const r = await confirmSale(c, { actorId: IDS.stationery_member, actorRole: "stationery_member", leadId: lead.id });
      expect(r.hint).toBe("stationery_unavailable");
    });
  });

  it("IMPORTANTE 5 (conluio): papelaria sozinha nunca cria repasse_due, mesmo escolhendo uma escola — só admin/system", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 300 });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const r = await confirmSale(c, { actorId: IDS.stationery_member, actorRole: "stationery_member", leadId: lead.id, schoolId: school });
      expect(r.error).toBeNull();
      const commission = await ledgerFor(c, "platform", null);
      expect(commission.filter((x) => x.sale_payment_id === r.rows[0]!.id)).toMatchObject([{ entry_type: "commission", amount_cents: 1000 }]);
      const repasse = await ledgerFor(c, "apm", school);
      expect(repasse.filter((x) => x.sale_payment_id === r.rows[0]!.id)).toHaveLength(0); // sem repasse: quem confirmou foi a papelaria
    });
  });

  it("confirmação por admin, com escola, gera commission E repasse_due normalmente", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 300 });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const r = await confirmSale(c, { actorId: IDS.admin, actorRole: "admin", leadId: lead.id, schoolId: school });
      expect(r.error).toBeNull();
      const repasse = await ledgerFor(c, "apm", school);
      expect(repasse.filter((x) => x.sale_payment_id === r.rows[0]!.id)).toMatchObject([{ entry_type: "repasse_due", amount_cents: 300 }]);
    });
  });

  it("IMPORTANTE 4: lead_conversion_signals.pix_confirmed só conta quando confirmado por admin/system", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const leadByMember = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      await confirmSale(c, { actorId: IDS.stationery_member, actorRole: "stationery_member", leadId: leadByMember.id });
      const s1 = await c.query("select pix_confirmed from public.lead_conversion_signals($1)", [leadByMember.id]);
      expect(s1.rows[0].pix_confirmed).toBe(false); // papelaria sozinha não soma o sinal

      const leadByAdmin = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      await confirmSale(c, { actorId: IDS.admin, actorRole: "admin", leadId: leadByAdmin.id });
      const s2 = await c.query("select pix_confirmed from public.lead_conversion_signals($1)", [leadByAdmin.id]);
      expect(s2.rows[0].pix_confirmed).toBe(true);
    });
  });

  it("IMPORTANTE 6: payout_reverse_entry estorna commission e repasse_due, admin-only, idempotente", async () => {
    await withClaims("system", async (c) => {
      await publishPayoutSettingsOk(c, { commissionBps: 1000, graceDays: 5, blockDays: 15 });
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const school = await ensureSchool(c);
      await publishSchoolConfig(c, { schoolId: school, target: "apm", payoutBps: 300 });
      const lead = await leadForSale(c, { stationeryId: st, amountCents: 10000 });
      const sale = await confirmSale(c, { actorId: IDS.admin, actorRole: "admin", leadId: lead.id, schoolId: school });
      const saleId = sale.rows[0]!.id as string;

      const commissionRow = (await ledgerFor(c, "platform", null)).find((r) => r.sale_payment_id === saleId)!;
      const repasseRow = (await ledgerFor(c, "apm", school)).find((r) => r.sale_payment_id === saleId)!;

      const notAdmin = await attemptH(c, "select public.payout_reverse_entry($1::uuid, $2::uuid, $3::text) as id", [commissionRow.id, IDS.parent, "teste"]);
      expect(notAdmin.hint).toBe("forbidden");

      const wrongType = await attemptH(c, "select public.payout_reverse_entry($1::uuid, $2::uuid, $3::text) as id", [randomUUID(), IDS.admin, "teste"]);
      expect(wrongType.hint).toBe("not_found");

      const rev1 = await attemptH(c, "select public.payout_reverse_entry($1::uuid, $2::uuid, $3::text) as id", [commissionRow.id, IDS.admin, "cancelado"]);
      const rev2 = await attemptH(c, "select public.payout_reverse_entry($1::uuid, $2::uuid, $3::text) as id", [commissionRow.id, IDS.admin, "de novo"]);
      expect(rev1.error).toBeNull();
      expect(rev1.rows[0]!.id).toBe(rev2.rows[0]!.id); // idempotente: 1 único estorno

      const revRepasse = await attemptH(c, "select public.payout_reverse_entry($1::uuid, $2::uuid, $3::text) as id", [repasseRow.id, IDS.admin, "cancelado"]);
      expect(revRepasse.error).toBeNull();

      const commissionTotal = await c.query<{ n: string }>(
        "select coalesce(sum(amount_cents),0)::bigint as n from public.payout_ledger where sale_payment_id = $1 and beneficiary_type = 'platform'",
        [saleId],
      );
      expect(commissionTotal.rows[0]!.n).toBe("0"); // 1000 - 1000 (estornado)
      const repasseTotal = await c.query<{ n: string }>(
        "select coalesce(sum(amount_cents),0)::bigint as n from public.payout_ledger where sale_payment_id = $1 and beneficiary_type = 'apm'",
        [saleId],
      );
      expect(repasseTotal.rows[0]!.n).toBe("0"); // 300 - 300 (estornado)
    });
  });
});
