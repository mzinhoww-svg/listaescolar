"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribe(notify: () => void): () => void {
  window.addEventListener("offline", notify);
  window.addEventListener("online", notify);
  return () => {
    window.removeEventListener("offline", notify);
    window.removeEventListener("online", notify);
  };
}

/**
 * Aviso "Sem conexão" (S29, UX-006), sem depender do service worker: acompanha `navigator.onLine` e os eventos `offline`
 * e `online`. O texto não promete fila nem reenvio: o que envia dados só funciona quando a conexão volta. Ao voltar, confirma e some.
 */
export function OfflineNotice({ backMs = 3000 }: { backMs?: number }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [back, setBack] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onBack = () => {
      setBack(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBack(false), backMs);
    };
    const onOff = () => {
      clearTimeout(timer);
      setBack(false);
    };
    window.addEventListener("online", onBack);
    window.addEventListener("offline", onOff);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", onBack);
      window.removeEventListener("offline", onOff);
    };
  }, [backMs]);

  if (online && !back) return null;
  const offline = !online;
  return (
    <div
      role="status"
      className={`fixed inset-x-3 top-3 z-50 mx-auto max-w-[420px] rounded-campo px-4 py-3 text-[14px] font-bold motion-safe:animate-[offline-in_var(--mov-base)_ease-out] duration-mov-base ${
        offline ? "bg-aviso-fundo text-aviso-texto" : "bg-tinta text-papel"
      }`}
    >
      {offline ? "Sem conexão. O que envia dados só funciona quando ela voltar." : "Conexão de volta."}
    </div>
  );
}
