"use server";

import { revalidatePath } from "next/cache";

import { getSessionActor } from "@/features/auth/actor";

import { webhookServiceErrorCode, webhookServiceMessage } from "./messages";
import { getWebhookService } from "./wiring";

// Server Actions finas do portal de webhooks (mesmo padrão de `features/b2b/actions.ts`). O segredo em claro
// devolve DIRETO para quem chamou (componente cliente que mostra, copia e descarta) — nunca por redirect, cookie,
// URL ou log.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

function logAndCode(what: string, error: unknown): string {
  const code = webhookServiceErrorCode(error);
  console.error(what, error instanceof Error ? `${error.name}: ${error.message}` : "erro");
  return code;
}

function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  return promise.then(
    (data) => ({ ok: true as const, data }),
    (error) => {
      const code = logAndCode("ação de webhook", error);
      return { ok: false as const, code, message: webhookServiceMessage(code) ?? "Não foi possível concluir agora." };
    },
  );
}

export async function createEndpointAction(input: { url: string; events: string[] }): Promise<ActionResult<{ endpointId: string; secret: string }>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getWebhookService().createEndpoint(actor, input));
  if (result.ok) revalidatePath("/b2b/webhooks");
  return result;
}

export async function updateEndpointAction(input: { endpointId: string; url: string; events: string[] }): Promise<ActionResult<void>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getWebhookService().updateEndpoint(actor, input.endpointId, { url: input.url, events: input.events }));
  if (result.ok) revalidatePath("/b2b/webhooks");
  return result;
}

export async function rotateSecretAction(input: { endpointId: string }): Promise<ActionResult<{ secret: string }>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getWebhookService().rotateSecret(actor, input.endpointId));
  if (result.ok) revalidatePath("/b2b/webhooks");
  return result;
}

export async function revealSecretAction(input: { endpointId: string }): Promise<ActionResult<{ secret: string }>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  return toResult(getWebhookService().revealSecret(actor, input.endpointId));
}

export async function resendDeliveryAction(input: { deliveryId: string }): Promise<ActionResult<{ deliveryId: string }>> {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, code: "forbidden", message: "Entre para continuar." };
  const result = await toResult(getWebhookService().resendDelivery(actor, input));
  if (result.ok) revalidatePath("/b2b/webhooks");
  return result;
}
