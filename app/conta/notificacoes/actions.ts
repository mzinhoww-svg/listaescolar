"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { channelAvailability, parsePushSubscription, savePreferenceSchema, unsubscribeSchema, watchSchema } from "@/features/notifications/preferences";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PATH = "/conta/notificacoes";
export type ActionResult = { status: "ok" } | { status: "error"; code: "invalid" | "channel_unavailable" | "limit" | "endpoint_taken" | "unavailable" };
const fail = (code: Extract<ActionResult, { status: "error" }>["code"]): ActionResult => ({ status: "error", code });

/** Sessão obrigatória; o perfil vem SÓ dela (nenhum campo de formulário define `profile_id`). */
async function actorOrLogin(): Promise<SessionActor> {
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(PATH)}`);
  return actor;
}
const env = (): Record<string, string | undefined> => process.env;
const hintOf = (e: unknown): string | null => {
  const h = (e as { hint?: unknown } | null)?.hint;
  return typeof h === "string" ? h : null;
};

/** Marcar como lida: só pela função do servidor (grava now()), do perfil da sessão. */
export async function markReadAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await createAdminClient().rpc("notifications_mark_read", { p_profile_id: actor.userId, p_ids: [id.data] });
  revalidatePath(PATH);
}

export async function markAllReadAction(): Promise<void> {
  const actor = await actorOrLogin();
  await createAdminClient().rpc("notifications_mark_read", { p_profile_id: actor.userId, p_ids: null });
  revalidatePath(PATH);
}

/** Liga/desliga um canal para um evento. Ligar exige canal REAL neste ambiente; desligar é sempre permitido. */
export async function savePreferenceAction(input: unknown): Promise<ActionResult> {
  const actor = await actorOrLogin();
  const p = savePreferenceSchema.safeParse(input);
  if (!p.success) return fail("invalid");
  if (p.data.enabled && !channelAvailability(env())[p.data.channel]) return fail("channel_unavailable");
  const client = await createClient();
  const { error } = await client
    .from("notification_preferences")
    .upsert({ profile_id: actor.userId, event_type: p.data.event, channel: p.data.channel, enabled: p.data.enabled }, { onConflict: "profile_id,event_type,channel" });
  if (error) return fail("unavailable");
  revalidatePath(PATH);
  return { status: "ok" };
}

export async function subscribePushAction(input: unknown): Promise<ActionResult> {
  const actor = await actorOrLogin();
  const p = parsePushSubscription(input, env().APP_ENV);
  if (!p.success) return fail("invalid");
  if (!channelAvailability(env()).web_push) return fail("channel_unavailable");
  const { error } = await createAdminClient().rpc("push_subscription_upsert", { p_profile_id: actor.userId, p_endpoint: p.data.endpoint, p_p256dh: p.data.keys.p256dh, p_auth: p.data.keys.auth });
  if (error) {
    const hint = hintOf(error);
    return fail(hint === "subscription_limit" ? "limit" : hint === "endpoint_owned" ? "endpoint_taken" : "unavailable");
  }
  revalidatePath(PATH);
  return { status: "ok" };
}

export async function unsubscribePushAction(input: unknown): Promise<ActionResult> {
  const actor = await actorOrLogin();
  const p = unsubscribeSchema.safeParse(input);
  if (!p.success) return fail("invalid");
  const client = await createClient();
  const { error } = await client.from("push_subscriptions").delete().eq("profile_id", actor.userId).eq("endpoint", p.data.endpoint);
  if (error) return fail("unavailable");
  revalidatePath(PATH);
  return { status: "ok" };
}

/** "Me avise" (App24): cria o acompanhamento com a função do servidor; a escola é resolvida pelo INEP no servidor. */
export async function watchListAction(input: unknown): Promise<ActionResult> {
  const actor = await actorOrLogin();
  const p = watchSchema.safeParse(input);
  if (!p.success) return fail("invalid");
  const admin = createAdminClient();
  const school = await admin.from("schools").select("id").eq("inep", p.data.inep).maybeSingle();
  if (school.error || !school.data) return fail(school.error ? "unavailable" : "invalid");
  const { data, error } = await admin.rpc("list_watch_add", { p_profile_id: actor.userId, p_school_id: (school.data as { id: string }).id, p_grade_slug: p.data.gradeSlug, p_year: p.data.year });
  if (error) return fail("unavailable");
  if (data === "added" || data === "exists") {
    revalidatePath(PATH);
    return { status: "ok" };
  }
  return fail(data === "limit" ? "limit" : "invalid");
}

export async function unwatchListAction(input: unknown): Promise<ActionResult> {
  const actor = await actorOrLogin();
  const p = watchSchema.safeParse(input);
  if (!p.success) return fail("invalid");
  const admin = createAdminClient();
  const school = await admin.from("schools").select("id").eq("inep", p.data.inep).maybeSingle();
  if (school.error || !school.data) return fail(school.error ? "unavailable" : "invalid");
  const { error } = await admin.rpc("list_watch_remove", { p_profile_id: actor.userId, p_school_id: (school.data as { id: string }).id, p_grade_slug: p.data.gradeSlug, p_year: p.data.year });
  if (error) return fail("unavailable");
  revalidatePath(PATH);
  return { status: "ok" };
}

/** Versão de formulário do "Parar" da lista de acompanhamentos (os campos são só o alvo; o perfil é o da sessão). */
export async function unwatchFormAction(formData: FormData): Promise<void> {
  await unwatchListAction({ inep: String(formData.get("inep") ?? ""), gradeSlug: String(formData.get("gradeSlug") ?? ""), year: Number(formData.get("year")) });
}
