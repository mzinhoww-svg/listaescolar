"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";

/** Aviso discreto de medição de uso. Nada é enviado antes da escolha; recusar não tira nenhuma função do site. Aceitar e Recusar têm o mesmo peso visual (sem empurrar a escolha). */
export function ConsentNotice({ onAccept, onDeny }: { onAccept: () => void; onDeny: () => void }) {
  return (
    <div role="region" aria-label="Medição de uso" className="border-linha bg-papel fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 shadow-[0_-4px_16px_rgb(15_27_45/0.08)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-texto-2 flex-1 text-[13px] leading-snug font-medium">
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
