"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";
import { splitAreas } from "@/features/stationeries/areas";
import { repositoryErrorMessage } from "@/features/stationeries/messages";
import { getStationeryOfOwner } from "@/features/stationeries/queries";
import { setAreas } from "@/features/stationeries/repository";
import { createAdminClient } from "@/lib/supabase/admin";

const AreasSchema = z.array(z.string().trim().min(2).max(120)).max(100);

export async function saveAreasAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=%2Fpapelaria%2Fareas");
  const role = await getCurrentRole();
  if (role !== "stationery_member" && role !== "admin") redirect("/403");
  const raw = formData.get("areas");
  const parsed = AreasSchema.safeParse(splitAreas(typeof raw === "string" ? raw : ""));
  if (!parsed.success) redirect("/papelaria/areas?erro=Cada%20bairro%20deve%20ter%20de%202%20a%20120%20caracteres%20(at%C3%A9%20100%20bairros).");
  const own = await getStationeryOfOwner(user.id);
  if (!own) redirect("/papelaria");
  try {
    await setAreas(createAdminClient(), own.id, user.id, parsed.data);
  } catch (error) {
    console.error("bairros", error);
    redirect(`/papelaria/areas?erro=${encodeURIComponent(repositoryErrorMessage(error))}`);
  }
  redirect("/papelaria/areas?ok=1");
}
