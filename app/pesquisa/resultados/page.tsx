import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServerEnv } from "@/lib/env";
import { aggregateSurvey } from "@/lib/pesquisa/agregacao";
import { RESULTS_COOKIE_NAME, verifyResultsCookie } from "@/lib/pesquisa/auth-resultados";
import { exportLeadsRows, exportResponsesRows } from "@/lib/pesquisa/repositorio";

import { Cabecalho } from "@/components/pesquisa/Cabecalho";
import { Cartoes } from "@/components/pesquisa/resultados/Cartoes";
import { Frases } from "@/components/pesquisa/resultados/Frases";
import { Funil } from "@/components/pesquisa/resultados/Funil";
import { PorOrigem } from "@/components/pesquisa/resultados/PorOrigem";
import { PorPergunta } from "@/components/pesquisa/resultados/PorPergunta";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resultados da pesquisa | ListaCerta",
  robots: { index: false, follow: false },
};

/** getServerEnv lança se faltar variável obrigatória do servidor; sem senha configurada, ninguém entra. */
async function estaAutenticado(): Promise<boolean> {
  try {
    const senha = getServerEnv().PESQUISA_RESULTS_PASSWORD;
    if (!senha) return false;
    const cookieValue = (await cookies()).get(RESULTS_COOKIE_NAME)?.value;
    return verifyResultsCookie(cookieValue, senha);
  } catch {
    return false;
  }
}

export default async function ResultadosPage() {
  if (!(await estaAutenticado())) redirect("/pesquisa/resultados/login");

  const [responses, leads] = await Promise.all([exportResponsesRows(), exportLeadsRows()]);
  const stats = aggregateSurvey(responses, leads);
  const semDados = stats.cartoes.iniciadas === 0;

  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-10 px-5 pt-3 pb-12">
      <Cabecalho />
      <div className="flex flex-col gap-4">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
          Resultados da pesquisa
        </h1>
        <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
          <a
            href="/api/pesquisa/export?tipo=respostas"
            download
            className="border-tinta text-tinta rounded-botao focus-visible:outline-verde-fundo flex h-12 items-center justify-center border-[1.5px] px-5 text-sm font-extrabold transition-colors duration-150 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Baixar respostas (CSV)
          </a>
          <a
            href="/api/pesquisa/export?tipo=leads"
            download
            className="border-tinta text-tinta rounded-botao focus-visible:outline-verde-fundo flex h-12 items-center justify-center border-[1.5px] px-5 text-sm font-extrabold transition-colors duration-150 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Baixar leads (CSV)
          </a>
        </div>
      </div>

      {semDados ? (
        <p className="text-texto-2 text-base">Nenhuma resposta ainda.</p>
      ) : (
        <>
          <Cartoes cartoes={stats.cartoes} />
          <Funil funil={stats.funil} />
          <PorPergunta porPergunta={stats.porPergunta} />
          <PorOrigem porOrigem={stats.porOrigem} />
          <Frases frases={stats.frases} />
        </>
      )}
    </main>
  );
}
