import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { NotificationList } from "@/components/notifications/NotificationList";
import { PreferencesForm } from "@/components/notifications/PreferencesForm";
import { PushOptIn } from "@/components/notifications/PushOptIn";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { channelAvailability } from "@/features/notifications/preferences";
import { activePushCount, listNotifications, listPreferences, listWatches, PAGE_SIZE, unreadCount } from "@/features/notifications/queries";

import { markAllReadAction, markReadAction, savePreferenceAction, subscribePushAction, unsubscribePushAction, unwatchFormAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notificações · ListaCerta", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ pagina?: string | string[] }> }) {
  await requireAccess("/conta/notificacoes");
  const actor = await getSessionActor();
  const raw = (await searchParams).pagina;
  const page = z.coerce.number().int().min(1).max(500).catch(1).parse(Array.isArray(raw) ? raw[0] : raw);
  if (!actor) return null;
  const data = await Promise.all([listNotifications(actor, page), unreadCount(actor), listPreferences(actor), listWatches(actor), activePushCount(actor)]).catch(() => null);
  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-[420px] flex-col gap-4 px-6 pt-10">
        <h1 className="text-[28px] font-extrabold">Notificações</h1>
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Não foi possível carregar. <Link href="/conta/notificacoes" className="underline">Tentar de novo</Link>
        </p>
      </main>
    );
  }
  {
    const [list, unread, prefs, watches, pushCount] = data;
    const availability = channelAvailability(process.env);
    return (
      <main className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-10 pb-12">
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Notificações</h1>
        <NotificationList items={list.items} unread={unread} page={page} pageCount={Math.max(1, Math.ceil(list.total / PAGE_SIZE))} markRead={markReadAction} markAllRead={markAllReadAction} />
        <section aria-labelledby="pref" className="flex flex-col gap-3">
          <h2 id="pref" className="text-[18px] font-extrabold">Preferências</h2>
          <PreferencesForm prefs={prefs} availability={availability} save={savePreferenceAction} />
          <PushOptIn publicKey={availability.web_push ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null) : null} subscribe={subscribePushAction} unsubscribe={unsubscribePushAction} />
          {pushCount > 0 ? <p className="text-texto-3 text-[12px] font-semibold">Aparelhos com aviso ligado: {pushCount}.</p> : null}
        </section>
        <section aria-labelledby="watch" className="flex flex-col gap-3">
          <h2 id="watch" className="text-[18px] font-extrabold">Listas que você acompanha</h2>
          {watches.length === 0 ? (
            <p className="text-texto-2 text-[13px] font-semibold">Nenhuma ainda. Em uma lista ainda não publicada, use “Me avise”.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {watches.map((w) => (
                <li key={w.id} className="bg-campo flex items-center justify-between gap-3 rounded-[16px] px-4 py-3 text-[14px] font-semibold">
                  <Link href={`/escolas/${w.inep}/${w.gradeSlug}?ano=${w.year}`} className="underline">{w.schoolName} · {w.gradeLabel} · {w.year}</Link>
                  <form action={unwatchFormAction}>
                    <input type="hidden" name="inep" value={w.inep} />
                    <input type="hidden" name="gradeSlug" value={w.gradeSlug} />
                    <input type="hidden" name="year" value={w.year} />
                    <button type="submit" className="min-h-11 text-[13px] font-extrabold underline">Parar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  }
}
