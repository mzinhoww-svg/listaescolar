"use client";

import { useState, useTransition } from "react";

import { EVENT_CATALOG } from "@/features/notifications/catalog";
import { externalEvents, preferenceEnabled, type ChannelAvailability, type PreferenceChannel } from "@/features/notifications/preferences";
import type { PreferenceRow } from "@/features/notifications/queries-types";

type Result = { status: "ok" } | { status: "error"; code: string };
const MESSAGES: Record<string, string> = {
  channel_unavailable: "Esse canal não está disponível agora.",
  invalid: "Não foi possível salvar essa preferência.",
  unavailable: "Não foi possível salvar agora. Tente de novo.",
};
const CHANNELS: { key: PreferenceChannel; label: string; off: string }[] = [
  { key: "web_push", label: "Navegador", off: "indisponível neste ambiente" },
  { key: "email", label: "E-mail", off: "indisponível no momento" },
];

/** Preferências por evento x canal. A central (in-app) está sempre ligada; navegador e e-mail são opt-in e só aparecem ligáveis se existirem. */
export function PreferencesForm({ prefs, availability, save }: {
  prefs: PreferenceRow[];
  availability: ChannelAvailability;
  save: (input: { event: string; channel: PreferenceChannel; enabled: boolean }) => Promise<Result>;
}) {
  const [state, setState] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const key = (e: string, c: string) => `${e}:${c}`;
  const value = (e: string, c: PreferenceChannel) => state[key(e, c)] ?? preferenceEnabled(prefs, e, c);

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

  return (
    <section aria-label="Preferências de aviso" className="flex flex-col gap-3">
      <p className="text-texto-2 text-[13px] font-medium">A central de notificações está sempre ligada. Escolha onde mais avisar.</p>
      {externalEvents().map((e) => {
        const title = EVENT_CATALOG[e].title({});
        return (
          <fieldset key={e} className="bg-branco-tonal rounded-[20px] p-4">
            <legend className="px-1 text-[14px] font-extrabold">{title}</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {CHANNELS.map((c) => {
                const on = value(e, c.key);
                const available = availability[c.key];
                return (
                  <label key={c.key} className="flex min-h-11 items-center gap-2 text-[14px] font-semibold">
                    <input
                      type="checkbox"
                      className="size-5"
                      aria-label={`${title}: avisar ${c.key === "web_push" ? "no navegador" : "por e-mail"}`}
                      checked={on}
                      disabled={pending || (!available && !on)}
                      onChange={(ev) => toggle(e, c.key, ev.target.checked)}
                    />
                    <span>{c.label}</span>
                    {!available ? <span className="text-texto-3 text-[12px]">{c.off}</span> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <div aria-live="polite">
        {message ? (
          <p role={message.kind === "ok" ? "status" : "alert"} className={`rounded-campo px-4 py-3 text-[13px] font-bold ${message.kind === "ok" ? "bg-campo" : "bg-erro-fundo text-erro-texto"}`}>{message.text}</p>
        ) : null}
      </div>
    </section>
  );
}
