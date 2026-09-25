import type { Metadata } from "next";
import Link from "next/link";

import { HomeIcon, LockIcon } from "@/components/auth/icons";
import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";

export const metadata: Metadata = { title: "Erro 403 · ListaCerta" };

export default function ForbiddenPage() {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5">
        <div className="flex-1" />
        <div className="flex flex-col gap-3.5">
          <div className="bg-tinta flex size-24 items-center justify-center rounded-[30px]">
            <LockIcon />
          </div>
          <p className="text-texto-3 text-xs font-extrabold tracking-[0.16em] uppercase">
            Erro 403
          </p>
          <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">
            Você não tem acesso a esta página
          </h1>
          <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
            Ela é restrita a administradores desta escola ou do ListaCerta.
          </p>
        </div>
        <div className="flex-1" />
        <Link href="/" className={primaryButton}>
          <HomeIcon />
          Ir para o início
        </Link>
        <Link href="/entrar" className={outlineButton}>
          Entrar com outra conta
        </Link>
      </div>
    </Screen>
  );
}
