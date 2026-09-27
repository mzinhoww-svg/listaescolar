import type { Metadata } from "next";
import Link from "next/link";

import { ComingSoonBadge } from "@/components/b2b/ComingSoonBadge";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getCurrentUser } from "@/features/auth/queries";
import { getSessionActor } from "@/features/auth/actor";
import { isB2bFeatureEnabled } from "@/features/b2b/features";
import { b2bServiceMessage } from "@/features/b2b/messages";
import { getMyPartnerHeader } from "@/features/b2b/queries";
import { buildPageMetadata } from "@/lib/seo";

import { ApplyForm } from "./ApplyForm";

// B2B00 (`/parceiros`): página pública e indexável. Cabeçalho/rodapé reaproveitados da S27 (`components/site/*`).
// Nenhuma promessa sem fonte: recursos de S25 (widget/webhooks) e S26 (campanhas/checagem Procon/relatórios de
// demanda) aparecem com `ComingSoonBadge` só enquanto `isB2bFeatureEnabled` da flag correspondente for `false`
// (revisão de segurança da Task 3, Important #1 — o selo tem que sumir sozinho quando S25/S26 ligarem a flag,
// nunca fixo no código); "Respondemos em até [N] dias úteis" e o e-mail `parceiros@…` do design saem por falta de
// fonte (Ruling S24 · Task 2).

export const metadata: Metadata = buildPageMetadata({
  title: "Para parceiros · ListaCerta",
  description: "API de listas oficiais de material escolar para varejistas, marcas e EdTech. Leitura de escolas, listas e itens; casamento de SKUs.",
  path: "/parceiros",
});

const CARD = "flex flex-col gap-3.5 rounded-[24px] p-7";
const FEATURE = "flex items-start gap-2.5 text-[14px] font-semibold";

function Feature({ children, soon = false }: { children: React.ReactNode; soon?: boolean }) {
  return (
    <li className={FEATURE}>
      <span aria-hidden className="bg-verde-certo mt-0.5 inline-block size-4 shrink-0 rounded-full" />
      <span className="flex flex-wrap items-center gap-2">
        {children}
        {soon ? <ComingSoonBadge /> : null}
      </span>
    </li>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { erro } = await searchParams;
  const user = await getCurrentUser();
  // Quem já é membro de um parceiro não deve ver o formulário de cadastro de novo (enviar de novo só devolveria
  // `already_member`) — revisão de segurança da Task 3, Important #3: mostra "Ir para o portal" em vez disso.
  const actor = user ? await getSessionActor() : null;
  const myPartner = actor ? await getMyPartnerHeader(actor) : null;
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 px-6 py-14">
        <section className="flex flex-col gap-5">
          <p className="text-verde-fundo text-[12px] font-extrabold tracking-[0.16em] uppercase">Para parceiros</p>
          <h1 className="max-w-[900px] text-[44px] leading-[1.05] font-extrabold tracking-[-0.03em] md:text-[56px]">
            As listas escolares do Brasil, prontas para vender.
          </h1>
          <p className="text-texto-2 max-w-[760px] text-[18px] font-medium">
            Listas oficiais por escola e série, revisadas e estruturadas item a item. Por API, com casamento de itens
            e seus SKUs.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="#cadastro" className="bg-tinta text-papel rounded-botao flex h-14 items-center px-6 text-[16px] font-extrabold">
              Falar com o time
            </Link>
            <Link href="/parceiros/docs" className="border-tinta rounded-botao flex h-14 items-center border-[1.5px] px-6 text-[16px] font-extrabold">
              Ver documentação
            </Link>
            {/* Caminho de descoberta do portal (revisão de segurança da Task 3, Important #3): `/b2b` já resolve
               sozinho quem não está logado (`/entrar?next=/b2b`) e quem não é membro (`/parceiros?cadastro=1`). */}
            <Link href="/b2b" className="text-tinta rounded-botao flex h-14 items-center px-2 text-[16px] font-extrabold underline underline-offset-4">
              Entrar no portal
            </Link>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <div className={`${CARD} bg-white`}>
            <h2 className="text-[22px] font-extrabold">Varejistas</h2>
            <p className="text-texto-2 text-[15px] font-medium">Leve o pai da lista da escola direto para o seu carrinho.</p>
            <ul className="flex flex-col gap-2">
              <Feature>API com escolas, listas e itens</Feature>
              <Feature soon={!isB2bFeatureEnabled("widget")}>Widget pronto para o seu site</Feature>
              <Feature>Casamento de itens com seus SKUs</Feature>
            </ul>
          </div>
          <div className={`${CARD} bg-tinta text-papel`}>
            <h2 className="text-[22px] font-extrabold">Marcas</h2>
            <p className="text-[15px] font-medium text-white/70">Apareça como sugestão na hora da compra, sem mexer na lista oficial.</p>
            <ul className="flex flex-col gap-2">
              <Feature soon={!isB2bFeatureEnabled("campaigns")}>Sugestão patrocinada separada da lista</Feature>
              <Feature soon={!isB2bFeatureEnabled("campaigns")}>Checagem automática Procon</Feature>
              <Feature soon={!isB2bFeatureEnabled("insights")}>Relatórios de demanda agregada</Feature>
            </ul>
          </div>
          <div className={`${CARD} bg-white`}>
            <h2 className="text-[22px] font-extrabold">EdTech e sistemas escolares</h2>
            <p className="text-texto-2 text-[15px] font-medium">Leia escolas e listas oficiais pelo sistema que a escola já usa.</p>
            <ul className="flex flex-col gap-2">
              <Feature>API de leitura de escolas e listas</Feature>
              <Feature>Sem custo para a escola</Feature>
              <Feature soon={!isB2bFeatureEnabled("webhooks")}>Webhooks de publicação</Feature>
            </ul>
          </div>
        </section>

        <section className="flex flex-col gap-6 rounded-[24px] bg-white p-8">
          <h2 className="text-[32px] font-extrabold tracking-[-0.03em]">Regras que protegem a família e a escola</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-papel rounded-[20px] p-6">
              <h3 className="text-[17px] font-extrabold">Sem dado pessoal</h3>
              <p className="text-texto-2 mt-1 text-[14px] font-medium">
                Por API só saem listas públicas e agregados de uso da própria chave. Nada de família ou aluno.
              </p>
            </div>
            <div className="bg-papel rounded-[20px] p-6">
              <h3 className="flex items-center gap-2 text-[17px] font-extrabold">
                Lista oficial intocada {isB2bFeatureEnabled("campaigns") ? null : <ComingSoonBadge />}
              </h3>
              <p className="text-texto-2 mt-1 text-[14px] font-medium">
                Campanhas de marca (quando existirem) nunca trocam item exigido pela escola.
              </p>
            </div>
          </div>
        </section>

        <section id="cadastro" className="grid gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="text-[32px] font-extrabold tracking-[-0.03em]">Vamos conversar</h2>
            <p className="text-texto-2 text-[16px] font-medium">Conte o tipo de parceria e a região de interesse.</p>
          </div>
          {erro ? (
            <p role="alert" className="bg-[#fde2e0] text-[#8a1c14] rounded-campo px-4 py-3 text-[14px] font-bold md:col-span-2 md:order-3">
              {b2bServiceMessage(erro) ?? "Não foi possível concluir agora."}
            </p>
          ) : null}
          {myPartner ? (
            <div className="flex flex-col gap-3 rounded-[24px] bg-white p-7">
              <p className="text-texto-2 text-[15px] font-semibold">
                {myPartner.tradeName} já está cadastrada como parceira. Acompanhe o status e gerencie as chaves no portal.
              </p>
              <Link href="/b2b" className="bg-tinta text-papel rounded-botao flex h-12 w-fit items-center px-6 text-[15px] font-extrabold">
                Ir para o portal
              </Link>
            </div>
          ) : user?.email ? (
            <ApplyForm accountEmail={user.email} />
          ) : (
            <div className="flex flex-col gap-3 rounded-[24px] bg-white p-7">
              <p className="text-texto-2 text-[15px] font-semibold">Entre com sua conta para enviar o cadastro.</p>
              <Link
                href={`/entrar?next=${encodeURIComponent("/parceiros#cadastro")}`}
                className="bg-tinta text-papel rounded-botao flex h-12 w-fit items-center px-6 text-[15px] font-extrabold"
              >
                Entrar para enviar
              </Link>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
