import "server-only";

import { z } from "zod";

import type { SessionActor } from "@/features/auth/actor";
import { createClient } from "@/lib/supabase/server";

import { NOTIFICATION_EVENTS } from "./catalog";
import type { NotificationRow, PreferenceRow, WatchRow } from "./queries-types";

export const PAGE_SIZE = 20;

const row = z.object({
  id: z.string().uuid(),
  event_type: z.enum(NOTIFICATION_EVENTS),
  params: z.unknown(),
  link_path: z.string(),
  is_demo: z.boolean(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

/** Notificações do DONO (RLS + filtro explícito), não lidas primeiro, 20 por página. */
export async function listNotifications(actor: SessionActor, page: number): Promise<{ items: NotificationRow[]; total: number }> {
  const client = await createClient();
  const from = (Math.max(1, page) - 1) * PAGE_SIZE;
  const { data, count, error } = await client
    .from("notifications")
    .select("id, event_type, params, link_path, is_demo, read_at, created_at", { count: "exact" })
    .eq("recipient_id", actor.userId)
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("notifications_unavailable");
  const items = z.array(row).parse(data ?? []).map((r): NotificationRow => ({ id: r.id, eventType: r.event_type, params: r.params, linkPath: r.link_path, isDemo: r.is_demo, readAt: r.read_at, createdAt: r.created_at }));
  return { items, total: count ?? items.length };
}

/** Contagem só do banco (nada de estado no cliente). */
export async function unreadCount(actor: SessionActor): Promise<number> {
  const client = await createClient();
  const { count, error } = await client.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", actor.userId).is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function listPreferences(actor: SessionActor): Promise<PreferenceRow[]> {
  const client = await createClient();
  const { data, error } = await client.from("notification_preferences").select("event_type, channel, enabled").eq("profile_id", actor.userId);
  if (error) throw new Error("preferences_unavailable");
  return z.array(z.object({ event_type: z.string(), channel: z.string(), enabled: z.boolean() })).parse(data ?? []);
}

export async function activePushCount(actor: SessionActor): Promise<number> {
  const client = await createClient();
  const { count } = await client.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("profile_id", actor.userId).is("revoked_at", null);
  return count ?? 0;
}

export async function listWatches(actor: SessionActor): Promise<WatchRow[]> {
  const client = await createClient();
  const { data, error } = await client
    .from("list_watches")
    .select("id, school_year, schools!inner(inep, name), grades!inner(slug, name)")
    .eq("profile_id", actor.userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("watches_unavailable");
  const shape = z.array(z.object({ id: z.string().uuid(), school_year: z.number().int(), schools: z.object({ inep: z.string(), name: z.string() }), grades: z.object({ slug: z.string(), name: z.string() }) }));
  return shape.parse(data ?? []).map((w) => ({ id: w.id, inep: w.schools.inep, schoolName: w.schools.name, gradeSlug: w.grades.slug, gradeLabel: w.grades.name, year: w.school_year }));
}

/** O usuário já acompanha esta (escola, série, ano)? */
export async function isWatching(actor: SessionActor, w: { inep: string; gradeSlug: string; year: number }): Promise<boolean> {
  return (await listWatches(actor)).some((x) => x.inep === w.inep && x.gradeSlug === w.gradeSlug && x.year === w.year);
}
