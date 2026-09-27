import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PrivacyError } from "./errors";

function fail(action: string, error: { message: string }): never {
  throw new PrivacyError(`${action}: ${error.message}`, "database");
}

const exportSchema = z.record(z.string(), z.unknown());

/** Exportação (Ruling 7, S17): só os dados do próprio `profileId`, vindo da função de banco (que filtra tudo por
 * `p_profile_id`; a segurança está em o Server Action sempre passar `actor.userId` da sessão, nunca um id de
 * formulário — mesmo padrão de `consents_revoke`). */
export async function exportAccountData(admin: SupabaseClient, profileId: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc("account_export", { p_profile_id: profileId });
  if (error) fail("exportar dados da conta", error);
  return exportSchema.parse(data ?? {});
}

/** Espelha `account_deletion_blockers` (migration 0605). */
export const DELETION_BLOCKERS = ["stationery_owner_active", "b2b_partner_owner", "review_history"] as const;
export type DeletionBlocker = (typeof DELETION_BLOCKERS)[number];
const blockerSchema = z.enum(DELETION_BLOCKERS);

/** Revisão de segurança: recusa a exclusão (mensagem específica por motivo) antes de tentar qualquer coisa. */
export async function getDeletionBlockers(admin: SupabaseClient, profileId: string): Promise<DeletionBlocker[]> {
  const { data, error } = await admin.rpc("account_deletion_blockers", { p_profile_id: profileId });
  if (error) fail("conferir vínculos antes de excluir", error);
  return z.array(blockerSchema).parse(data ?? []);
}

const pathRowSchema = z.object({ storage_path: z.string() });

/** Caminhos do Storage que pertencem ao dono, coletados ANTES de excluir a conta. Lança (não engole) se a leitura
 * falhar — a Revisão de segurança pediu erro claro em vez de seguir e apagar a conta com documento ainda no
 * Storage. */
async function ownedStoragePaths(admin: SupabaseClient, profileId: string): Promise<{ bucket: string; paths: string[] }[]> {
  const [submissions, evidence] = await Promise.all([
    admin.from("list_submissions").select("storage_path").eq("submitted_by", profileId),
    admin.from("claim_evidence").select("storage_path").eq("uploaded_by", profileId),
  ]);
  if (submissions.error) fail("listar documentos de envio de lista", submissions.error);
  if (evidence.error) fail("listar documentos de evidência", evidence.error);
  const out: { bucket: string; paths: string[] }[] = [];
  const subPaths = z.array(pathRowSchema).parse(submissions.data ?? []).map((r) => r.storage_path);
  if (subPaths.length > 0) out.push({ bucket: "list-uploads", paths: subPaths });
  const evPaths = z.array(pathRowSchema).parse(evidence.data ?? []).map((r) => r.storage_path);
  if (evPaths.length > 0) out.push({ bucket: "claim-evidence", paths: evPaths });
  return out;
}

/** Remove `paths` de `bucket`; lança `storage_failed` se a chamada falhar (Revisão de segurança: falha no Storage
 * interrompe a exclusão com erro claro — "tentar de novo" — em vez de seguir e deixar arquivo órfão). */
async function removeOrThrow(admin: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) {
    console.error("exclusão de conta: falha ao remover do storage", bucket, error.name ?? error.message);
    throw new PrivacyError("Não foi possível remover um documento do Storage. Tente excluir de novo.", "storage_failed");
  }
}

/**
 * Exclusão de conta (Ruling 6, S17 + correções da revisão de segurança): confere primeiro os vínculos que a
 * bloqueiam (`getDeletionBlockers` — dono de papelaria ativa, de parceiro B2B, ou histórico de curadoria
 * administrativa); se houver algum, lança sem tentar nada (o chamador mapeia para a mensagem certa). Sem
 * bloqueio, remove os documentos do Storage do próprio dono (lista de envios e evidência de reivindicação) — uma
 * falha aqui INTERROMPE a exclusão (erro claro, tentar de novo; nunca segue e deixa o arquivo órfão) — e só então
 * chama `auth.admin.deleteUser`. O cascade das FKs (e o gatilho `profiles_lgpd_erase`, que também cancela
 * reivindicações pendentes do titular) cuidam do resto: dado pessoal é apagado de verdade; livro-razão
 * (leads, reivindicações, cobrança) fica anonimizado. Idempotente: perfil já excluído não é erro.
 */
export async function deleteAccount(admin: SupabaseClient, profileId: string): Promise<void> {
  const blockers = await getDeletionBlockers(admin, profileId);
  if (blockers.length > 0) {
    throw new PrivacyError(`bloqueado por vínculo: ${blockers.join(", ")}`, blockers[0]!);
  }

  const buckets = await ownedStoragePaths(admin, profileId);
  for (const { bucket, paths } of buckets) {
    await removeOrThrow(admin, bucket, paths);
  }

  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error && error.status !== 404) fail("excluir conta", error);
}
