"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionActor } from "@/features/stationeries/actor";
import { repositoryErrorCode } from "@/features/stationeries/messages";
import { transition } from "@/features/stationeries/repository";
import { STATIONERY_STATUSES } from "@/features/stationeries/state";
import { createAdminClient } from "@/lib/supabase/admin";

const AdminMoveSchema = z.object({
  id: z.uuid(),
  to: z.enum(STATIONERY_STATUSES),
  reason: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  back: z.enum(["list", "detail"]).default("detail"),
});

/** Aprovar, recusar, pausar, suspender ou reativar. Ator = admin da sessão; a função SQL confere de novo. */
export async function adminTransitionAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect("/entrar?next=%2Fadmin%2Fpapelarias");
  if (actor.role !== "admin") redirect("/403");
  const parsed = AdminMoveSchema.safeParse({
    id: formData.get("id"),
    to: formData.get("to"),
    reason: formData.get("reason") ?? "",
    back: formData.get("back") ?? "detail",
  });
  if (!parsed.success) redirect("/admin/papelarias?erro=invalido");
  const { id, to, reason, back } = parsed.data;
  const base = back === "list" ? "/admin/papelarias" : `/admin/papelarias/${id}`;
  try {
    await transition(createAdminClient(), actor, { id, to, ...(reason ? { reason } : {}) });
  } catch (error) {
    console.error("transição admin", error);
    redirect(`${base}?erro=${repositoryErrorCode(error)}`);
  }
  redirect(`${base}?ok=1`);
}
