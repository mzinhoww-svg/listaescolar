"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";
import { repositoryErrorMessage } from "@/features/stationeries/messages";
import { getStationeryOfOwner } from "@/features/stationeries/queries";
import { transition } from "@/features/stationeries/repository";
import { createAdminClient } from "@/lib/supabase/admin";

const OwnerMoveSchema = z.object({ to: z.enum(["active", "paused"]) });

/** Dono publica (approved→active), pausa (active→paused) ou reativa (paused→active). A papelaria é a do dono da sessão. */
export async function ownerStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=%2Fpapelaria");
  const role = await getCurrentRole();
  if (role !== "stationery_member" && role !== "admin") redirect("/403");
  const parsed = OwnerMoveSchema.safeParse({ to: formData.get("to") });
  if (!parsed.success) redirect("/papelaria?erro=invalido");
  const own = await getStationeryOfOwner(user.id);
  if (!own) redirect("/papelaria");
  try {
    await transition(createAdminClient(), { id: own.id, to: parsed.data.to, actorId: user.id, actorRole: "owner" });
  } catch (error) {
    console.error("status da papelaria", error);
    redirect(`/papelaria?erro=${encodeURIComponent(repositoryErrorMessage(error))}`);
  }
  redirect("/papelaria?ok=1");
}
