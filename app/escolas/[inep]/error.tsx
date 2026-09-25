"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";

/** Falha do banco: mensagem fixa, sem detalhe técnico; o retry refaz a consulta no servidor (refresh + reset). */
export default function SchoolError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5" role="alert">
        <div className="flex-1" />
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Não conseguimos abrir a escola agora</h1>
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          Houve um problema ao consultar esta escola. Tente de novo em instantes.
        </p>
        <div className="flex-1" />
        <button type="button" onClick={retry} className={primaryButton}>
          Tentar de novo
        </button>
        <Link href="/" className={outlineButton}>
          Ir para o início
        </Link>
      </div>
    </Screen>
  );
}
