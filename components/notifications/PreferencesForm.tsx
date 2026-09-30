"use client";

import { useState, useTransition } from "react";

import { EVENT_CATALOG, type NotificationEvent } from "@/features/notifications/catalog";
import { externalEvents, preferenceEnabled, type ChannelAvailability, type PreferenceChannel } from "@/features/notifications/preferences";
import type { PreferenceRow } from "@/features/notifications/queries-types";

type Result = { status: "ok" } | { status: "error"; code: string };
const MESSAGES: Record<string, string> = {
  channel_unavailable: "Esse canal não está disponível agora.",
  invalid: "Não foi possível salvar essa preferência.",
  unavailable: "Não foi possível salvar agora. Tente de novo.",
};
const CHANNELS: { key: PreferenceChannel; label: string; aria: string; note: string }[] = [
  { key: "web_push", label: "Navegador", aria: "no navegador", note: "Aviso no navegador: canal ainda não disponível." },
  { key: "email", label: "E-mail", aria: "por e-mail", note: "Aviso por e-mail: canal ainda não disponível." },
];

/**
 * Preferências por evento x canal, numa lista única. A central (in-app) está sempre ligada; navegador e e-mail são
 * opt-in. Canal que não existe neste ambiente é explicado UMA vez (a nota) e as caixas apontam para ela.
 */
export function PreferencesForm({ prefs, availability, save, events }: {
  prefs: PreferenceRow[];
  availability: ChannelAvailability;
  save: (input: { event: string; channel: PreferenceChannel; enabled: boolean }) => Promise<Result>;
  /** Eventos do papel de quem vê a tela; padrão: todos os que aceitam canal externo. */
  events?: readonly NotificationEvent[];
}) {
  const [state, setState] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const key = (e: string, c: string) => `${e}:${c}`;
  const value = (e: string, c: PreferenceChannel) => state[key(e, c)] ?? preferenceEnabled(prefs, e, c);
  const list = events ?? externalEvents();

  const toggle = (event: string, channel: PreferenceChannel, enabled: boolean) => {
    setState((s) => ({ ...s, [key(event, channel)]: enabled }));
    start(async () => {
      const r = await save({ event, channel, enabled });
      if (r.status === "ok") setMessage({ kind: "ok", text: "Preferência salva." });
      else {
        setState((s) => ({ ...s, [key(event, channel)]: !enabled }));
        setMessage({ kind: "error", text: MESSAGES[r.code] ?? MESSAGES.unavailable! });
      }
    });
  };

  const unavailable = CHANNELS.filter((c) => !availability[c.key]);

  return (
    <section aria-label="Preferências de aviso" className="flex flex-col gap-3">
      <p className="text-texto-2 text-[14px] font-medium">A central de notificações está sempre ligada. Escolha onde mais avisar.</p>
      {unavailable.length > 0 ? (
        <ul className="text-texto-2 flex flex-col gap-1 text-[13px] font-semibold">
          {unavailable.map((c) => (
            <li key={c.key} id={`canal-${c.key}`}>
              {c.note}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="bg-branco-tonal divide-y divide-black/10 rounded-[20px] px-4">
        {list.map((e) => {
          const title = EVENT_CATALOG[e].title({});
          return (
            <li key={e}>
              <fieldset className="py-3">
                <legend className="pb-1 text-[14px] font-extrabold">{title}</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {CHANNELS.map((c) => {
                    const on = value(e, c.key);
                    const available = availability[c.key];
                    const blocked = !available && !on;
                    return (
                      <label key={c.key} className="flex min-h-11 items-center gap-2 text-[14px] font-semibold">
                        <input
                          type="checkbox"
                          className="size-5"
                          aria-label={`${title}: avisar ${c.aria}`}
                          aria-describedby={blocked ? `canal-${c.key}` : undefined}
                          checked={on}
                          disabled={pending || blocked}
                          onChange={(ev) => toggle(e, c.key, ev.target.checked)}
                        />
                        <span>{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite">
        {message ? (
          <p role={message.kind === "ok" ? "status" : "alert"} className={`rounded-campo px-4 py-3 text-[13px] font-bold ${message.kind === "ok" ? "bg-campo" : "bg-erro-fundo text-erro-texto"}`}>{message.text}</p>
        ) : null}
      </div>
    </section>
  );
}
