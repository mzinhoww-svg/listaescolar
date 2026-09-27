"use client";

import { useEffect, useState, useTransition } from "react";

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
  // D-080 (S18): guarda a ASSINATURA (não só o endpoint), para "Desativar" poder chamar sub.unsubscribe() no
  // navegador (senão o navegador continua "assinado" mesmo depois de o servidor esquecer o endpoint).
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [pending, start] = useTransition();

  // D-080 (S18): ao carregar, consulta pushManager.getSubscription() — sem isto o botão sempre voltava a
  // "Ativar" depois de recarregar a página, mesmo com a assinatura ainda ativa no navegador.
  useEffect(() => {
    if (!publicKey || !supported()) return;
    let cancelled = false;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((existing) => {
        if (!cancelled && existing) setSub(existing);
      })
      .catch(() => {
        // sem service worker registrado ainda: segue mostrando "Ativar", sem erro visível
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (!publicKey) return <p className="text-texto-2 text-[13px] font-semibold">Notificação do navegador: indisponível neste ambiente.</p>;
  if (!supported()) return <p className="text-texto-2 text-[13px] font-semibold">Este navegador não oferece notificações push.</p>;

  const activate = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setMsg({ kind: "error", text: "As notificações estão bloqueadas neste navegador. Libere nas configurações do navegador." });
        const reg = await navigator.serviceWorker.register("/sw.js");
        const newSub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
        const json = newSub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return setMsg({ kind: "error", text: ERRORS.invalid! });
        const r = await subscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
        if (r.status === "ok") {
          setSub(newSub);
          setMsg({ kind: "ok", text: "Notificações do navegador ativadas neste aparelho." });
        } else setMsg({ kind: "error", text: ERRORS[r.code] ?? ERRORS.invalid! });
      } catch {
        setMsg({ kind: "error", text: "Não foi possível ativar agora. Tente de novo." });
      }
    });

  const deactivate = () =>
    start(async () => {
      if (!sub) return;
      const r = await unsubscribe({ endpoint: sub.endpoint });
      if (r.status === "ok") {
        // D-080 (S18): desfaz a assinatura no NAVEGADOR também (antes só o servidor esquecia o endpoint).
        try {
          await sub.unsubscribe();
        } catch {
          // best-effort: o servidor já esqueceu o endpoint, que é o que importa para o envio
        }
        setSub(null);
        setMsg({ kind: "ok", text: "Notificações do navegador desativadas neste aparelho." });
      } else setMsg({ kind: "error", text: "Não foi possível desativar agora." });
    });

  return (
    <div className="flex flex-col gap-2">
      {sub ? (
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
