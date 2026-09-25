import "server-only";

// Cópia PRIVADA da lista do pai (S10). Módulo isolado de propósito: só toca `parent_list_copies` pelas funções
// `parent_copy_*`; a cópia nunca é oficial e não tem caminho para a fila, para as versões do admin nem para a porta de saída.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import { parentCopyPayloadSchema, reviewItemsSchema } from "./schemas";
import { ReviewError } from "./errors";

const openOut = z.object({ copyId: z.string().uuid(), version: z.number().int(), items: reviewItemsSchema });
export type ParentCopyView = { copyId: string; version: number; items: z.infer<typeof reviewItemsSchema>; grade: string | null; schoolYear: number | null };

function assertActor(actor: unknown): asserts actor is SessionActor {
  if (!isSessionActor(actor)) throw new ReviewError("forbidden");
}

/** `client` = service role; o dono vem SÓ da sessão (`actor.userId`) e é conferido no SQL. */
export function createParentCopyService(client: SupabaseClient) {
  return {
    /** `null` para qualquer caso sem acesso (outro dono, envio de escola, sem resultado): o chamador devolve 404 igual. */
    async open(actor: SessionActor, submissionId: string): Promise<ParentCopyView | null> {
      assertActor(actor);
      if (!z.string().uuid().safeParse(submissionId).success) return null;
      const { data, error } = await client.rpc("parent_copy_open", { p_submission_id: submissionId, p_owner_id: actor.userId });
      if (error) {
        if (error.code === "P0002") return null;
        throw new ReviewError(error.code === "42501" ? "forbidden" : "unavailable");
      }
      const parsed = openOut.safeParse(data);
      if (!parsed.success) throw new ReviewError("unavailable");
      const sub = await client.from("list_submissions").select("grade, school_year").eq("id", submissionId).eq("submitted_by", actor.userId).maybeSingle();
      if (sub.error) throw new ReviewError("unavailable");
      return { ...parsed.data, grade: (sub.data?.grade as string | null) ?? null, schoolYear: (sub.data?.school_year as number | null) ?? null };
    },

    async save(actor: SessionActor, copyId: string, raw: unknown): Promise<"saved" | "stale"> {
      assertActor(actor);
      if (!z.string().uuid().safeParse(copyId).success) throw new ReviewError("invalid_input");
      const p = parentCopyPayloadSchema.safeParse(raw);
      if (!p.success) throw new ReviewError("invalid_input");
      const { data, error } = await client.rpc("parent_copy_save", { p_copy_id: copyId, p_owner_id: actor.userId, p_expected_version: p.data.expectedVersion, p_items: p.data.items });
      if (error) throw new ReviewError(error.code === "P0002" ? "not_found" : error.code === "42501" ? "forbidden" : error.code === "22023" ? "invalid_input" : "unavailable");
      if (data !== "saved" && data !== "stale") throw new ReviewError("unavailable");
      return data;
    },
  };
}
