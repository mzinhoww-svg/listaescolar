import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EvidenceStorage } from "./ports";

export const EVIDENCE_BUCKET = "claim-evidence";

/** Bucket privado `claim-evidence` pelo cliente de serviço. Não há política para `authenticated`. */
export function createSupabaseEvidenceStorage(client: SupabaseClient): EvidenceStorage {
  const bucket = () => client.storage.from(EVIDENCE_BUCKET);
  return {
    async put(path, bytes, mime) {
      const { error } = await bucket().upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw new Error("falha ao gravar a evidência no Storage");
    },
    async remove(path) {
      const { error } = await bucket().remove([path]);
      if (error) throw new Error("falha ao remover a evidência do Storage");
    },
    async signedUrl(path, seconds) {
      const { data, error } = await bucket().createSignedUrl(path, seconds);
      if (error || !data?.signedUrl) throw new Error("falha ao assinar a URL da evidência");
      return data.signedUrl;
    },
  };
}
