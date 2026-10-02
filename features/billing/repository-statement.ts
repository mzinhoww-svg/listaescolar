import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import type { InvoiceView, LedgerEntryView, SeasonPassView } from "./ports";
import { fail, requireMemberOrAdmin } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

const ledgerRow = z.object({
  id: z.uuid(),
  entry_type: z.enum(["topup", "lead_debit", "free_lead", "pass_lead", "reversal"]),
  amount_cents: z.number().int(),
  balance_after_cents: z.number().int(),
  lead_id: z.uuid().nullable(),
  invoice_id: z.uuid().nullable(),
  item_count: z.number().int().nullable(),
  reason: z.string().nullable(),
  created_at: z.string(),
});

async function walletIdFor(admin: SupabaseClient, stationeryId: string): Promise<string | null> {
  const { data, error } = await admin.from("stationery_wallets").select("id").eq("stationery_id", stationeryId).maybeSingle();
  if (error) fail("ler carteira", error);
  return data ? z.object({ id: z.uuid() }).parse(data).id : null;
}

export async function listStatement(admin: SupabaseClient, actor: SessionActor, stationeryId: string, limit = 200): Promise<LedgerEntryView[]> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const walletId = await walletIdFor(admin, stationeryId);
  if (!walletId) return [];
  const { data, error } = await admin
    .from("credit_ledger")
    .select("id, entry_type, amount_cents, balance_after_cents, lead_id, invoice_id, item_count, reason, created_at")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) fail("ler extrato", error);
  const rows = z.array(ledgerRow).parse(data ?? []);

  const { data: reversedRows, error: reversedErr } = await admin.from("credit_ledger").select("reverses_entry_id").not("reverses_entry_id", "is", null).eq("wallet_id", walletId);
  if (reversedErr) fail("ler estornos", reversedErr);
  const reversedIds = new Set(z.array(z.object({ reverses_entry_id: z.uuid() })).parse(reversedRows ?? []).map((r) => r.reverses_entry_id));

  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter((v): v is string => v !== null))];
  const leadsById = new Map<string, { code: string; schoolName: string }>();
  if (leadIds.length > 0) {
    const { data: leadsData, error: leadsErr } = await admin.from("leads").select("id, code, school_name").in("id", leadIds);
    if (leadsErr) fail("ler leads do extrato", leadsErr);
    for (const l of z.array(z.object({ id: z.uuid(), code: z.string(), school_name: z.string() })).parse(leadsData ?? [])) {
      leadsById.set(l.id, { code: l.code, schoolName: l.school_name });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    entryType: r.entry_type,
    amountCents: r.amount_cents,
    balanceAfterCents: r.balance_after_cents,
    leadId: r.lead_id,
    leadCode: r.lead_id ? leadsById.get(r.lead_id)?.code ?? null : null,
    schoolName: r.lead_id ? leadsById.get(r.lead_id)?.schoolName ?? null : null,
    invoiceId: r.invoice_id,
    itemCount: r.item_count,
    reason: r.reason,
    reversed: reversedIds.has(r.id),
    createdAt: new Date(r.created_at),
  }));
}

const invoiceRow = z.object({
  id: z.uuid(),
  kind: z.enum(["credit_package", "season_pass_installment"]),
  season_pass_id: z.uuid().nullable(),
  installment_no: z.number().int().nullable(),
  amount_cents: z.number().int(),
  due_date: z.string(),
  status: z.enum(["open", "paid", "cancelled"]),
  provider: z.enum(["fake", "demo", "pix"]),
  is_demo: z.boolean(),
  provider_charge_id: z.string().nullable(),
  pix_copy_paste: z.string().nullable(),
  charge_expires_at: z.string().nullable(),
  paid_at: z.string().nullable(),
  paid_amount_cents: z.number().int().nullable(),
  created_at: z.string(),
});

function toInvoiceView(r: z.infer<typeof invoiceRow>): InvoiceView {
  return {
    id: r.id,
    kind: r.kind,
    seasonPassId: r.season_pass_id,
    installmentNo: r.installment_no,
    amountCents: r.amount_cents,
    dueDate: r.due_date,
    status: r.status,
    provider: r.provider,
    isDemo: r.is_demo,
    providerChargeId: r.provider_charge_id,
    pixCopyPaste: r.pix_copy_paste,
    chargeExpiresAt: r.charge_expires_at ? new Date(r.charge_expires_at) : null,
    paidAt: r.paid_at ? new Date(r.paid_at) : null,
    paidAmountCents: r.paid_amount_cents,
    createdAt: new Date(r.created_at),
  };
}

const INVOICE_COLUMNS =
  "id, kind, season_pass_id, installment_no, amount_cents, due_date, status, provider, is_demo, provider_charge_id, pix_copy_paste, charge_expires_at, paid_at, paid_amount_cents, created_at";

export async function listInvoices(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<InvoiceView[]> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin.from("invoices").select(INVOICE_COLUMNS).eq("stationery_id", stationeryId).order("created_at", { ascending: false });
  if (error) fail("ler faturas", error);
  return z.array(invoiceRow).parse(data ?? []).map(toInvoiceView);
}

/** `null` tanto para "não existe" quanto para "é de outra papelaria" — não revela existência alheia. */
export async function getInvoice(admin: SupabaseClient, actor: SessionActor, stationeryId: string, invoiceId: string): Promise<InvoiceView | null> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin.from("invoices").select(INVOICE_COLUMNS).eq("id", invoiceId).eq("stationery_id", stationeryId).maybeSingle();
  if (error) fail("ler fatura", error);
  return data ? toInvoiceView(invoiceRow.parse(data)) : null;
}

const passRow = z.object({
  id: z.uuid(),
  status: z.enum(["pending_payment", "active", "cancelled"]),
  price_cents: z.number().int(),
  included_leads: z.number().int(),
  installments: z.number().int(),
  season_start: z.string(),
  season_end: z.string(),
  activated_at: z.string().nullable(),
});

export async function listSeasonPasses(admin: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<SeasonPassView[]> {
  await requireMemberOrAdmin(admin, actor, stationeryId);
  const { data, error } = await admin
    .from("season_passes")
    .select("id, status, price_cents, included_leads, installments, season_start, season_end, activated_at")
    .eq("stationery_id", stationeryId)
    .order("season_start", { ascending: false });
  if (error) fail("ler passes", error);
  return z.array(passRow).parse(data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    priceCents: r.price_cents,
    includedLeads: r.included_leads,
    installments: r.installments,
    seasonStart: r.season_start,
    seasonEnd: r.season_end,
    activatedAt: r.activated_at ? new Date(r.activated_at) : null,
  }));
}
