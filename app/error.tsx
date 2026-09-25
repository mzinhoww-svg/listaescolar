"use client";

import Link from "next/link";

import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5">
        <div className="flex-1" />
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">
          Algo deu errado
        </h1>
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          Não foi possível carregar esta página. Tente de novo.
        </p>
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
