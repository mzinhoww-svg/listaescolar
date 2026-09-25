import type { Metadata } from "next";
import Link from "next/link";

import { SearchIcon } from "@/components/auth/icons";
import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";

export const metadata: Metadata = {
  title: "Página não encontrada · ListaCerta",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5">
        <div className="flex-1" />
        <div className="flex flex-col gap-4">
          <p className="text-[120px] leading-[0.9] font-extrabold tracking-[-0.06em]" aria-hidden>
            4<span className="text-verde-certo">0</span>4
          </p>
          <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">
            Esta página não está na lista
          </h1>
          <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
            O endereço pode ter mudado. Busque a escola ou volte ao início.
          </p>
        </div>
        <div className="flex-1" />
        <Link href="/escolas" className={primaryButton}>
          <SearchIcon />
          Buscar escola
        </Link>
        <Link href="/" className={outlineButton}>
          Ir para o início
        </Link>
      </div>
    </Screen>
  );
}
