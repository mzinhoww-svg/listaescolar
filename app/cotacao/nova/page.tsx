import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { Screen } from "@/components/auth/Screen";
import { BackHeader, EmptyState } from "@/components/cart/CartStates";
import { StationeryCard } from "@/components/leads/StationeryCard";
import { requireAccess } from "@/features/auth/guard";
import { filterByMode, novaHref } from "@/features/leads/filters";
import { errorMessageForCode } from "@/features/leads/messages";
import { buildLeadMessage, leadListUrl } from "@/features/leads/message";
import { loadQuoteView } from "@/features/leads/queries";
import { getSessionActor } from "@/features/stationeries/actor";
import { getSiteOrigin } from "@/lib/site-url";

import { createLeadAction } from "@/features/leads/actions";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = { title: "Pedir cotação · ListaCerta" };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const chip = (on: boolean) => `${on ? "bg-verde-certo text-tinta" : "bg-campo text-tinta"} rounded-botao px-4 py-2 text-[14px] font-extrabold`;

function previewFor(schoolName: string, gradeLabel: string, schoolYear: number): string | null {
  try {
    const origin = getSiteOrigin();
    return buildLeadMessage({ code: "LC-XXXX", schoolName, gradeLabel, schoolYear, listUrl: leadListUrl(origin, "LC-XXXX") }, { siteOrigin: origin });
  } catch {
    return null;
  }
}

export default async function NovaCotacaoPage({ searchParams }: PageProps<"/cotacao/nova">) {
  const sp = await searchParams;
  const cart = z.uuid().safeParse(one(sp.carrinho));
  const next = cart.success ? `/cotacao/nova?carrinho=${cart.data}` : "/cotacao/nova";
  await requireAccess(next);
  if (!cart.success) {
    return <EmptyState title="Nenhum carrinho escolhido" text="Abra o carrinho e use “Pedir cotação a papelarias” na opção da papelaria local." />;
  }
  const actor = await getSessionActor();
  if (!actor) return <EmptyState title="Entre para continuar" text="É preciso estar logado para pedir cotação." />;

  const bairro = (one(sp.bairro) ?? "").trim().slice(0, 120);
  const entrega = one(sp.entrega) === "1";
  const retirada = one(sp.retirada) === "1";
  const erro = errorMessageForCode(one(sp.erro));
  const result = await loadQuoteView(actor, cart.data, bairro || undefined);
  if (result.status === "not_found") return <EmptyState title="Carrinho não encontrado" text="Não achamos este carrinho, ou ele não é seu." />;
  if (result.status === "unavailable") {
    return <EmptyState title="Cotação indisponível" text="Ainda não há lista com escola e série ligada a este carrinho neste ambiente. Não inventamos dados." />;
  }
  const { view } = result;
  const picked = view.options.find((o) => o.id === one(sp.papelaria));
  const options = filterByMode(view.options, { entrega, retirada });
  const base = { carrinho: cart.data, bairro, entrega, retirada };

  return (
    <Screen>
      <BackHeader href={`/carrinho/${cart.data}`} title="Papelarias perto de você" />
      {erro ? <p role="alert" className="bg-[#fde2e0] text-[#8a1c14] rounded-campo px-4 py-3 text-[14px] font-bold">{erro}</p> : null}
      {picked ? (
        <>
          <ConsentForm
            action={createLeadAction}
            cartId={cart.data}
            stationeryId={picked.id}
            stationeryName={picked.name}
            neighborhood={bairro}
            idempotencyKey={randomUUID()}
            preview={previewFor(view.context.schoolName, view.context.gradeLabel, view.context.schoolYear)}
          />
          <Link href={novaHref(base)} className="text-verde-fundo text-center text-[14px] font-extrabold underline">Voltar às papelarias</Link>
        </>
      ) : (
        <>
          <nav aria-label="Filtros" className="flex flex-wrap gap-2">
            <Link href={novaHref({ ...base, entrega: !entrega })} className={chip(entrega)} aria-pressed={entrega}>Entrega</Link>
            <Link href={novaHref({ ...base, retirada: !retirada })} className={chip(retirada)} aria-pressed={retirada}>Retirada</Link>
          </nav>
          <form method="get" action="/cotacao/nova" className="flex gap-2">
            <input type="hidden" name="carrinho" value={cart.data} />
            {entrega ? <input type="hidden" name="entrega" value="1" /> : null}
            {retirada ? <input type="hidden" name="retirada" value="1" /> : null}
            <input name="bairro" defaultValue={bairro} maxLength={120} placeholder="Seu bairro (opcional)" aria-label="Seu bairro" className="bg-campo rounded-campo h-12 min-w-0 flex-1 px-4 text-[14px] font-semibold" />
            <button type="submit" className="bg-tinta text-papel rounded-botao h-12 px-5 text-[14px] font-extrabold">Filtrar</button>
          </form>
          <p className="text-texto-2 text-[13px] font-semibold">
            {options.length} {options.length === 1 ? "papelaria atende" : "papelarias atendem"} {bairro ? `o bairro ${bairro}` : "a região"} para a lista de {view.context.gradeLabel} ({view.context.schoolYear}).
          </p>
          {options.length === 0 ? (
            <p className="text-texto-2 text-[15px] font-medium" data-testid="no-stationeries">Nenhuma papelaria cadastrada atende esta região com os filtros escolhidos.</p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Papelarias">
              {options.map((o) => (
                <StationeryCard key={o.id} option={o} selectHref={novaHref({ ...base, papelaria: o.id })} />
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}
