"use client";

import { useState, useTransition } from "react";

type Result = { status: "ok" } | { status: "error"; code: string };
type Msg = { kind: "ok" | "error"; text: string } | null;

function keyBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const supported = (): boolean => typeof Notification !== "undefined" && typeof PushManager !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator;
const ERRORS: Record<string, string> = { limit: "Você já tem 5 aparelhos com aviso ligado. Remova um antes.", endpoint_taken: "Este navegador já está ligado a outra conta.", channel_unavailable: "Aviso no navegador indisponível neste ambiente.", invalid: "Não foi possível ativar neste navegador." };

/** Assinatura do Web Push. A permissão só é pedida DEPOIS do clique; negada = mensagem e nada gravado. */
export function PushOptIn({ publicKey, subscribe, unsubscribe }: {
  publicKey: string | null;
  subscribe: (input: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<Result>;
  unsubscribe: (input: { endpoint: string }) => Promise<Result>;
}) {
  const [msg, setMsg] = useState<Msg>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!publicKey) return <p className="text-texto-2 text-[13px] font-semibold">Notificação do navegador: indisponível neste ambiente.</p>;
  if (!supported()) return <p className="text-texto-2 text-[13px] font-semibold">Este navegador não oferece notificações push.</p>;

  const activate = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setMsg({ kind: "error", text: "As notificações estão bloqueadas neste navegador. Libere nas configurações do navegador." });
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
        const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return setMsg({ kind: "error", text: ERRORS.invalid! });
        const r = await subscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
        if (r.status === "ok") {
          setEndpoint(json.endpoint);
          setMsg({ kind: "ok", text: "Notificações do navegador ativadas neste aparelho." });
        } else setMsg({ kind: "error", text: ERRORS[r.code] ?? ERRORS.invalid! });
      } catch {
        setMsg({ kind: "error", text: "Não foi possível ativar agora. Tente de novo." });
      }
    });

  const deactivate = () =>
    start(async () => {
      if (!endpoint) return;
      const r = await unsubscribe({ endpoint });
      if (r.status === "ok") {
        setEndpoint(null);
        setMsg({ kind: "ok", text: "Notificações do navegador desativadas neste aparelho." });
      } else setMsg({ kind: "error", text: "Não foi possível desativar agora." });
    });

  return (
    <div className="flex flex-col gap-2">
      {endpoint ? (
        <button type="button" onClick={deactivate} disabled={pending} className="border-tinta text-tinta rounded-botao min-h-11 w-fit border-[1.5px] px-5 text-[13px] font-extrabold">Desativar neste navegador</button>
      ) : (
        <button type="button" onClick={activate} disabled={pending} className="bg-tinta text-papel rounded-botao min-h-11 w-fit px-5 text-[13px] font-extrabold disabled:opacity-60">Ativar neste navegador</button>
      )}
      <div aria-live="polite">
        {msg ? <p role={msg.kind === "ok" ? "status" : "alert"} className={`rounded-campo px-4 py-3 text-[13px] font-bold ${msg.kind === "ok" ? "bg-campo" : "bg-erro-fundo text-erro-texto"}`}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
