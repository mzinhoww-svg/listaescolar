import Link from "next/link";

import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";

/** Escola, série ou ano inválidos: página única, sem distinguir o motivo. */
export default function ListNotFound() {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5">
        <div className="flex-1" />
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Lista não encontrada</h1>
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          Não há escola, série ou ano com estes dados no ListaCerta. Confira o endereço ou busque pela escola.
        </p>
        <div className="flex-1" />
        <Link href="/escolas" className={primaryButton}>
          Buscar escola
        </Link>
        <Link href="/" className={outlineButton}>
          Ir para o início
        </Link>
      </div>
    </Screen>
  );
}
