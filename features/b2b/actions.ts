"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";

import { b2bServiceErrorCode, b2bServiceMessage } from "./messages";
import type { GeneratedApiKey } from "./keys/format";
import { getB2bService } from "./wiring";

// Server Actions finas do portal (dono). `createKeyAction`/`rotateKeyAction` devolvem o texto claro da chave
// DIRETO para quem chamou (um componente cliente que mostra, copia e descarta) — nunca por redirect, cookie, URL
// ou log. As demais seguem o padrão redirect + `?erro=` de `features/leads/actions.ts`.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function logAndCode(what: string, error: unknown): string {
  const code = b2bServiceErrorCode(error);
  console.error(what, error instanceof Error ? `${error.name}: ${error.message}` : "erro");
  return code;
}

function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  return promise.then(
    (data) => ({ ok: true as const, data }),
    (error) => {
      const code = logAndCode("ação b2b", error);
      return { ok: false as const, code, message: b2bServiceMessage(code) ?? "Não foi possível concluir agora." };
    },
  );
}

/** Cadastro (B2B00 "Vamos conversar"). Sem sessão: "Entrar para enviar". */
export async function applyPartnerAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent("/parceiros#cadastro")}`);
  try {
    await getB2bService().applyPartner(actor, {
      tradeName: text(formData, "tradeName"),
      legalName: text(formData, "legalName"),
      cnpj: text(formData, "cnpj"),
      contactName: text(formData, "contactName"),
      partnerType: text(formData, "partnerType"),
      coverageUfs: formData.getAll("coverageUfs").length > 0 ? (formData.getAll("coverageUfs") as string[]) : undefined,
      termsAccepted: formData.get("termsAccepted") === "on",
    });
  } catch (error) {
    redirect(`/parceiros?erro=${logAndCode("cadastrar parceiro", error)}#cadastro`);
  }
  revalidatePath("/b2b");
  redirect("/b2b?ok=cadastro");
}

/** Emite uma chave nova. Devolve o texto claro UMA VEZ, direto para o componente cliente (nunca por redirect/URL). */
export async function createKeyAction(input: { environment: "test" | "live"; scopes: string[] }): Promise<ActionResult<GeneratedApiKey>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getB2bService().createKey(actor, input));
  if (result.ok) revalidatePath("/b2b/chaves");
  return result;
}

/** Rotaciona (carência 1/7/30 dias, padrão 7). Devolve o texto claro da chave NOVA uma vez; a antiga continua
 * válida durante a carência. */
export async function rotateKeyAction(input: { keyId: string; graceDays?: number }): Promise<ActionResult<GeneratedApiKey>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getB2bService().rotateKey(actor, input));
  if (result.ok) revalidatePath("/b2b/chaves");
  return result;
}

export async function revokeKeyAction(input: { keyId: string; reason?: string }): Promise<ActionResult<void>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getB2bService().revokeKey(actor, input));
  if (result.ok) revalidatePath("/b2b/chaves");
  return result;
}
