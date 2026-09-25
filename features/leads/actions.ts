"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionActor } from "@/features/stationeries/actor";

import { normalizeLeadCode } from "./code";
import { leadErrorCode } from "./messages";
import { getLeadService } from "./wiring";

const uuid = z.uuid();

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function logAndCode(what: string, error: unknown): string {
  const code = leadErrorCode(error);
  console.error(what, error instanceof Error ? `${error.name}: ${error.message}` : "erro");
  return code;
}

/** Pedir cotação: exige sessão, papel `parent` (no serviço) e o checkbox de consentimento. */
export async function createLeadAction(formData: FormData): Promise<void> {
  const cart = uuid.safeParse(text(formData, "carrinho"));
  const back = cart.success ? `/cotacao/nova?carrinho=${cart.data}` : "/cotacao/nova";
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(back)}`);
  let code: string;
  try {
    const created = await getLeadService().createLead(actor, {
      cartId: text(formData, "carrinho"),
      stationeryId: text(formData, "stationeryId"),
      neighborhood: text(formData, "neighborhood"),
      consent: formData.get("consent") === "on",
      idempotencyKey: text(formData, "idempotencyKey"),
    });
    code = created.code;
  } catch (error) {
    const erro = logAndCode("criar lead", error);
    redirect(`${back}${back.includes("?") ? "&" : "?"}erro=${erro}`);
  }
  revalidatePath("/cotacao");
  redirect(`/cotacao/${code}`);
}

/** Abre o WhatsApp: registra `whatsapp_opened` e redireciona para o `wa.me` montado no servidor. */
export async function openWhatsappAction(formData: FormData): Promise<void> {
  const code = normalizeLeadCode(text(formData, "code"));
  if (code === null) redirect("/cotacao?erro=not_found");
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(`/cotacao/${code}`)}`);
  let url: string;
  try {
    url = (await getLeadService().openWhatsapp(actor, code)).url;
  } catch (error) {
    redirect(`/cotacao/${code}?erro=${logAndCode("abrir WhatsApp", error)}`);
  }
  // defesa em profundidade: só https://wa.me/... sai daqui
  let target: URL | null = null;
  try {
    target = new URL(url);
  } catch {
    target = null;
  }
  if (target === null || target.protocol !== "https:" || target.host !== "wa.me") {
    console.error("abrir WhatsApp", "URL fora do wa.me");
    redirect(`/cotacao/${code}?erro=whatsapp_unavailable`);
  }
  revalidatePath(`/cotacao/${code}`);
  redirect(url);
}

export async function cancelLeadAction(formData: FormData): Promise<void> {
  const code = normalizeLeadCode(text(formData, "code"));
  if (code === null) redirect("/cotacao?erro=not_found");
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(`/cotacao/${code}`)}`);
  try {
    await getLeadService().cancelLead(actor, { code });
  } catch (error) {
    redirect(`/cotacao/${code}?erro=${logAndCode("cancelar lead", error)}`);
  }
  revalidatePath("/cotacao");
  redirect(`/cotacao/${code}?ok=cancelado`);
}

type StationeryOp = (svc: ReturnType<typeof getLeadService>, actor: NonNullable<Awaited<ReturnType<typeof getSessionActor>>>, code: string) => Promise<unknown>;

async function stationeryAction(formData: FormData, what: string, op: StationeryOp): Promise<void> {
  const code = normalizeLeadCode(text(formData, "code"));
  if (code === null) redirect("/papelaria/leads?erro=not_found");
  const base = `/papelaria/leads/${code}`;
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(base)}`);
  try {
    await op(getLeadService(), actor, code);
  } catch (error) {
    redirect(`${base}?erro=${logAndCode(what, error)}`);
  }
  revalidatePath("/papelaria/leads");
  revalidatePath(base);
  redirect(`${base}?ok=1`);
}

const optional = (formData: FormData, key: string): { [k: string]: string } => {
  const v = formData.get(key);
  return typeof v === "string" ? { [key]: v } : {};
};

/** Papelaria: em atendimento, cotação enviada (valor opcional) ou aguardando o responsável. */
export async function updateLeadStatusAction(formData: FormData): Promise<void> {
  await stationeryAction(formData, "atualizar status do lead", (svc, actor, code) =>
    svc.updateStatus(actor, { code, to: text(formData, "to"), ...optional(formData, "amount") }),
  );
}

/** "Vendi": venda declarada pela papelaria (valor opcional). */
export async function declareSaleAction(formData: FormData): Promise<void> {
  await stationeryAction(formData, "declarar venda", (svc, actor, code) =>
    svc.declareSale(actor, { code, ...optional(formData, "amount") }),
  );
}

/** "Não fechou": motivo obrigatório. */
export async function closeLostAction(formData: FormData): Promise<void> {
  await stationeryAction(formData, "encerrar lead", (svc, actor, code) =>
    svc.closeLost(actor, { code, reason: text(formData, "reason") }),
  );
}
