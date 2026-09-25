import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Screen } from "@/components/auth/Screen";
import { StoreMark } from "@/components/cart/badges";
import { Wordmark } from "@/components/brand/Wordmark";
import { buildRetailerRedirect } from "@/features/cart/affiliate";
import { requireAccess } from "@/features/auth/guard";
import { getActiveRetailerBySlug, getCart } from "@/features/cart/repository";
import { RedirectTargetError } from "@/features/cart/redirect-target";
import { redirectParamsSchema } from "@/features/cart/schemas";
import { initialsOf, pickItem, readServiceEnv } from "@/features/cart/service";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Indo para a loja · ListaCerta",
  robots: { index: false },
};

export default async function IrParaPage({
  params,
  searchParams,
}: PageProps<"/ir-para/[cartId]/[retailer]">) {
  const raw = await params;
  const sp = await searchParams;
  const itemParam = Array.isArray(sp.item) ? sp.item[0] : sp.item;
  const parsed = redirectParamsSchema.safeParse(raw);
  if (!parsed.success) notFound();
  const { cartId, retailer: slug } = parsed.data;
  const item = z.uuid().safeParse(itemParam);
  const here = `/ir-para/${cartId}/${slug}${item.success ? `?item=${item.data}` : ""}`;
  const { user } = await requireAccess(here);
  const client = await createClient();
  const [cart, retailer] = await Promise.all([
    getCart(client, cartId),
    getActiveRetailerBySlug(client, slug),
  ]);
  if (!cart || cart.ownerId !== user.id || !retailer) notFound();
  const chosen = pickItem(cart, item.success ? item.data : null);
  if (!chosen) notFound();
  let affiliateApplied = false;
  try {
    affiliateApplied = buildRetailerRedirect(
      retailer,
      chosen.name,
      readServiceEnv(),
    ).affiliateApplied;
  } catch (error) {
    if (error instanceof RedirectTargetError) notFound();
    throw error;
  }
  const clickFailed = (Array.isArray(sp.erro) ? sp.erro[0] : sp.erro) === "clique";
  const goHref = `/ir-para/${cartId}/${slug}/go?item=${chosen.id}`;
  return (
    <Screen top={72}>
      <div className="flex items-center justify-between">
        <Wordmark />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        <StoreMark initials={initialsOf(retailer.name)} />
        <span aria-hidden className="text-texto-3 text-xl font-extrabold">
          ›
        </span>
      </div>
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">
        Levando você para {retailer.name}
      </h1>
      <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">
        Vamos abrir a busca por “{chosen.name}” em {retailer.name}. Você decide quando abrir.
      </p>
      {affiliateApplied ? (
        <p className="bg-campo text-texto-2 rounded-campo px-3.5 py-3.5 text-[13px] leading-[1.4] font-semibold">
          Link de afiliado: a ListaCerta pode receber comissão. O preço é o mesmo para você.
        </p>
      ) : null}
      {clickFailed ? (
        <p
          role="alert"
          className="bg-campo text-texto rounded-campo px-3.5 py-3.5 text-[13px] leading-[1.4] font-bold"
        >
          Não conseguimos registrar a abertura da loja. Nada foi aberto: toque em “Abrir loja” para
          tentar de novo.
        </p>
      ) : null}
      <p className="text-texto-3 text-xs font-semibold">Preço e estoque podem mudar na loja.</p>
      <div className="flex-1" />
      {/* Âncora simples: o clique registra em affiliate_clicks; Link pré-carregaria e registraria sem clique. */}
      <a
        href={goHref}
        className="bg-tinta text-papel rounded-botao flex h-14 w-full items-center justify-center text-base font-extrabold"
      >
        Abrir loja
      </a>
      <Link
        href={`/carrinho/${cartId}/checkout`}
        className="text-center text-[15px] font-extrabold"
      >
        Voltar ao carrinho
      </Link>
    </Screen>
  );
}
