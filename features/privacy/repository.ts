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

const pathRowSchema = z.object({ storage_path: z.string() });

/** Caminhos do Storage que pertencem ao dono, coletados ANTES de excluir a conta (best-effort; ver `deleteAccount`). */
async function ownedStoragePaths(admin: SupabaseClient, profileId: string): Promise<{ bucket: string; paths: string[] }[]> {
  const [submissions, evidence] = await Promise.all([
    admin.from("list_submissions").select("storage_path").eq("submitted_by", profileId),
    admin.from("claim_evidence").select("storage_path").eq("uploaded_by", profileId),
  ]);
  const out: { bucket: string; paths: string[] }[] = [];
  if (!submissions.error) {
    const paths = z.array(pathRowSchema).parse(submissions.data ?? []).map((r) => r.storage_path);
    if (paths.length > 0) out.push({ bucket: "list-uploads", paths });
  }
  if (!evidence.error) {
    const paths = z.array(pathRowSchema).parse(evidence.data ?? []).map((r) => r.storage_path);
    if (paths.length > 0) out.push({ bucket: "claim-evidence", paths });
  }
  return out;
}

/**
 * Exclusão de conta (Ruling 6, S17): remove primeiro os documentos do Storage do próprio dono (best-effort — uma
 * falha aqui NUNCA bloqueia a exclusão do banco, mesmo padrão de D-017), e só então chama
 * `auth.admin.deleteUser`. O cascade das FKs (e o gatilho `profiles_lgpd_erase`) cuidam do resto: dado pessoal
 * (estudantes, listas salvas, carrinhos, push, preferências, consentimentos) é apagado de verdade; livro-razão
 * (leads, reivindicações, cobrança) fica anonimizado. Idempotente: perfil já excluído não é erro.
 */
export async function deleteAccount(admin: SupabaseClient, profileId: string): Promise<void> {
  const buckets = await ownedStoragePaths(admin, profileId).catch((e) => {
    console.error("exclusão de conta: falha ao listar documentos do storage", e instanceof Error ? e.name : "erro");
    return [];
  });
  for (const { bucket, paths } of buckets) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) console.error("exclusão de conta: falha ao remover do storage", bucket, error.name ?? error.message);
  }
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error && error.status !== 404) fail("excluir conta", error);
}
