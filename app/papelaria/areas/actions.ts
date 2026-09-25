"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionActor } from "@/features/stationeries/actor";
import { splitAreas } from "@/features/stationeries/areas";
import { repositoryErrorCode } from "@/features/stationeries/messages";
import { getStationeryOfOwner } from "@/features/stationeries/queries";
import { setAreas } from "@/features/stationeries/repository";
import { createAdminClient } from "@/lib/supabase/admin";

const AreasSchema = z.array(z.string().trim().min(2).max(120)).max(100);

export async function saveAreasAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect("/entrar?next=%2Fpapelaria%2Fareas");
  if (actor.role !== "stationery_member" && actor.role !== "admin") redirect("/403");
  const raw = formData.get("areas");
  const parsed = AreasSchema.safeParse(splitAreas(typeof raw === "string" ? raw : ""));
  if (!parsed.success) redirect("/papelaria/areas?erro=areas_invalidas");
  const own = await getStationeryOfOwner(actor.userId);
  if (!own) redirect("/papelaria");
  try {
    await setAreas(createAdminClient(), actor, own.id, parsed.data);
  } catch (error) {
    console.error("bairros", error);
    redirect(`/papelaria/areas?erro=${repositoryErrorCode(error)}`);
  }
  redirect("/papelaria/areas?ok=1");
}
