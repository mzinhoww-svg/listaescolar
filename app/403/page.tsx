import type { Metadata } from "next";
import Link from "next/link";

import { HomeIcon, LockIcon } from "@/components/auth/icons";
import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";

/** Destino de redirecionamento de `requireAccess`: responde 200 de propósito (Ruling da S29, ver ledger). */
export const metadata: Metadata = { title: "Sem acesso · ListaCerta", robots: { index: false, follow: false } };

export default function ForbiddenPage() {
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5">
        <div className="flex-1" />
        <div className="flex flex-col gap-3.5">
          <div className="bg-tinta flex size-24 items-center justify-center rounded-[30px]">
            <LockIcon />
          </div>
          <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">
            Sem acesso a esta área
          </h1>
          <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
            Esta área é só para quem administra a escola ou trabalha na equipe da ListaCerta. Se você deveria ter acesso, entre com a conta certa ou peça a quem administra a escola.
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
