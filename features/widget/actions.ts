"use server";

import { revalidatePath } from "next/cache";

import { getSessionActor } from "@/features/auth/actor";

import { WidgetServiceError } from "./errors";
import { getWidgetService } from "./wiring";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const MESSAGE: Record<string, string> = {
  forbidden: "Você não tem acesso a este parceiro.",
  not_found: "Parceiro não encontrado.",
  invalid_input: "Dados inválidos. Revise e tente de novo.",
  database: "Não foi possível concluir agora. Tente de novo.",
};

function codeOf(error: unknown): string {
  return error instanceof WidgetServiceError && error.code !== "database" ? error.code : "desconhecido";
}

export async function saveWidgetConfigAction(input: { accentColor: string; cartTargetDomain: string; enabled: boolean }): Promise<ActionResult<void>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  try {
    await getWidgetService().saveConfig(actor, input);
  } catch (error) {
    const code = codeOf(error);
    console.error("salvar configuração do widget", error instanceof Error ? `${error.name}: ${error.message}` : "erro");
    return { ok: false, code, message: MESSAGE[code] ?? "Não foi possível concluir agora." };
  }
  revalidatePath("/b2b/widget");
  return { ok: true, data: undefined };
}
