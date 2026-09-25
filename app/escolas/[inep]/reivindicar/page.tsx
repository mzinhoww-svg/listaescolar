import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { outlineButton, primaryButton, Screen } from "@/components/auth/Screen";
import { loadSchool } from "@/features/schools/search/load-school";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ inep: string }> };

export const metadata: Metadata = {
  title: "Reivindicar perfil · ListaCerta",
  robots: { index: false, follow: false },
};

/** Página honesta até a S06: sem formulário, sem promessa de prazo. */
export default async function ClaimPage({ params }: Props) {
  const { inep } = await params;
  const school = await loadSchool(inep);
  if (!school) notFound();
  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-3.5">
        <div className="flex-1" />
        <p className="text-verde-fundo text-xs font-extrabold tracking-[0.15em] uppercase">Reivindicar perfil</p>
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Reivindicação em implantação</h1>
        <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
          O envio de pedidos para administrar o perfil de {school.name} ainda não está disponível. Nenhum dado é
          coletado nesta página.
        </p>
        <div className="flex-1" />
        <Link href={`/escolas/${school.inep}`} className={primaryButton}>
          Voltar ao perfil da escola
        </Link>
        <Link href="/escolas" className={outlineButton}>
          Buscar outra escola
        </Link>
      </div>
    </Screen>
  );
}
