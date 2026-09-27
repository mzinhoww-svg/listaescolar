"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { SavedListError } from "@/features/saved-lists/errors";
import { savedListErrorMessage } from "@/features/saved-lists/messages";
import { removeSavedList, saveList } from "@/features/saved-lists/repository";
import { saveListInputSchema, savedListIdSchema } from "@/features/saved-lists/schemas";
import { createClient } from "@/lib/supabase/server";

const HUB_PATH = "/conta";
export type SaveListActionResult = { status: "ok" } | { status: "error"; message: string };

async function actorOrLogin(next: string): Promise<SessionActor> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return actor;
}

/** Botão "Salvar lista" na página pública da lista publicada (S15). */
export async function saveListAction(input: unknown): Promise<SaveListActionResult> {
  const actor = await actorOrLogin("/conta");
  const parsed = saveListInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Escolha um aluno." };
  try {
    await saveList(await createClient(), actor.userId, parsed.data.studentId, parsed.data.listId);
  } catch (e) {
    return { status: "error", message: e instanceof SavedListError ? savedListErrorMessage(e.code) : savedListErrorMessage("database") };
  }
  return { status: "ok" };
}

export async function removeSavedListAction(formData: FormData): Promise<void> {
  await actorOrLogin(HUB_PATH);
  const id = savedListIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await removeSavedList(await createClient(), id.data).catch(() => false);
  revalidatePath(HUB_PATH);
  revalidatePath("/conta/listas-salvas");
}
