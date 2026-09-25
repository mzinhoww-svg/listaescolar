"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/features/auth/actions";

/** Sair: se o signOut falhar, ainda assim leva a /entrar (o gate de rotas exige sessão válida). */
export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/entrar");
}
