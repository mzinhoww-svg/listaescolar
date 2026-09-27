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
} from "./billing-fixtures";
import { attemptH, cleanupUsers, IDS, inTx, seedCart, seedLead, seedStationery, seedUsers, withClaims } from "./helpers";

/** Recarrega uma carteira REAL (provedor pix, já que fake/demo são só para is_demo) e devolve o valor creditado. */
async function topUpReal(c: Client, o: { actor: string; stationery: string; pkg: string }): Promise<number> {
  const inv = await createPackageInvoice(c, { ...o, provider: "pix" });
  if (inv.error) throw new Error(`fatura: ${inv.error} (${inv.hint})`);
  const invoiceId = inv.rows[0]!.id as string;
  const amount = Number((await c.query("select amount_cents from public.invoices where id = $1", [invoiceId])).rows[0].amount_cents);
  const ok = await confirmInvoice(c, { invoice: invoiceId, provider: "pix", amount });
  if (ok.error) throw new Error(`confirmar: ${ok.error} (${ok.hint})`);
  return amount;
}

async function confirmPurchase(c: Client, o: { lead: string; actor?: string; answer?: string }) {
  return attemptH(c, "select public.lead_confirm_purchase($1::uuid, $2::uuid, $3::text) as id", [
    o.lead,
    o.actor ?? IDS.parent,
    o.answer ?? "bought_here",
  ]);
}

async function signals(c: Client, leadId: string) {
  const r = await c.query("select * from public.lead_conversion_signals($1::uuid)", [leadId]);
  return r.rows[0] as {
    stationery_confirmed: boolean;
    parent_confirmed: boolean;
    pix_confirmed: boolean;
    signal_count: number;
    confirmed: boolean;
  };
}

async function openDispute(c: Client, o: { lead: string; actor: string; reason?: string; detail?: string | null }) {
  return attemptH(c, "select public.lead_dispute_open($1::uuid, $2::uuid, $3::text, $4::text) as id", [
    o.lead,
    o.actor,
    o.reason ?? "wrong_number",
    o.detail ?? null,
  ]);
}

async function resolveDispute(c: Client, o: { dispute: string; actor: string | null; role: string; decision: string; reason?: string | null }) {
  return attemptH(c, "select public.lead_dispute_resolve($1::uuid, $2::uuid, $3::text, $4::text, $5::text) as id", [
    o.dispute,
    o.actor,
    o.role,
    o.decision,
    o.reason ?? null,
  ]);
}

async function createReview(c: Client, o: { lead: string; actor?: string; rating?: number; tags?: string[]; comment?: string | null }) {
  return attemptH(c, "select public.lead_review_create($1::uuid, $2::uuid, $3::int, $4::text[], $5::text) as id", [
    o.lead,
    o.actor ?? IDS.parent,
    o.rating ?? 5,
    o.tags ?? [],
    o.comment ?? null,
  ]);
}

async function hideReview(c: Client, o: { review: string; actor: string | null; reason?: string }) {
  return attemptH(c, "select public.lead_review_hide($1::uuid, $2::uuid, $3::text) as id", [o.review, o.actor, o.reason ?? "personal_data"]);
}

describe("S22 · confirmação, avaliação e contestação de lead", () => {
  beforeAll(async () => {
    await seedUsers();
    await ensureTestBillingPlan();
  });
  afterAll(cleanupUsers);

  it("tabelas existem com RLS habilitada", async () => {
    await withClaims("system", async (c) => {
      const r = await c.query(
        `select relname, relrowsecurity from pg_class
          where relnamespace = 'public'::regnamespace
            and relname in ('lead_purchase_confirmations', 'lead_reviews', 'lead_disputes')
          order by 1`,
      );
      expect(r.rows).toEqual([
        { relname: "lead_disputes", relrowsecurity: true },
        { relname: "lead_purchase_confirmations", relrowsecurity: true },
        { relname: "lead_reviews", relrowsecurity: true },
      ]);
    });
  });

  describe("lead_confirm_purchase", () => {
    it("o solicitante confirma e pode mudar de resposta (upsert idempotente por lead)", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const first = await confirmPurchase(c, { lead: lead.id, answer: "not_yet" });
        expect(first.error).toBeNull();
        const second = await confirmPurchase(c, { lead: lead.id, answer: "bought_here" });
        expect(second.error).toBeNull();
        const rows = await c.query("select answer from public.lead_purchase_confirmations where lead_id = $1", [lead.id]);
        expect(rows.rows).toEqual([{ answer: "bought_here" }]);
      });
    });

    it("ator que não é o solicitante -> forbidden; resposta inválida -> invalid_input", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const wrong = await confirmPurchase(c, { lead: lead.id, actor: IDS.spare });
        expect(wrong.hint).toBe("forbidden");
        const bad = await confirmPurchase(c, { lead: lead.id, answer: "yes" });
        expect(bad.hint).toBe("invalid_input");
      });
    });

    it("membro da própria papelaria do lead -> forbidden (autoconversão), mesmo que requester_id coincida", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const selfLead = await seedLead(c, { stationeryId: st, requesterId: IDS.stationery_member });
        const r = await confirmPurchase(c, { lead: selfLead.id, actor: IDS.stationery_member });
        expect(r.hint).toBe("forbidden");
      });
    });

    it("EXECUTE negado a anon/authenticated", async () => {
      await withClaims("parent", async (c) => {
        const r = await attemptH(c, "select public.lead_confirm_purchase($1::uuid, $2::uuid, $3::text) as id", [
          "00000000-0000-4000-8000-000000000099",
          IDS.parent,
          "bought_here",
        ]);
        expect(r.code).toBe("42501");
        expect(r.error).toMatch(/permission denied/i);
      });
      await withClaims("anon", async (c) => {
        const r = await attemptH(c, "select public.lead_confirm_purchase($1::uuid, $2::uuid, $3::text) as id", [
          "00000000-0000-4000-8000-000000000099",
          null,
          "bought_here",
        ]);
        expect(r.code).toBe("42501");
      });
    });
  });

  describe("lead_conversion_signals · regra 2 de 3", () => {
    it("0 sinal -> não confirmado; 1 sinal (só a papelaria) -> ainda não confirmado; 2 sinais -> confirmado; pix sempre ausente", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "quote_sent" });

        let s = await signals(c, lead.id);
        expect(s).toMatchObject({ stationery_confirmed: false, parent_confirmed: false, pix_confirmed: false, signal_count: 0, confirmed: false });

        const declared = await attemptH(c, "select public.lead_transition($1::uuid, 'converted'::public.lead_status, $2::uuid, 'stationery', null, null) as st", [
          lead.id,
          IDS.stationery_member,
        ]);
        expect(declared.error).toBeNull();
        s = await signals(c, lead.id);
        expect(s).toMatchObject({ stationery_confirmed: true, parent_confirmed: false, signal_count: 1, confirmed: false });

        await confirmPurchase(c, { lead: lead.id, answer: "bought_here" });
        s = await signals(c, lead.id);
        expect(s).toMatchObject({ stationery_confirmed: true, parent_confirmed: true, pix_confirmed: false, signal_count: 2, confirmed: true });
      });
    });

    it("só o pai confirma (papelaria não declarou) -> 1 sinal, não confirmado", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        await confirmPurchase(c, { lead: lead.id, answer: "bought_here" });
        const s = await signals(c, lead.id);
        expect(s).toMatchObject({ signal_count: 1, confirmed: false });
      });
    });
  });

  describe("lead_review_create", () => {
    it("o solicitante avalia com nota e etiquetas (compra confirmada); segunda avaliação do mesmo lead -> invalid_state", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        await confirmPurchase(c, { lead: lead.id, answer: "bought_here" });
        const ok = await createReview(c, { lead: lead.id, rating: 4, tags: ["bom_atendimento", "entrega_rapida"] });
        expect(ok.error).toBeNull();
        const dup = await createReview(c, { lead: lead.id, rating: 5 });
        expect(dup.hint).toBe("invalid_state");
        const row = await c.query("select rating, tags, status from public.lead_reviews where lead_id = $1", [lead.id]);
        expect(row.rows[0]).toEqual({ rating: 4, tags: ["bom_atendimento", "entrega_rapida"], status: "published" });
      });
    });

    it("comentário com e-mail ou telefone/CPF -> personal_data_rejected; etiqueta fora do vocabulário -> invalid_input", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const l1 = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const l2 = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const l3 = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        for (const l of [l1, l2, l3]) await confirmPurchase(c, { lead: l.id, answer: "bought_here" });
        const email = await createReview(c, { lead: l1.id, comment: "me chama em fulano@exemplo.com" });
        expect(email.hint).toBe("personal_data_rejected");
        const phone = await createReview(c, { lead: l2.id, comment: "meu whatsapp é 65 99999-0000 pra combinar" });
        expect(phone.hint).toBe("personal_data_rejected");
        const clean = await createReview(c, { lead: l3.id, comment: "atendimento rápido e educado, recomendo" });
        expect(clean.error).toBeNull();
        const l4 = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        await confirmPurchase(c, { lead: l4.id, answer: "bought_here" });
        const badTag = await createReview(c, { lead: l4.id, tags: ["nota_10"] });
        expect(badTag.hint).toBe("invalid_input");
      });
    });

    it("comentário com número por extenso ou 'arroba' ofuscado também é recusado (heurística reforçada)", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const l1 = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const l2 = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        for (const l of [l1, l2]) await confirmPurchase(c, { lead: l.id, answer: "bought_here" });
        const spelled = await createReview(c, { lead: l1.id, comment: "meu numero e zero um dois tres quatro cinco seis sete oito" });
        expect(spelled.hint).toBe("personal_data_rejected");
        const obfuscated = await createReview(c, { lead: l2.id, comment: "me chama fulano arroba exemplo.com" });
        expect(obfuscated.hint).toBe("personal_data_rejected");
      });
    });

    it("ator diferente do solicitante -> forbidden; membro da própria papelaria -> forbidden (autoavaliação), mesmo com sinal de compra", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const r = await createReview(c, { lead: lead.id, actor: IDS.spare });
        expect(r.hint).toBe("forbidden");
        // requester_id coincide com o membro por acidente (a 0303/S14 já aplicada não tem esse bloqueio; Ruling no
        // ledger): mesmo com o lead já `converted` (sinal de compra presente), a autoavaliação é recusada.
        const selfLead = await seedLead(c, { stationeryId: st, requesterId: IDS.stationery_member, status: "converted" });
        expect((await createReview(c, { lead: selfLead.id, actor: IDS.stationery_member })).hint).toBe("forbidden");
      });
    });

    it("lead cancelado não pode ser avaliado; lead sem sinal de compra -> purchase_not_confirmed; declarado 'Vendi' basta", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const cancelled = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "cancelled" });
        expect((await createReview(c, { lead: cancelled.id })).hint).toBe("invalid_state");

        const noSignal = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        expect((await createReview(c, { lead: noSignal.id })).hint).toBe("purchase_not_confirmed");

        const declared = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
        expect((await createReview(c, { lead: declared.id })).error).toBeNull();
      });
    });
  });

  describe("lead_dispute_open · prazo de 72h", () => {
    it("dentro do prazo (lead criado há 71h59) -> abre; membro de outra papelaria -> forbidden; motivo inválido -> invalid_input", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const other = await seedStationery(c, { status: "active", ownerId: IDS.school_member });
        const lead = await seedLead(c, {
          stationeryId: st,
          requesterId: IDS.parent,
          overrides: { created_at: new Date(Date.now() - (71 * 60 + 59) * 60_000).toISOString() },
        });
        const wrong = await openDispute(c, { lead: lead.id, actor: IDS.school_member });
        expect(wrong.hint).toBe("forbidden");
        const badReason = await openDispute(c, { lead: lead.id, actor: IDS.stationery_member, reason: "nao_gostei" });
        expect(badReason.hint).toBe("invalid_input");
        const ok = await openDispute(c, { lead: lead.id, actor: IDS.stationery_member, reason: "incomplete_list" });
        expect(ok.error).toBeNull();
        const again = await openDispute(c, { lead: lead.id, actor: IDS.stationery_member });
        expect(again.hint).toBe("already_disputed");
        void other;
      });
    });

    it("fora do prazo (lead criado há mais de 72h) -> dispute_expired", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const lead = await seedLead(c, {
          stationeryId: st,
          requesterId: IDS.parent,
          overrides: { created_at: new Date(Date.now() - (72 * 60 + 1) * 60_000).toISOString() },
        });
        const r = await openDispute(c, { lead: lead.id, actor: IDS.stationery_member });
        expect(r.hint).toBe("dispute_expired");
      });
    });

    it("lead já vendido (declarado 'Vendi' ou confirmado pelo pai) -> lead_sold", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const declared = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
        expect((await openDispute(c, { lead: declared.id, actor: IDS.stationery_member })).hint).toBe("lead_sold");

        const confirmed = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        await confirmPurchase(c, { lead: confirmed.id, answer: "bought_here" });
        expect((await openDispute(c, { lead: confirmed.id, actor: IDS.stationery_member })).hint).toBe("lead_sold");
      });
    });

    it("papelaria suspensa -> stationery_unavailable", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "suspended", ownerId: IDS.stationery_member });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const r = await openDispute(c, { lead: lead.id, actor: IDS.stationery_member });
        expect(r.hint).toBe("stationery_unavailable");
      });
    });
  });

  describe("lead_dispute_resolve · estorno idempotente no razão", () => {
    it("aceita: estorna o débito uma única vez mesmo com 2 chamadas; rejeitada: não estorna", async () => {
      await withClaims("system", async (c) => {
        await publishPlanOk(c, plan({ ...CHARGING_PLAN, free_leads: 0 }));
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: false } });
        await topUpReal(c, { actor: IDS.stationery_member, stationery: st, pkg: await packageOf(c, await activePlanId(c)) });
        const cart = await seedCart(c, IDS.parent, false);
        const created = await leadCreate(c, { cart, stationery: st, itemCount: 2, isDemo: false });
        expect(created.error).toBeNull();
        const leadId = created.rows[0]!.lead_id as string;
        const before = await ledgerOf(c, st);
        expect(before).toHaveLength(2); // topup + lead_debit
        const debit = before.find((r) => r.entry_type === "lead_debit")!;
        expect(debit).toBeDefined();

        const dispute = await openDispute(c, { lead: leadId, actor: IDS.stationery_member, reason: "duplicate" });
        expect(dispute.error).toBeNull();
        const disputeId = dispute.rows[0]!.id as string;

        const first = await resolveDispute(c, { dispute: disputeId, actor: IDS.admin, role: "admin", decision: "accepted" });
        expect(first.error).toBeNull();
        const second = await resolveDispute(c, { dispute: disputeId, actor: IDS.admin, role: "admin", decision: "accepted" });
        expect(second.error).toBeNull();
        expect(second.rows[0]!.id).toBe(first.rows[0]!.id);

        const after = await ledgerOf(c, st);
        const reversals = after.filter((r) => r.reverses_entry_id === debit.id);
        expect(reversals).toHaveLength(1); // idempotente: um único estorno mesmo com 2 chamadas de accepted
        await assertLedgerInvariant(c, st);

        const disputeRow = await c.query("select status, reversed_entry_id from public.lead_disputes where id = $1", [disputeId]);
        expect(disputeRow.rows[0]).toMatchObject({ status: "accepted", reversed_entry_id: reversals[0]!.id });
        // revisão de segurança: reversed_entry_id, quando não nulo, sempre aponta para uma linha real do razão.
        const reversedRow = await c.query("select id, entry_type from public.credit_ledger where id = $1", [disputeRow.rows[0].reversed_entry_id]);
        expect(reversedRow.rows).toHaveLength(1);
        expect(reversedRow.rows[0].entry_type).toBe("reversal");

        const conflicting = await resolveDispute(c, { dispute: disputeId, actor: IDS.admin, role: "admin", decision: "rejected" });
        expect(conflicting.hint).toBe("invalid_state");
      });
    });

    it("rejeitada: nenhum estorno; ator não-admin -> forbidden", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const dispute = await openDispute(c, { lead: lead.id, actor: IDS.stationery_member, reason: "out_of_area" });
        const disputeId = dispute.rows[0]!.id as string;

        const notAdmin = await resolveDispute(c, { dispute: disputeId, actor: IDS.parent, role: "admin", decision: "accepted" });
        expect(notAdmin.hint).toBe("forbidden");

        const rejected = await resolveDispute(c, { dispute: disputeId, actor: IDS.admin, role: "admin", decision: "rejected" });
        expect(rejected.error).toBeNull();
        const row = await c.query("select status, reversed_entry_id from public.lead_disputes where id = $1", [disputeId]);
        expect(row.rows[0]).toEqual({ status: "rejected", reversed_entry_id: null });
      });
    });

    it("lead demo (sem lançamento a estornar) -> aceita sem erro, reversed_entry_id nulo", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, overrides: { is_demo: true } });
        const dispute = await openDispute(c, { lead: lead.id, actor: IDS.stationery_member });
        const disputeId = dispute.rows[0]!.id as string;
        const resolved = await resolveDispute(c, { dispute: disputeId, actor: null, role: "system", decision: "accepted" });
        expect(resolved.error).toBeNull();
        const row = await c.query("select status, reversed_entry_id from public.lead_disputes where id = $1", [disputeId]);
        expect(row.rows[0]).toEqual({ status: "accepted", reversed_entry_id: null });
      });
    });
  });

  describe("lead_review_hide · moderação (revisão de segurança)", () => {
    async function publishedReview(c: Client): Promise<string> {
      const st = await seedStationery(c, { status: "active" });
      const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
      const r = await createReview(c, { lead: lead.id });
      return r.rows[0]!.id as string;
    }

    it("admin oculta com motivo de lista fechada; ocultar de novo é idempotente (mesmo id, sem erro)", async () => {
      await withClaims("system", async (c) => {
        const reviewId = await publishedReview(c);
        const first = await hideReview(c, { review: reviewId, actor: IDS.admin, reason: "personal_data" });
        expect(first.error).toBeNull();
        const row = await c.query("select status, hidden_reason, hidden_by from public.lead_reviews where id = $1", [reviewId]);
        expect(row.rows[0]).toEqual({ status: "hidden", hidden_reason: "personal_data", hidden_by: IDS.admin });
        const second = await hideReview(c, { review: reviewId, actor: IDS.admin, reason: "offensive" });
        expect(second.error).toBeNull();
        expect(second.rows[0]!.id).toBe(reviewId);
        const rowAfter = await c.query("select hidden_reason from public.lead_reviews where id = $1", [reviewId]);
        expect(rowAfter.rows[0].hidden_reason).toBe("personal_data"); // 2ª chamada não regrava (idempotente).
      });
    });

    it("não-admin -> forbidden; motivo fora da lista fechada -> invalid_input; review inexistente -> not_found", async () => {
      await withClaims("system", async (c) => {
        const reviewId = await publishedReview(c);
        expect((await hideReview(c, { review: reviewId, actor: IDS.parent })).hint).toBe("forbidden");
        expect((await hideReview(c, { review: reviewId, actor: IDS.admin, reason: "porque sim" })).hint).toBe("invalid_input");
        expect((await hideReview(c, { review: "00000000-0000-4000-8000-000000000099", actor: IDS.admin })).hint).toBe("not_found");
      });
    });

    it("avaliação oculta some da leitura pública mas continua visível ao admin/papelaria", async () => {
      // withClaims abre uma transação/conexão própria: trocar de papel DENTRO da mesma transação (em vez de aninhar
      // withClaims, que não veria os dados ainda não commitados) é o mesmo padrão de `asOwner` em helpers.ts.
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
        const reviewId = (await createReview(c, { lead: lead.id })).rows[0]!.id as string;
        await hideReview(c, { review: reviewId, actor: IDS.admin });

        await c.query("set local role anon");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
        const asAnon = await attemptH(c, "select id from public.lead_reviews where id = $1", [reviewId]);
        expect(asAnon.rowCount).toBe(0);

        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.stationery_member })]);
        const asMember = await attemptH(c, "select id from public.lead_reviews where id = $1", [reviewId]);
        expect(asMember.rowCount).toBe(1);

        await c.query("set local role service_role");
      });
    });
  });

  describe("imutabilidade e grants", () => {
    it("update/delete direto em lead_disputes é bloqueado, inclusive para service_role", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
        const dispute = await openDispute(c, { lead: lead.id, actor: IDS.stationery_member });
        const disputeId = dispute.rows[0]!.id as string;
        const upd = await attemptH(c, "update public.lead_disputes set reason = 'duplicate' where id = $1", [disputeId]);
        expect(upd.code).toBe("42501");
        const del = await attemptH(c, "delete from public.lead_disputes where id = $1", [disputeId]);
        expect(del.code).toBe("42501");
      });
    });

    it("update/delete direto em lead_reviews é bloqueado (fora de lead_review_hide), inclusive para service_role", async () => {
      await withClaims("system", async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
        const reviewId = (await createReview(c, { lead: lead.id })).rows[0]!.id as string;
        const upd = await attemptH(c, "update public.lead_reviews set rating = 1 where id = $1", [reviewId]);
        expect(upd.code).toBe("42501");
        const del = await attemptH(c, "delete from public.lead_reviews where id = $1", [reviewId]);
        expect(del.code).toBe("42501");
      });
    });

    it("EXECUTE das funções de escrita negado a anon/authenticated", async () => {
      const fns = [
        "select public.lead_dispute_open('00000000-0000-4000-8000-000000000099'::uuid, $1::uuid, 'wrong_number', null)",
        "select public.lead_dispute_resolve('00000000-0000-4000-8000-000000000099'::uuid, $1::uuid, 'admin', 'accepted', null)",
        "select public.lead_review_create('00000000-0000-4000-8000-000000000099'::uuid, $1::uuid, 5, '{}'::text[], null)",
        "select public.lead_review_hide('00000000-0000-4000-8000-000000000099'::uuid, $1::uuid, 'personal_data')",
      ];
      await withClaims("stationery_member", async (c) => {
        for (const sql of fns) {
          const r = await attemptH(c, sql, [IDS.stationery_member]);
          expect(r.code).toBe("42501");
        }
      });
    });
  });
});

// S23: correções aditivas de segurança sobre a 0402 (já no staging; nada aqui edita esse arquivo, só cobre com
// teste o que a 0403 corrigiu via revoke/create or replace).
describe("S23 · correções aditivas de segurança sobre a 0402 (D-108–D-111)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("D-108: authenticated não lê mais lead_id de avaliação publicada (só campos agregados/próprios)", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
      const reviewId = (await createReview(c, { lead: lead.id })).rows[0]!.id as string;

      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.school_member })]);
      const leadIdRead = await attemptH(c, "select lead_id from public.lead_reviews where id = $1", [reviewId]);
      expect(leadIdRead.error).toMatch(/permission denied/);
      const otherColsRead = await attemptH(c, "select id, stationery_id, rating, tags, status from public.lead_reviews where id = $1", [reviewId]);
      expect(otherColsRead.error).toBeNull();
      await c.query("set local role service_role");
    });
  });

  it("D-109: o guard de lead_reviews recusa update fora da transição publicada->oculta, mesmo para o dono do banco (não é só o grant negado)", async () => {
    await inTx(async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
      const reviewId = (await createReview(c, { lead: lead.id })).rows[0]!.id as string;
      // Postgres superuser: não há grant para checar aqui (postgres é dono da tabela); o 42501 só pode vir do gatilho.
      const bad = await attemptH(c, "update public.lead_reviews set rating = 1 where id = $1", [reviewId]);
      expect(bad.code).toBe("42501");
      expect(bad.error).toMatch(/imutável/);
    });
  });

  it("D-109: o guard aceita a exceção do ON DELETE SET NULL (exclusão de conta do autor) sem bloquear", async () => {
    await inTx(async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
      const reviewId = (await createReview(c, { lead: lead.id, actor: IDS.parent })).rows[0]!.id as string;
      await c.query("delete from public.profiles where id = $1", [IDS.parent]);
      const row = await c.query("select actor_id from public.lead_reviews where id = $1", [reviewId]);
      expect(row.rows[0].actor_id).toBeNull();
    });
  });

  it("D-110: lead_review_hide com p_reason nulo devolve hint invalid_input (não um erro de CHECK cru)", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
      const reviewId = (await createReview(c, { lead: lead.id })).rows[0]!.id as string;
      const r = await attemptH(c, "select public.lead_review_hide($1::uuid, $2::uuid, null::text) as id", [reviewId, IDS.admin]);
      expect(r.hint).toBe("invalid_input");
    });
  });

  it("D-111: lead_review_hide recusa quando o sub do JWT difere do ator informado", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const lead = await seedLead(c, { stationeryId: st, requesterId: IDS.parent, status: "converted" });
      const reviewId = (await createReview(c, { lead: lead.id })).rows[0]!.id as string;
      // service_role de verdade (a EXECUTE grant continua valendo), mas com um `sub` de JWT diferente do ator
      // informado — a mesma checagem que as demais funções de escrita desta trilha já fazem.
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub: IDS.school_member })]);
      const r = await hideReview(c, { review: reviewId, actor: IDS.admin });
      expect(r.hint).toBe("forbidden");
    });
  });
});
