"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionActor } from "@/features/auth/actor";
import { composeCloseReason, LIST_CLOSE_REASONS } from "@/features/lists/close-reasons";
import { createAdminListsRepository, ListRepositoryError } from "@/features/lists/repository";

/**
 * Arquivar lista (S16): só `published -> archived` (a função SQL `list_archive`, 0103, confere de novo). Motivo
 * por código (revisão de segurança), nunca texto livre do admin — mesmo padrão de `lead_reviews.hidden_reason`.
 */
const inputSchema = z.object({
  listId: z.uuid(),
  reasonCode: z.enum(LIST_CLOSE_REASONS),
  observation: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_.-]{0,59}$/, "Use só um código curto, sem espaço nem acento.")
    .nullish()
    .transform((v) => v || null),
});

export async function archiveListAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  const listId = String(formData.get("listId") ?? "");
  const back = `/admin/listas/${listId}`;
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  if (actor.role !== "admin") redirect(`${back}?erro=forbidden`);
  const parsed = inputSchema.safeParse({
    listId,
    reasonCode: formData.get("reasonCode"),
    observation: formData.get("observation") || undefined,
  });
  if (!parsed.success) redirect(`${back}?erro=invalido`);
  const reason = composeCloseReason(parsed.data.reasonCode, parsed.data.observation);
  try {
    await createAdminListsRepository().archive({ listId: parsed.data.listId, actorId: actor.userId, reason });
  } catch (error) {
    const code = error instanceof ListRepositoryError ? error.code : "database";
    console.error("arquivar lista", error instanceof Error ? error.message : "erro");
    redirect(`${back}?erro=${code}`);
  }
  revalidatePath(back);
  revalidatePath("/admin/denuncias");
  redirect(`${back}?ok=1`);
}
