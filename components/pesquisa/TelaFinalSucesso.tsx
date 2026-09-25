"use client";

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
      className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-6 px-5 py-16 text-center"
    >
      <h1 className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em]">
        Pronto! Ajude outra mãe a economizar tempo.
      </h1>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-verde-fundo rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold text-white"
      >
        Enviar para outra mãe
      </a>
    </section>
  );
}
