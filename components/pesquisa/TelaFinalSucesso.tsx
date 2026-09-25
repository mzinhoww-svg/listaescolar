"use client";

import { Cabecalho } from "./Cabecalho";
import styles from "./pesquisa.module.css";

type Props = { sessionId: string; g?: string };

/** Mensagem de agradecimento + botão de compartilhar via WhatsApp, com `ref` da sessão atual. */
export function TelaFinalSucesso({ sessionId, g }: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mensagem =
    `Estou respondendo uma pesquisa rápida sobre a compra da lista de material escolar. ` +
    `Leva 3 minutos: ${origin}/pesquisa?ref=${sessionId}&g=${g ?? "indicacao"}`;
  const href = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;

  return (
    <section
      aria-live="polite"
      className={`${styles.entrar} mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-1 flex-col gap-6 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]`}
    >
      <Cabecalho />
      <div className="bg-tinta text-papel rounded-card flex flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-center shadow-[0_16px_40px_rgba(15,27,45,0.22)]">
        <span
          aria-hidden
          className="bg-verde-certo text-tinta flex h-16 w-16 items-center justify-center rounded-full"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="m5.5 12.5 4 4L18.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
          Pronto! Ajude outra mãe a economizar tempo.
        </h1>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-verde-fundo focus-visible:outline-verde-fundo rounded-botao flex h-14 w-full items-center justify-center gap-2.5 text-base font-extrabold text-white shadow-[0_8px_24px_rgba(11,107,74,0.28)] transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99]"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3Zm0 1.8a7.2 7.2 0 1 1-3.7 13.4l-.3-.2-2.5.7.7-2.4-.2-.3A7.2 7.2 0 0 1 12 4.8Zm-2.6 3.7c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 5 4.3 2.4 1 2.9.8 3.5.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1a6.1 6.1 0 0 1-3-2.6c-.2-.4.2-.4.6-1.2.1-.2 0-.4 0-.5l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.5Z" />
        </svg>
        Enviar para outra mãe
      </a>
    </section>
  );
}
