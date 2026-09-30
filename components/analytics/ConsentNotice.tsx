"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";

/** Aviso discreto de medição de uso. Fica no fluxo, no topo da página (`order-first` no corpo em coluna), e não fixo no rodapé: assim não cobre ações fixas de baixo, como o "Começar" da pesquisa. Nada é enviado antes da escolha; recusar não tira nenhuma função do site. Aceitar e Recusar têm o mesmo peso visual (sem empurrar a escolha). */
export function ConsentNotice({ onAccept, onDeny }: { onAccept: () => void; onDeny: () => void }) {
  return (
    <div role="region" aria-label="Medição de uso" className="border-linha bg-papel order-first w-full border-b px-4 py-3">
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
