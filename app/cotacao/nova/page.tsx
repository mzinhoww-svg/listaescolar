import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { Screen } from "@/components/auth/Screen";
import { BackHeader, EmptyState } from "@/components/cart/CartStates";
import { cartOptionHref } from "@/components/cart/format";
import { chipClass } from "@/components/leads/chip";
import { NoStationeries } from "@/components/leads/NoStationeries";
import { StationeryCard } from "@/components/leads/StationeryCard";
import { requireAccess } from "@/features/auth/guard";
import { CART_STRATEGIES } from "@/features/cart/types";
import { filterByMode, novaHref } from "@/features/leads/filters";
import { errorMessageForCode } from "@/features/leads/messages";
import { buildLeadMessage, leadListUrl } from "@/features/leads/message";
import { getListOriginByVersion, listOriginHref } from "@/features/lists/queries";
import { loadQuoteView } from "@/features/leads/queries";
import { getSessionActor } from "@/features/stationeries/actor";
import { getSiteOrigin } from "@/lib/site-url";

import { createLeadAction } from "@/features/leads/actions";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = { title: "Pedir cotação · ListaCerta" };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const NO_CART_ACTIONS = [{ href: "/escolas", label: "Buscar escola" }, { href: "/conta/carrinhos", label: "Meus carrinhos" }] as const;

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
  // Só uma estratégia conhecida volta ao carrinho: o valor vem da URL e nunca é repetido sem checagem.
  const opcao = CART_STRATEGIES.find((x) => x === one(sp.opcao));
  const next = cart.success ? novaHref({ carrinho: cart.data, opcao }) : "/cotacao/nova";
  await requireAccess(next);
  if (!cart.success) {
    return <EmptyState title="Nenhum carrinho escolhido" text="Abra o carrinho e use “Pedir cotação a papelarias” na opção da papelaria local." actions={NO_CART_ACTIONS} backHref="/conta" />;
  }
  const actor = await getSessionActor();
  if (!actor) return <EmptyState title="Entre para continuar" text="É preciso estar logado para pedir cotação." />;

  const bairro = (one(sp.bairro) ?? "").trim().slice(0, 120);
  const entrega = one(sp.entrega) === "1";
  const retirada = one(sp.retirada) === "1";
  const erro = errorMessageForCode(one(sp.erro));
  const result = await loadQuoteView(actor, cart.data, bairro || undefined);
  if (result.status === "not_found") return <EmptyState title="Carrinho não encontrado" text="Não achamos este carrinho, ou ele não é seu." actions={NO_CART_ACTIONS} backHref="/conta" />;
  if (result.status === "unavailable") {
    return <EmptyState title="Cotação indisponível" text="Ainda não há lista com escola e série ligada a este carrinho neste ambiente. Não inventamos dados." actions={[{ href: `/carrinho/${cart.data}`, label: "Voltar ao carrinho" }, ...NO_CART_ACTIONS]} backHref="/conta" />;
  }
  const { view } = result;
  const picked = view.options.find((o) => o.id === one(sp.papelaria));
  const options = filterByMode(view.options, { entrega, retirada });
  const base = { carrinho: cart.data, opcao, bairro, entrega, retirada };
  const hasFilter = Boolean(bairro) || entrega || retirada;
  let shareHref: string | null = null;
  if (options.length === 0 && view.cart.listId) {
    try {
      shareHref = listOriginHref(await getListOriginByVersion(view.cart.listId));
    } catch {
      shareHref = null;
    }
  }

  return (
    <Screen>
      <BackHeader href={cartOptionHref(cart.data, opcao ?? null)} title="Papelarias perto de você" heading />
      {erro ? <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">{erro}</p> : null}
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
          <Link href={novaHref(base)} className="text-verde-fundo flex min-h-11 items-center justify-center text-center text-[14px] font-extrabold underline">Voltar às papelarias</Link>
        </>
      ) : (
        <>
          <nav aria-label="Filtros" className="flex flex-wrap gap-2">
            <Link href={novaHref({ ...base, entrega: !entrega })} className={chipClass(entrega)} aria-current={entrega ? "true" : undefined}>Entrega</Link>
            <Link href={novaHref({ ...base, retirada: !retirada })} className={chipClass(retirada)} aria-current={retirada ? "true" : undefined}>Retirada</Link>
          </nav>
          <form method="get" action="/cotacao/nova" className="flex items-end gap-2">
            <input type="hidden" name="carrinho" value={cart.data} />
            {opcao ? <input type="hidden" name="opcao" value={opcao} /> : null}
            {entrega ? <input type="hidden" name="entrega" value="1" /> : null}
            {retirada ? <input type="hidden" name="retirada" value="1" /> : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="bairro" className="text-texto-3 text-xs font-semibold">Seu bairro (opcional)</label>
              <input id="bairro" name="bairro" defaultValue={bairro} maxLength={120} className="bg-campo focus-visible:outline-verde-fundo rounded-campo h-12 min-w-0 px-4 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2" />
            </div>
            <button type="submit" className="bg-tinta text-papel focus-visible:outline-verde-fundo rounded-botao h-12 px-5 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2">Filtrar</button>
          </form>
          <p className="text-texto-2 text-[13px] font-semibold">
            {options.length} {options.length === 1 ? "papelaria atende" : "papelarias atendem"} {bairro ? `o bairro ${bairro}` : "a região"} para a lista de {view.context.gradeLabel} ({view.context.schoolYear}).
            {/* D-029 (S18): a lista de candidatas tem um teto (nunca corte silencioso). */}
            {view.truncated ? " Mostrando as primeiras; refine pelo bairro para ver outras." : null}
          </p>
          {options.length === 0 ? (
            <NoStationeries
              hasFilter={hasFilter}
              cartHref={cartOptionHref(cart.data, opcao ?? null)}
              clearFiltersHref={novaHref({ carrinho: cart.data, opcao })}
              shareHref={shareHref}
            />
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
