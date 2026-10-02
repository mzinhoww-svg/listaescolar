"use client";

import { useState, useSyncExternalStore } from "react";

import { chromeIntentUrl, type InAppBrowser } from "@/features/auth/in-app-browser";

const NAMES: Record<InAppBrowser, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

/** Aviso em navegador embutido: o link do e-mail abre em outro navegador, então o código é o caminho seguro. */
export function InAppBrowserNotice({ app }: { app: InAppBrowser }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  function openExternal() {
    const intent = chromeIntentUrl(window.location.href);
    if (intent) window.location.href = intent;
  }
  // Intent só existe no Android; no iOS a saída é copiar o link e colar no Safari.
  const android = useSyncExternalStore(
    () => () => undefined,
    () => /Android/i.test(navigator.userAgent),
    () => false,
  );

  return (
    <div
      role="note"
      data-testid="in-app-notice"
      className="bg-campo rounded-campo flex flex-col gap-2.5 p-4"
    >
      <p className="text-tinta text-[13px] leading-[1.4] font-semibold">
        Você está dentro do {NAMES[app]}. Para entrar, use o código de 6 dígitos que enviamos por
        e-mail ou abra esta página no navegador do celular.
      </p>
      <div className="flex gap-2">
        {android ? (
          <button
            type="button"
            onClick={openExternal}
            className="bg-tinta text-papel rounded-botao h-11 flex-1 text-sm font-bold"
          >
            Abrir no navegador
          </button>
        ) : null}
        <button
          type="button"
          onClick={copy}
          className="text-tinta rounded-botao h-11 flex-1 border border-current text-sm font-bold"
        >
          {copied ? "Link copiado" : "Copiar link"}
        </button>
      </div>
    </div>
  );
}
