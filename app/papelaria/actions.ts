"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionActor } from "@/features/stationeries/actor";
import { repositoryErrorMessage } from "@/features/stationeries/messages";
import { getStationeryOfOwner } from "@/features/stationeries/queries";
import { transition } from "@/features/stationeries/repository";
import { createAdminClient } from "@/lib/supabase/admin";

const OwnerMoveSchema = z.object({ to: z.enum(["active", "paused"]) });

/** Dono publica (approved→active), pausa (active→paused) ou reativa (paused→active). A papelaria é a do dono da sessão. */
export async function ownerStatusAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect("/entrar?next=%2Fpapelaria");
  if (actor.role !== "stationery_member" && actor.role !== "admin") redirect("/403");
  const parsed = OwnerMoveSchema.safeParse({ to: formData.get("to") });
  if (!parsed.success) redirect("/papelaria?erro=invalido");
  const own = await getStationeryOfOwner(actor.userId);
  if (!own) redirect("/papelaria");
  try {
    await transition(createAdminClient(), actor, { id: own.id, to: parsed.data.to, as: "owner" });
  } catch (error) {
    console.error("status da papelaria", error);
    redirect(`/papelaria?erro=${encodeURIComponent(repositoryErrorMessage(error))}`);
  }
  redirect("/papelaria?ok=1");
}
