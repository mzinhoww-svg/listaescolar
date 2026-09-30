"use client";

import Link from "next/link";

import { Button, buttonClass } from "@/components/ui/Button";

type Kind = "unavailable" | "failed" | "lost";
const COPY: Record<Kind, { title: string; body: string }> = {
  unavailable: {
    title: "Leitura automática indisponível no momento",
    body: "Seu envio foi recebido e o arquivo está guardado. Sem a leitura automática não mostramos os itens agora. Não precisa enviar de novo: reenviar cria outro envio do mesmo arquivo. Volte em Meus envios para ver o andamento.",
  },
  failed: {
    title: "Não foi possível ler este arquivo",
    body: "A leitura não terminou e este envio não vale como lista. Envie outro arquivo: um PDF gerado no computador costuma ler melhor que foto.",
  },
  lost: {
    title: "Não conseguimos atualizar o andamento",
    body: "Verifique sua conexão e recarregue a página. O envio já foi feito: ele continua em Meus envios.",
  },
};

/** Estados sem resultado: indisponível, erro e perda de conexão. Cada um diz se o envio valeu e dá saída (UX-062). */
export function StatusNotice({ kind }: { kind: Kind }) {
  const c = COPY[kind];
  const primary = "mt-auto w-full";
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-6 pt-14 pb-9">
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">{c.title}</h1>
      <p role={kind === "failed" ? "alert" : undefined} className="text-texto-2 text-[15px] leading-[1.45] font-semibold">
        {c.body}
      </p>
      {kind === "unavailable" ? (
        <Link href="/conta/envios" className={buttonClass("primary", "lg", primary)}>Ver meus envios</Link>
      ) : kind === "failed" ? (
        <Link href="/enviar-lista" className={buttonClass("primary", "lg", primary)}>Enviar outro arquivo</Link>
      ) : (
        <Button size="lg" className={primary} onClick={() => window.location.reload()}>Recarregar a página</Button>
      )}
      <nav aria-label="Outras opções" className="flex flex-wrap gap-x-4">
        {kind === "unavailable" ? null : <Link href="/conta/envios" className={buttonClass("text")}>Ver meus envios</Link>}
        <Link href="/conta" className={buttonClass("text")}>Ir para minha conta</Link>
      </nav>
    </main>
  );
}
