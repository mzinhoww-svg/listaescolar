"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";

/**
 * Aviso discreto de medição de uso. É uma sobreposição FIXA NO TOPO, fora do fluxo: não reserva nem empurra conteúdo (sem
 * mudança de layout quando aparece depois do `requestIdleCallback`, CLS 0) e não deixa a tela de 100dvh mais alta que a janela.
 * Fica no topo e não no rodapé para não cobrir ações fixas de baixo (ex.: "Começar" da pesquisa, "Montar carrinho").
 * Entra só com opacidade e `transform` (S29 T10). Nada é enviado antes da escolha; recusar não tira nenhuma função do site.
 * Aceitar e Recusar têm o mesmo peso visual.
 */
export function ConsentNotice({ onAccept, onDeny }: { onAccept: () => void; onDeny: () => void }) {
  return (
    <div role="region" aria-label="Medição de uso" className="border-linha bg-papel fixed inset-x-0 top-0 z-50 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 motion-safe:animate-[offline-in_var(--mov-base)_ease-out]">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-texto-2 flex-1 text-[14px] leading-snug font-medium">
          Podemos medir como o site é usado, sem usar seu nome, e-mail ou telefone, para melhorar as listas. Nada é enviado antes da sua escolha.{" "}
          <Link href="/privacidade" className="text-verde-fundo font-bold underline">
            Saiba mais
          </Link>
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={onAccept}>
            Aceitar
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={onDeny}>
            Recusar
          </Button>
        </div>
      </div>
    </div>
  );
}
