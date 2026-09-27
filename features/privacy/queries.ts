import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { PrivacyError } from "./errors";

const consentSchema = z.object({
  id: z.uuid(),
  purpose: z.string(),
  text_version: z.string(),
  granted_at: z.string(),
  revoked_at: z.string().nullable(),
});
export type MyConsent = z.infer<typeof consentSchema>;

/** "Meus consentimentos": lê pela sessão (RLS `consents_select_own_or_admin` já escopa ao próprio dono). */
export async function listMyConsents(session: SupabaseClient, profileId: string): Promise<MyConsent[]> {
  const { data, error } = await session
    .from("consents")
    .select("id, purpose, text_version, granted_at, revoked_at")
    .eq("profile_id", profileId)
    .order("granted_at", { ascending: false });
  if (error) throw new PrivacyError(`listar consentimentos: ${error.message}`, "database");
  return z.array(consentSchema).parse(data ?? []);
}

/** Revogação (mesmo padrão de `notifications_mark_read`): SECURITY DEFINER, só service_role; `profileId` sempre
 * vindo da sessão validada, nunca de um campo de formulário. Idempotente (consentimento já revogado não muda). */
export async function revokeMyConsent(admin: SupabaseClient, consentId: string, profileId: string): Promise<void> {
  const { error } = await admin.rpc("consents_revoke", { p_consent_id: consentId, p_profile_id: profileId });
  if (error) throw new PrivacyError(`revogar consentimento: ${error.message}`, "database");
}
