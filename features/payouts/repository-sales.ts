import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import type { PayoutTarget, SalePaymentView } from "./ports";
import { PayoutError } from "./errors";
import { fail, requireActor, requireAdmin, requireStationeryAccess } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

/**
 * Admin SEMPRE chama `payout_admin_validate_sale` (nunca `payout_confirm_sale` diretamente): correção funcional da
 * revisão de segurança (rodada 2, "repasse perdido"). Antes, se a papelaria confirmasse primeiro em Pap03
 * (`confirmed_role = 'stationery_member'`), `payout_confirm_sale` devolvia o id existente por idempotência sem
 * gerar repasse nem contar o sinal Pix — o admin nunca tinha como "promover" essa venda depois. Agora
 * `payout_admin_validate_sale` cobre os dois casos com UMA função: venda ainda não confirmada por ninguém (delega
 * para `payout_confirm_sale` como 'admin', comportamento idêntico ao de antes) ou venda já confirmada só pela
 * papelaria (valida a escola/repasse sem duplicar a comissão já apurada). Papelaria continua chamando
 * `payout_confirm_sale` diretamente (nunca precisa "validar" a própria confirmação).
 */
export async function confirmSale(admin: SupabaseClient, actor: SessionActor, input: { leadId: string; schoolId: string | null }): Promise<string> {
  requireActor(actor);
  if (actor.role === "admin") {
    const { data, error } = await admin.rpc("payout_admin_validate_sale", {
      p_actor_id: actor.userId,
      p_lead_id: input.leadId,
      p_school_id: input.schoolId,
    });
    if (error) fail("confirmar venda", error);
    return z.uuid().parse(data);
  }
  if (actor.role !== "stationery_member") throw new PayoutError("só a papelaria ou a equipe confirma uma venda", "forbidden");
  const { data, error } = await admin.rpc("payout_confirm_sale", {
    p_actor_id: actor.userId,
    p_actor_role: "stationery_member",
    p_lead_id: input.leadId,
    p_school_id: input.schoolId,
  });
  if (error) fail("confirmar venda", error);
  return z.uuid().parse(data);
}

const saleRow = z.object({
  id: z.uuid(),
  lead_id: z.uuid(),
  stationery_id: z.uuid(),
  school_id: z.uuid().nullable(),
  amount_cents: z.number().int(),
  commission_bps_snapshot: z.number().int(),
  is_demo: z.boolean(),
  created_at: z.string(),
  leads: z.object({ code: z.string() }).nullable(),
  stationeries: z.object({ trade_name: z.string() }).nullable(),
  schools: z.object({ name: z.string() }).nullable(),
});

export async function listRecentSalePayments(admin: SupabaseClient, actor: SessionActor, limit: number): Promise<SalePaymentView[]> {
  requireAdmin(actor);
  const { data, error } = await admin
    .from("sale_payments")
    .select("*, leads(code), stationeries(trade_name), schools(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listar vendas confirmadas", error);
  const rows = z.array(saleRow).parse(data ?? []);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: ledgerData, error: ledgerErr } = await admin
    .from("payout_ledger")
    .select("sale_payment_id, entry_type, beneficiary_type, amount_cents")
    .in("sale_payment_id", ids);
  if (ledgerErr) fail("ler lançamentos das vendas", ledgerErr);
  const ledgerRows = z
    .array(z.object({ sale_payment_id: z.uuid().nullable(), entry_type: z.string(), beneficiary_type: z.string(), amount_cents: z.number().int() }))
    .parse(ledgerData ?? []);
  return rows.map((r) => {
    const own = ledgerRows.filter((l) => l.sale_payment_id === r.id);
    const commission = own.find((l) => l.entry_type === "commission")?.amount_cents ?? 0;
    const repasse = own.find((l) => l.entry_type === "repasse_due");
    return {
      id: r.id,
      leadId: r.lead_id,
      leadCode: r.leads?.code ?? "—",
      stationeryId: r.stationery_id,
      stationeryName: r.stationeries?.trade_name ?? "Papelaria",
      schoolId: r.school_id,
      schoolName: r.schools?.name ?? null,
      amountCents: r.amount_cents,
      commissionCents: commission,
      repasseCents: repasse?.amount_cents ?? 0,
      repasseTarget: (repasse?.beneficiary_type as PayoutTarget | undefined) ?? null,
      isDemo: r.is_demo,
      createdAt: new Date(r.created_at),
    };
  });
}

export async function getSaleForLead(admin: SupabaseClient, actor: SessionActor, leadId: string): Promise<SalePaymentView | null> {
  requireActor(actor);
  // revisão de segurança: confere o vínculo com a papelaria do LEAD (não só o papel do ator) antes de ler
  // qualquer coisa — sem isso, um stationery_member conseguia ler valor/comissão/repasse de um lead de OUTRA
  // papelaria só trocando o leadId (mesma classe de vazamento de listConfirmableLeadsForStationery, já corrigida).
  const { data: leadRow, error: leadErr } = await admin.from("leads").select("stationery_id").eq("id", leadId).maybeSingle();
  if (leadErr) fail("ler papelaria do lead", leadErr);
  if (!leadRow) return null;
  await requireStationeryAccess(admin, actor, z.object({ stationery_id: z.uuid() }).parse(leadRow).stationery_id);

  const { data, error } = await admin.from("sale_payments").select("*, leads(code), stationeries(trade_name), schools(name)").eq("lead_id", leadId).maybeSingle();
  if (error) fail("ler venda confirmada do lead", error);
  if (!data) return null;
  const r = saleRow.parse(data);
  const { data: ledgerData, error: ledgerErr } = await admin.from("payout_ledger").select("entry_type, beneficiary_type, amount_cents").eq("sale_payment_id", r.id);
  if (ledgerErr) fail("ler lançamentos da venda", ledgerErr);
  const ledgerRows = z.array(z.object({ entry_type: z.string(), beneficiary_type: z.string(), amount_cents: z.number().int() })).parse(ledgerData ?? []);
  const commission = ledgerRows.find((l) => l.entry_type === "commission")?.amount_cents ?? 0;
  const repasse = ledgerRows.find((l) => l.entry_type === "repasse_due");
  return {
    id: r.id,
    leadId: r.lead_id,
    leadCode: r.leads?.code ?? "—",
    stationeryId: r.stationery_id,
    stationeryName: r.stationeries?.trade_name ?? "Papelaria",
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? null,
    amountCents: r.amount_cents,
    commissionCents: commission,
    repasseCents: repasse?.amount_cents ?? 0,
    repasseTarget: (repasse?.beneficiary_type as PayoutTarget | undefined) ?? null,
    isDemo: r.is_demo,
    createdAt: new Date(r.created_at),
  };
}

const confirmableLeadRow = z.object({ id: z.uuid(), code: z.string(), declared_sale_cents: z.number().int().nullable(), school_name: z.string() });

export async function listConfirmableLeadsForStationery(
  admin: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
): Promise<{ leadId: string; leadCode: string; amountCents: number; schoolNameHint: string }[]> {
  await requireStationeryAccess(admin, actor, stationeryId);
  const { data, error } = await admin
    .from("leads")
    .select("id, code, declared_sale_cents, school_name")
    .eq("stationery_id", stationeryId)
    .eq("status", "converted")
    .not("declared_sale_cents", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail("listar vendas confirmáveis", error);
  const leads = z.array(confirmableLeadRow).parse(data ?? []);
  if (leads.length === 0) return [];
  const ids = leads.map((l) => l.id);
  const { data: already, error: alreadyErr } = await admin.from("sale_payments").select("lead_id").in("lead_id", ids);
  if (alreadyErr) fail("conferir vendas já confirmadas", alreadyErr);
  const done = new Set(z.array(z.object({ lead_id: z.uuid() })).parse(already ?? []).map((r) => r.lead_id));
  return leads
    .filter((l) => !done.has(l.id) && l.declared_sale_cents !== null)
    .map((l) => ({ leadId: l.id, leadCode: l.code, amountCents: l.declared_sale_cents as number, schoolNameHint: l.school_name }));
}

const confirmableAdminRow = confirmableLeadRow.extend({ stationeries: z.object({ trade_name: z.string() }).nullable() });

/**
 * Correção funcional (revisão de segurança, rodada 2, "repasse perdido"): antes, uma venda já confirmada pela
 * própria papelaria (`sale_payments.confirmed_role = 'stationery_member'`) saía desta fila para sempre — o admin
 * nunca a via de novo, então nunca gerava repasse nem contava o sinal Pix para ela. Agora só sai da fila quando
 * está PLENAMENTE processada: confirmada direto por admin/system, OU confirmada pela papelaria e já validada
 * (`sale_payment_admin_validations`). `awaitingValidation` diz à tela qual dos dois casos é (rótulo diferente).
 */
export async function listConfirmableSalesForAdmin(
  admin: SupabaseClient,
  actor: SessionActor,
): Promise<{ leadId: string; leadCode: string; stationeryName: string; amountCents: number; schoolNameHint: string; awaitingValidation: boolean }[]> {
  requireAdmin(actor);
  const { data, error } = await admin
    .from("leads")
    .select("id, code, declared_sale_cents, school_name, stationeries(trade_name)")
    .eq("status", "converted")
    .not("declared_sale_cents", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) fail("listar vendas confirmáveis", error);
  const leads = z.array(confirmableAdminRow).parse(data ?? []);
  if (leads.length === 0) return [];
  const ids = leads.map((l) => l.id);
  const { data: sales, error: salesErr } = await admin.from("sale_payments").select("id, lead_id, confirmed_role").in("lead_id", ids);
  if (salesErr) fail("conferir vendas já confirmadas", salesErr);
  const saleRows = z.array(z.object({ id: z.uuid(), lead_id: z.uuid(), confirmed_role: z.string() })).parse(sales ?? []);
  const saleByLead = new Map(saleRows.map((s) => [s.lead_id, s]));
  const saleIds = saleRows.map((s) => s.id);
  let validatedSaleIds = new Set<string>();
  if (saleIds.length > 0) {
    const { data: validations, error: valErr } = await admin.from("sale_payment_admin_validations").select("sale_payment_id").in("sale_payment_id", saleIds);
    if (valErr) fail("conferir validações do admin", valErr);
    validatedSaleIds = new Set(z.array(z.object({ sale_payment_id: z.uuid() })).parse(validations ?? []).map((v) => v.sale_payment_id));
  }
  return leads
    .filter((l) => l.declared_sale_cents !== null)
    .map((l) => ({ l, sale: saleByLead.get(l.id) }))
    .filter(({ sale }) => {
      if (!sale) return true; // ninguém confirmou ainda
      if (sale.confirmed_role === "admin" || sale.confirmed_role === "system") return false; // já processada por completo
      return !validatedSaleIds.has(sale.id); // só a papelaria confirmou; ainda falta o admin validar
    })
    .map(({ l, sale }) => ({
      leadId: l.id,
      leadCode: l.code,
      stationeryName: l.stationeries?.trade_name ?? "Papelaria",
      amountCents: l.declared_sale_cents as number,
      schoolNameHint: l.school_name,
      awaitingValidation: Boolean(sale),
    }));
}
