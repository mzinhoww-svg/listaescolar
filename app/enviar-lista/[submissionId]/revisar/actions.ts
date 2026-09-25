"use server";

import { getSessionActor } from "@/features/auth/actor";
import { buildParentCopyService } from "@/features/review/deps";
import { ReviewError } from "@/features/review/errors";
import { parentCopyPayloadSchema } from "@/features/review/schemas";

import type { ParentCopyState } from "./state";

const res = (kind: ParentCopyState["kind"], message: string, version?: number): ParentCopyState => ({ kind, message, ...(version === undefined ? {} : { version }) });

/**
 * Salva a cópia PRIVADA do pai (versão otimista). Só `parent_copy_save`: nada de fila, de versões do admin, de decisões da IA
 * nem da porta de publicação. O dono vem só da sessão e é conferido de novo no SQL.
 */
export async function saveParentCopyAction(_prev: ParentCopyState, formData: FormData): Promise<ParentCopyState> {
  const actor = await getSessionActor();
  if (!actor) return res("error", "Entre na sua conta para salvar.");
  if (actor.role !== "parent") return res("error", "Só a família que enviou a lista pode editar a cópia.");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return res("error", "Confira os itens: nome de 1 a 300 caracteres e quantidade de 1 a 9999.");
  }
  const parsed = parentCopyPayloadSchema.safeParse(raw);
  if (!parsed.success) return res("error", "Confira os itens: nome de 1 a 300 caracteres e quantidade de 1 a 9999.");
  try {
    const out = await buildParentCopyService().save(actor, String(formData.get("copyId") ?? ""), parsed.data);
    if (out === "stale") return res("stale", "Esta lista foi alterada em outra aba. Recarregue.");
    return res("saved", "Lista salva.", parsed.data.expectedVersion + 1);
  } catch (e) {
    if (e instanceof ReviewError && (e.code === "invalid_input" || e.code === "not_found" || e.code === "forbidden")) return res("error", "Não foi possível salvar esta lista.");
    console.error("cópia do pai", e instanceof Error ? e.name : "erro");
    return res("error", "Não foi possível salvar agora. Tente de novo.");
  }
}
