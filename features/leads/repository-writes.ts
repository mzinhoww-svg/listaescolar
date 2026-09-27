import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "@/features/stationeries/actor";

import { LeadError } from "./errors";
import type { NewLeadRecord, TransitionRequest } from "./ports";
import { fail, requireActor, requireCode, statusSchema } from "./repository-shared";
import type { LeadStatus } from "./state";

/**
 * Escritas (funções SQL), extraídas de `repository.ts` (D-057, S18): SEMPRE pela função SQL (service_role,
 * EXECUTE só dele), que confere quem é o ator dentro da transação — comportamento idêntico ao arquivo original.
 */

const createdSchema = z.array(z.object({ lead_id: z.uuid(), code: z.string(), created: z.boolean() })).length(1);

/** Cria o lead (idempotente pela chave). Só `parent`; a checagem final (carrinho, área, limites) é da função SQL. */
export async function createLead(
  admin: SupabaseClient,
  actor: SessionActor,
  record: NewLeadRecord,
): Promise<{ leadId: string; code: string; created: boolean }> {
  requireActor(actor);
  if (actor.role !== "parent") throw new LeadError("só responsável pede cotação", "forbidden");
  const { data, error } = await admin.rpc("lead_create", {
    p_requester_id: actor.userId,
    p_cart_id: record.cartId,
    p_list_id: record.listId,
    p_stationery_id: record.stationeryId,
    p_school_name: record.schoolName,
    p_grade_label: record.gradeLabel,
    p_school_year: record.schoolYear,
    p_municipality_id: record.municipalityId,
    p_neighborhood: record.neighborhood,
    p_items: record.items.map((i) => ({ name: i.name, item_key: i.itemKey, quantity: i.quantity })),
    p_consent_text_version: record.consentTextVersion,
    p_idempotency_key: record.idempotencyKey,
    p_is_demo: record.isDemo,
  });
  if (error) fail("criar lead", error);
  const row = createdSchema.parse(data)[0];
  if (!row) throw new LeadError("lead não devolvido", "database");
  return { leadId: row.lead_id, code: row.code, created: row.created };
}

/** Código -> id (service_role). Ausente = `not_found`; a autorização é da função SQL que recebe o id. */
async function resolveLeadId(admin: SupabaseClient, code: string): Promise<string> {
  const { data, error } = await admin.from("leads").select("id").eq("code", requireCode(code)).maybeSingle();
  if (error) fail("ler lead", error);
  if (!data) throw new LeadError("lead não encontrado", "not_found");
  return z.uuid().parse(data.id);
}

/** Para quem consulta por código, "sem permissão" e "não existe" são a mesma resposta (não revela códigos alheios). */
function hideForeign<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (error instanceof LeadError && error.code === "forbidden") throw new LeadError("lead não encontrado", "not_found", error.dbCode);
    throw error;
  });
}

/**
 * Muda o status (`lead_transition`). Devolve o status FINAL: lead vencido vira `expired` sem erro (mesmo contrato da
 * expiração preguiçosa); quem chama compara com o pedido. `as: 'admin'` exige papel admin na sessão.
 */
export async function transitionLead(admin: SupabaseClient, actor: SessionActor, request: TransitionRequest): Promise<LeadStatus> {
  requireActor(actor);
  if (request.as === "admin" && actor.role !== "admin") throw new LeadError("só a equipe cancela por abuso", "forbidden");
  return hideForeign(async () => {
    const leadId = await resolveLeadId(admin, request.code);
    const { data, error } = await admin.rpc("lead_transition", {
      p_lead_id: leadId,
      p_to: request.to,
      p_actor_id: actor.userId,
      p_actor_role: request.as,
      p_amount_cents: request.amountCents ?? null,
      p_reason: request.reason ?? null,
    });
    if (error) fail("mudar status do lead", error);
    return statusSchema.parse(data);
  });
}

/** A papelaria abriu o lead: `received -> viewed` uma vez (idempotente). Devolve o status atual. */
export async function markViewed(admin: SupabaseClient, actor: SessionActor, code: string): Promise<LeadStatus> {
  requireActor(actor);
  return hideForeign(async () => {
    const leadId = await resolveLeadId(admin, code);
    const { data, error } = await admin.rpc("lead_mark_viewed", { p_lead_id: leadId, p_actor_id: actor.userId });
    if (error) fail("marcar lead como visto", error);
    return statusSchema.parse(data);
  });
}

/** O solicitante abriu o wa.me. `false` = deduplicado (60 s). */
export async function recordWhatsappOpen(admin: SupabaseClient, actor: SessionActor, leadId: string): Promise<boolean> {
  requireActor(actor);
  const { data, error } = await admin.rpc("lead_record_whatsapp_open", { p_lead_id: z.uuid().parse(leadId), p_actor_id: actor.userId });
  if (error) fail("registrar abertura do WhatsApp", error);
  return z.boolean().parse(data);
}

/** Job de expiração (sem ator: roda no cron autenticado por segredo). Devolve quantos expirou. */
export async function expireDue(admin: SupabaseClient, limit = 500): Promise<number> {
  const { data, error } = await admin.rpc("lead_expire_due", { p_limit: limit });
  if (error) fail("expirar leads", error);
  return z.number().int().nonnegative().parse(data);
}
