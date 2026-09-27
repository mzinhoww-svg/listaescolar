"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionActor } from "@/features/auth/actor";
import { createAdminListsRepository, ListRepositoryError } from "@/features/lists/repository";

/** Arquivar lista (S16): só `published -> archived` (a função SQL `list_archive`, 0103, confere de novo), com motivo obrigatório. */
const inputSchema = z.object({
  listId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export async function archiveListAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  const listId = String(formData.get("listId") ?? "");
  const back = `/admin/listas/${listId}`;
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  if (actor.role !== "admin") redirect(`${back}?erro=forbidden`);
  const parsed = inputSchema.safeParse({ listId, reason: formData.get("reason") });
  if (!parsed.success) redirect(`${back}?erro=invalido`);
  try {
    await createAdminListsRepository().archive({ listId: parsed.data.listId, actorId: actor.userId, reason: parsed.data.reason });
  } catch (error) {
    const code = error instanceof ListRepositoryError ? error.code : "database";
    console.error("arquivar lista", error instanceof Error ? error.message : "erro");
    redirect(`${back}?erro=${code}`);
  }
  revalidatePath(back);
  revalidatePath("/admin/denuncias");
  redirect(`${back}?ok=1`);
}
