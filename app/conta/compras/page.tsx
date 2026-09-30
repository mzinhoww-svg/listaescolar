import type { Metadata } from "next";
import Link from "next/link";

import { Screen } from "@/components/auth/Screen";
import { BackHeader } from "@/components/cart/CartStates";
import { buttonClass } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { confirmPurchaseAction, createReviewAction } from "@/features/conversion/actions";
import { errorMessageForCode } from "@/features/conversion/messages";
import type { SurveyLeadView } from "@/features/conversion/ports";
import { getConversionService } from "@/features/conversion/wiring";

import { PurchaseCard } from "./PurchaseCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Suas compras · ListaCerta", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** App22 "Você comprou?" + App23 Avaliar: um cartão por pedido do responsável. */
export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string | string[]; ok?: string | string[] }> }) {
  await requireAccess("/conta/compras");
  const sp = await searchParams;
  const erro = errorMessageForCode(one(sp.erro));
  const actor = await getSessionActor();
  let items: SurveyLeadView[] = [];
  let failed = false;
  try {
    items = actor ? await getConversionService().listSurveyLeadsForParent(actor, 30) : [];
  } catch (error) {
    console.error("listar pedidos para pesquisa", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  return (
    <Screen>
      <BackHeader href="/conta" title="Minha conta" />
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Suas compras</h1>
      <p className="text-texto-2 text-[14px] leading-[1.4] font-semibold">
        Depois de falar com a papelaria, diga se comprou. Só a resposta “Comprei aqui” registra a venda.
      </p>
      {sp.ok ? <InlineStatus tone="success">Registrado, obrigado!</InlineStatus> : null}
      {erro ? <InlineStatus tone="error">{erro}</InlineStatus> : null}
      {failed ? (
        <InlineStatus tone="error">
          Não foi possível carregar. <Link href="/conta/compras" className="underline">Tentar de novo</Link>
        </InlineStatus>
      ) : items.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-texto-2 text-[14px] font-semibold">Nenhum pedido de cotação ainda.</p>
          <Link href="/cotacao" className={buttonClass("outline", "md", "w-full")}>
            Ver suas cotações
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.leadId}>
              <PurchaseCard item={item} confirmPurchase={confirmPurchaseAction} createReview={createReviewAction} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
