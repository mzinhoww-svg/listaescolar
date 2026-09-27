import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SessionActor } from "./actor";
import { isValidCnpj } from "./cnpj";
import { LGPD_TEXT_VERSION, PAYMENT_METHODS, type StationeryBasics, type StationeryConsent, type StationeryService } from "./schemas";
import { areaPayload, fail, loadOwned, requireActor, slugify, statusSchema, StationeryRepositoryError } from "./repository-shared";
import { OWNER_EDITABLE_STATUSES, type StationeryStatus } from "./state";

/**
 * Cadastro, posse/estado e transição de status, extraídos de `repository.ts` (D-057, S18): comportamento
 * idêntico ao arquivo original.
 */

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export type RegisterInput = {
  basics: StationeryBasics;
  service: StationeryService;
  /** Aceite LGPD obrigatório. A data e a versão do texto são do servidor (o banco carimba a data). */
  consent: StationeryConsent;
};

const registeredSchema = z.object({ id: z.uuid(), slug: z.string(), created: z.boolean() });

/**
 * Cadastro atômico (`stationery_register`): papelaria em `signup` + dono + áreas + aceite LGPD, tudo ou nada.
 * O dono é o ator da sessão (só `parent`). Duplo envio (mesmo dono e CNPJ) devolve a papelaria existente
 * (`created: false`); outro CNPJ para quem já é dono é `already_owner`; CNPJ de outro dono é `cnpj_taken`.
 */
export async function registerStationery(
  client: SupabaseClient,
  actor: SessionActor,
  input: RegisterInput,
): Promise<{ id: string; slug: string; created: boolean }> {
  requireActor(actor);
  if (actor.role !== "parent") throw new StationeryRepositoryError("só responsável cadastra papelaria", "forbidden");
  const { basics, service, consent } = input;
  if (consent.lgpdAccepted !== true) throw new StationeryRepositoryError("aceite LGPD obrigatório", "consent_required");
  const { data, error } = await client.rpc("stationery_register", {
    p_owner_id: actor.userId,
    p_slug: slugify(basics.tradeName),
    p_trade_name: basics.tradeName,
    p_legal_name: basics.legalName,
    p_cnpj: basics.cnpj,
    p_municipality_id: basics.municipalityId,
    p_neighborhood: basics.neighborhood,
    p_address: basics.address ?? null,
    p_cep: basics.cep ?? null,
    p_whatsapp: service.whatsapp,
    p_phone: service.phone ?? null,
    p_email: service.email ?? null,
    p_offers_pickup: service.offersPickup,
    p_offers_delivery: service.offersDelivery,
    p_service_radius_km: service.serviceRadiusKm,
    p_opening_hours: service.openingHours ?? null,
    p_payment_methods: service.paymentMethods,
    p_areas: areaPayload(service.areas),
    p_lgpd_text_version: LGPD_TEXT_VERSION,
  });
  if (error) fail("cadastrar papelaria", error);
  return registeredSchema.parse(data);
}

/** Grava o aceite LGPD depois do cadastro (só o dono, antes da análise). Data e versão do texto são do servidor. */
export async function recordConsent(client: SupabaseClient, actor: SessionActor, stationeryId: string): Promise<void> {
  requireActor(actor);
  const { error } = await client.rpc("stationery_record_consent", {
    p_id: stationeryId,
    p_actor_id: actor.userId,
    p_text_version: LGPD_TEXT_VERSION,
  });
  if (error) fail("registrar aceite", error);
}

// ---------------------------------------------------------------------------
// Posse e estado
// ---------------------------------------------------------------------------

/** Valores do cadastro que o dono pode editar; os mesmos formatos que o banco exige (nunca status, slug, `is_demo`). */
const ProfilePatchSchema = z.strictObject({
  tradeName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().min(2).max(200).optional(),
  cnpj: z.string().refine((v) => /^[0-9A-Z]{14}$/.test(v) && isValidCnpj(v), "CNPJ inválido.").optional(),
  neighborhood: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().max(200).optional(),
  cep: z.string().regex(/^[0-9]{8}$/).optional(),
  whatsapp: z.string().regex(/^\+55[0-9]{10,11}$/).optional(),
  phone: z.string().regex(/^\+55[0-9]{10,11}$/).optional(),
  email: z.email().max(254).optional(),
  offersPickup: z.boolean().optional(),
  offersDelivery: z.boolean().optional(),
  serviceRadiusKm: z.number().int().min(0).max(50).optional(),
  openingHours: z.string().trim().max(300).optional(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length).optional(),
});
export type ProfilePatch = z.input<typeof ProfilePatchSchema>;

const PATCH_COLUMNS: Readonly<Record<string, string>> = {
  tradeName: "trade_name",
  legalName: "legal_name",
  cnpj: "cnpj",
  neighborhood: "neighborhood",
  address: "address",
  cep: "cep",
  whatsapp: "whatsapp",
  phone: "phone",
  email: "email",
  offersPickup: "offers_pickup",
  offersDelivery: "offers_delivery",
  serviceRadiusKm: "service_radius_km",
  openingHours: "opening_hours",
  paymentMethods: "payment_methods",
};

/**
 * Dono edita o cadastro. Valores são revalidados (mesmos formatos do banco). A escrita leva o filtro de estado
 * (o estado pode ter mudado depois da leitura) e confere as linhas afetadas. O banco recusa `cnpj` depois do envio.
 */
export async function updateProfile(
  client: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
  patch: ProfilePatch,
): Promise<void> {
  requireActor(actor);
  const parsed = ProfilePatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new StationeryRepositoryError(`cadastro inválido: ${parsed.error.issues[0]?.message ?? ""}`, "invalid_input");
  }
  await loadOwned(client, stationeryId, actor.userId, OWNER_EDITABLE_STATUSES);
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (Object.hasOwn(PATCH_COLUMNS, key) && value !== undefined) columns[PATCH_COLUMNS[key] as string] = value;
  }
  if (Object.keys(columns).length === 0) return;
  const { data, error } = await client
    .from("stationeries")
    .update(columns)
    .eq("id", stationeryId)
    .in("status", [...OWNER_EDITABLE_STATUSES])
    .select("id");
  if (error) fail("atualizar cadastro", error);
  if (!data || data.length !== 1) {
    throw new StationeryRepositoryError("o status da papelaria mudou; nada foi alterado", "invalid_state");
  }
}

/** Substitui os bairros atendidos (do município da papelaria). Posse e estado conferidos na função SQL, sob trava. */
export async function setAreas(
  client: SupabaseClient,
  actor: SessionActor,
  stationeryId: string,
  neighborhoods: readonly string[],
): Promise<void> {
  requireActor(actor);
  const { error } = await client.rpc("stationery_replace_areas", {
    p_id: stationeryId,
    p_actor_id: actor.userId,
    p_areas: areaPayload(neighborhoods),
  });
  if (error) fail("gravar áreas", error);
}

// ---------------------------------------------------------------------------
// Transição de status
// ---------------------------------------------------------------------------

/** Papel de transição do ator da sessão: admin/system agem como a equipe; parent/stationery_member como dono. */
function transitionRole(actor: SessionActor, as: "owner" | undefined): "owner" | "admin" | "system" {
  if (as === "owner") {
    if (actor.role === "school_member" || actor.role === "system") throw new StationeryRepositoryError("papel sem acesso à papelaria", "forbidden");
    return "owner";
  }
  switch (actor.role) {
    case "admin":
      return "admin";
    case "system":
      return "system";
    case "parent":
    case "stationery_member":
      return "owner";
    default:
      throw new StationeryRepositoryError("papel sem acesso à papelaria", "forbidden");
  }
}

/**
 * Única porta de escrita de status: a função SQL aplica a matriz, o motivo e as pré-condições. Ator = sessão;
 * `as: "owner"` faz o admin agir como dono da própria papelaria (o banco confere o vínculo).
 */
export async function transition(
  client: SupabaseClient,
  actor: SessionActor,
  input: { id: string; to: StationeryStatus; reason?: string; as?: "owner" },
): Promise<StationeryStatus> {
  requireActor(actor);
  const { data, error } = await client.rpc("stationery_transition", {
    p_id: input.id,
    p_to: input.to,
    p_actor_id: actor.userId,
    p_actor_role: transitionRole(actor, input.as),
    p_reason: input.reason ?? null,
  });
  if (error) fail("transição de status", error);
  return statusSchema.parse(data);
}
