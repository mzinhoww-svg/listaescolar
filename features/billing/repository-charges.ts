import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import type { InvoiceProvider, PaymentAlertView } from "./ports";
import { fail, requireActor, requireAdmin } from "./repository-shared";

// D-158 (S19): extraído de repository.ts — ver nota em repository-shared.ts.

export async function createPackageInvoice(
  admin: SupabaseClient,
  actor: SessionActor,
  input: { stationeryId: string; packageId: string; provider: InvoiceProvider; idempotencyKey: string; termsVersion: string },
): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("billing_create_package_invoice", {
    p_actor_id: actor.userId,
    p_stationery_id: input.stationeryId,
    p_package_id: input.packageId,
    p_provider: input.provider,
    p_idempotency_key: input.idempotencyKey,
    p_terms_version: input.termsVersion,
  });
  if (error) fail("criar fatura de pacote", error);
  return z.uuid().parse(data);
}

export async function purchaseSeasonPass(
  admin: SupabaseClient,
  actor: SessionActor,
  input: { stationeryId: string; installments: number; provider: InvoiceProvider; idempotencyKey: string; termsVersion: string },
): Promise<string> {
  requireActor(actor);
  const { data, error } = await admin.rpc("billing_purchase_season_pass", {
    p_actor_id: actor.userId,
    p_stationery_id: input.stationeryId,
    p_installments: input.installments,
    p_provider: input.provider,
    p_idempotency_key: input.idempotencyKey,
    p_terms_version: input.termsVersion,
  });
  if (error) fail("comprar passe de temporada", error);
  return z.uuid().parse(data);
}

// `out_*`: a função SQL usa esses nomes de saída para não colidir com as colunas de mesmo nome que ela referencia
// internamente (plpgsql trata isso como erro de ambiguidade, não como aviso).
const attachChargeRow = z.object({ out_provider_charge_id: z.string(), out_pix_copy_paste: z.string().nullable(), out_charge_expires_at: z.string().nullable() });

export async function attachCharge(
  admin: SupabaseClient,
  input: {
    invoiceId: string;
    provider: InvoiceProvider;
    expectedCurrentChargeId: string | null;
    providerChargeId: string;
    pixCopyPaste: string | null;
    chargeExpiresAt: Date | null;
  },
): Promise<{ providerChargeId: string; pixCopyPaste: string | null; chargeExpiresAt: Date | null }> {
  const { data, error } = await admin.rpc("billing_attach_charge", {
    p_invoice_id: input.invoiceId,
    p_provider: input.provider,
    p_expected_current_charge_id: input.expectedCurrentChargeId,
    p_provider_charge_id: input.providerChargeId,
    p_pix_copy_paste: input.pixCopyPaste,
    p_charge_expires_at: input.chargeExpiresAt ? input.chargeExpiresAt.toISOString() : null,
  });
  if (error) fail("anexar cobrança", error);
  const row = z.array(attachChargeRow).length(1).parse(data)[0]!;
  return {
    providerChargeId: row.out_provider_charge_id,
    pixCopyPaste: row.out_pix_copy_paste,
    chargeExpiresAt: row.out_charge_expires_at ? new Date(row.out_charge_expires_at) : null,
  };
}

export async function confirmInvoicePayment(
  admin: SupabaseClient,
  input: { invoiceId: string; provider: InvoiceProvider; providerRef: string; amountCents: number; paidAt: Date },
): Promise<boolean> {
  const { data, error } = await admin.rpc("billing_confirm_invoice_payment", {
    p_invoice_id: input.invoiceId,
    p_provider: input.provider,
    p_provider_ref: input.providerRef,
    p_amount_cents: input.amountCents,
    p_paid_at: input.paidAt.toISOString(),
  });
  if (error) fail("confirmar pagamento", error);
  return z.boolean().parse(data);
}

/**
 * Sem `SessionActor`: usada só pelo webhook/cron (sistema), nunca por uma rota alcançável pelo navegador. Revisão de
 * segurança: resolve por QUALQUER txid já emitido para a fatura (via `invoice_charges`, histórico completo), não só
 * o `provider_charge_id` ATUAL — um pagamento feito numa cobrança regenerada (ou perdida numa corrida) ainda é
 * encontrado.
 */
export async function findOpenInvoiceByChargeId(admin: SupabaseClient, chargeId: string): Promise<{ invoiceId: string; amountCents: number } | null> {
  const { data: chargeRow, error: chargeErr } = await admin.from("invoice_charges").select("invoice_id").eq("provider", "pix").eq("provider_charge_id", chargeId).maybeSingle();
  if (chargeErr) fail("ler histórico de cobranças", chargeErr);
  if (!chargeRow) return null;
  const invoiceId = z.object({ invoice_id: z.uuid() }).parse(chargeRow).invoice_id;
  const { data, error } = await admin.from("invoices").select("id, amount_cents").eq("id", invoiceId).eq("status", "open").maybeSingle();
  if (error) fail("ler fatura pelo id da cobrança", error);
  if (!data) return null;
  const r = z.object({ id: z.uuid(), amount_cents: z.number().int() }).parse(data);
  return { invoiceId: r.id, amountCents: r.amount_cents };
}

/**
 * D-101 (S23, revisão de segurança da S21): quando o webhook recebe uma notificação para um txid que já pertence a
 * uma fatura, mas ela NÃO está mais aberta (já paga ou cancelada), `findOpenInvoiceByChargeId` devolve `null` e o
 * pagamento era ignorado em silêncio. Esta função resolve por QUALQUER status, para o chamador decidir se vale
 * registrar um alerta (nunca recreditar sozinho).
 */
export async function findAnyInvoiceByChargeId(admin: SupabaseClient, chargeId: string): Promise<{ invoiceId: string; status: "open" | "paid" | "cancelled" } | null> {
  const { data: chargeRow, error: chargeErr } = await admin.from("invoice_charges").select("invoice_id").eq("provider", "pix").eq("provider_charge_id", chargeId).maybeSingle();
  if (chargeErr) fail("ler histórico de cobranças", chargeErr);
  if (!chargeRow) return null;
  const invoiceId = z.object({ invoice_id: z.uuid() }).parse(chargeRow).invoice_id;
  const { data, error } = await admin.from("invoices").select("id, status").eq("id", invoiceId).maybeSingle();
  if (error) fail("ler fatura pelo id da cobrança", error);
  if (!data) return null;
  const r = z.object({ id: z.uuid(), status: z.enum(["open", "paid", "cancelled"]) }).parse(data);
  return { invoiceId: r.id, status: r.status };
}

/** D-101: registra o alerta (idempotente por invoice+provider+charge); admin resolve manualmente pelo Admin13. */
export async function flagLatePayment(
  admin: SupabaseClient,
  input: { invoiceId: string; provider: InvoiceProvider; providerChargeId: string; amountCents: number },
): Promise<string> {
  const { data, error } = await admin.rpc("billing_flag_late_payment", {
    p_invoice_id: input.invoiceId,
    p_provider: input.provider,
    p_provider_charge_id: input.providerChargeId,
    p_amount_cents: input.amountCents,
    // sempre 'system': só o webhook/cron chama esta função (nenhuma sessão de usuário aciona), revisão de segurança.
    p_actor_role: "system",
  });
  if (error) fail("registrar alerta de pagamento tardio", error);
  return z.uuid().parse(data);
}

const paymentAlertRow = z.object({
  id: z.uuid(),
  invoice_id: z.uuid(),
  provider: z.enum(["fake", "demo", "pix"]),
  provider_charge_id: z.string(),
  amount_cents: z.number().int(),
  invoice_status_at_detection: z.enum(["paid", "cancelled"]),
  detected_at: z.string(),
  resolved_at: z.string().nullable(),
  resolved_by: z.uuid().nullable(),
  resolution_note: z.string().nullable(),
});

/** Fila de alertas (Admin13, conciliação); admin only. */
export async function listPaymentAlerts(admin: SupabaseClient, actor: SessionActor): Promise<PaymentAlertView[]> {
  await requireAdmin(actor);
  const { data, error } = await admin.from("billing_payment_alerts").select("*").order("detected_at", { ascending: false }).limit(200);
  if (error) fail("listar alertas de pagamento", error);
  return z.array(paymentAlertRow).parse(data ?? []).map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    provider: r.provider,
    providerChargeId: r.provider_charge_id,
    amountCents: r.amount_cents,
    invoiceStatusAtDetection: r.invoice_status_at_detection,
    detectedAt: new Date(r.detected_at),
    resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    resolutionNote: r.resolution_note,
  }));
}

export async function resolvePaymentAlert(admin: SupabaseClient, actor: SessionActor, input: { alertId: string; note: string | null }): Promise<string> {
  await requireAdmin(actor);
  const { data, error } = await admin.rpc("billing_resolve_payment_alert", { p_actor_id: actor.userId, p_alert_id: input.alertId, p_note: input.note });
  if (error) fail("resolver alerta de pagamento", error);
  return z.uuid().parse(data);
}

/**
 * As faturas abertas mais ANTIGAS primeiro (`created_at asc`, até `limit`): um lote que não cabe no orçamento de
 * tempo do cron continua no dia seguinte, sem starvation. Revisão de segurança: devolve TODO txid já emitido para
 * cada uma (via `invoice_charges`), não só o atual — o cron reconcilia cobranças regeneradas/perdidas também.
 */
export async function listOpenPixChargeIds(admin: SupabaseClient, limit: number): Promise<string[]> {
  const { data: invoicesData, error: invoicesErr } = await admin.from("invoices").select("id").eq("provider", "pix").eq("status", "open").order("created_at", { ascending: true }).limit(limit);
  if (invoicesErr) fail("listar faturas Pix abertas", invoicesErr);
  const ids = z.array(z.object({ id: z.uuid() })).parse(invoicesData ?? []).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data, error } = await admin.from("invoice_charges").select("provider_charge_id").eq("provider", "pix").in("invoice_id", ids);
  if (error) fail("listar cobranças Pix abertas", error);
  return z.array(z.object({ provider_charge_id: z.string() })).parse(data ?? []).map((r) => r.provider_charge_id);
}

export async function reverseEntry(
  admin: SupabaseClient,
  input: { entryId: string; actorId: string | null; actorRole: "admin" | "system"; reason: string | null },
): Promise<string> {
  const { data, error } = await admin.rpc("billing_reverse_entry", {
    p_entry_id: input.entryId,
    p_actor_id: input.actorId,
    p_actor_role: input.actorRole,
    p_reason: input.reason,
  });
  if (error) fail("estornar lançamento", error);
  return z.uuid().parse(data);
}
