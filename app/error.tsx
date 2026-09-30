"use client";

import Link from "next/link";

import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";

/** Erro de renderização de uma rota (S29, UX-005): diz o que ficou salvo e para onde ir; nada de "Algo deu errado" solto. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5">
        <div className="flex-1" />
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Não conseguimos carregar esta página</h1>
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          O que você já salvou continua salvo. O que estava sendo enviado agora pode não ter sido salvo: confira antes de repetir.
        </p>
        <Link href="/sobre" className="text-verde-fundo inline-flex min-h-11 items-center text-[14px] font-extrabold underline underline-offset-4">
          Como falar com a equipe
        </Link>
        <div className="flex-1" />
        <button type="button" onClick={reset} className={primaryButton}>
          Tentar de novo
        </button>
        <Link href="/" className={outlineButton}>
          Ir para o início
        </Link>
      </div>
    </Screen>
  );
}
