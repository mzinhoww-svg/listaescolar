import { z } from "zod";

import { getCurrentUser } from "@/features/auth/queries";
import { buildRetailerRedirect } from "@/features/cart/affiliate";
import { RedirectTargetError } from "@/features/cart/redirect-target";
import { getActiveRetailerBySlug, getCart, recordClick } from "@/features/cart/repository";
import { redirectParamsSchema } from "@/features/cart/schemas";
import { pickItem, readServiceEnv } from "@/features/cart/service";
import { createClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" };

function notFound(): Response {
  return new Response("Não encontrado", { status: 404, headers: NO_STORE });
}

/**
 * Registra o clique e responde 307 para a URL montada a partir do template do varejista cadastrado.
 * Nada da requisição escolhe o destino; `item` só seleciona um item do próprio carrinho.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ cartId: string; retailer: string }> },
): Promise<Response> {
  const parsed = redirectParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) return notFound();
  const { cartId, retailer: slug } = parsed.data;

  const url = new URL(request.url);
  const itemParam = url.searchParams.get("item");
  const item = z.uuid().safeParse(itemParam);

  const user = await getCurrentUser();
  if (!user) {
    const back = `/ir-para/${cartId}/${slug}${item.success ? `?item=${item.data}` : ""}`;
    return new Response(null, {
      status: 307,
      headers: { ...NO_STORE, Location: `/entrar?next=${encodeURIComponent(back)}` },
    });
  }

  const cookieHeaders = new Headers();
  const client = await createClient(cookieHeaders);
  const [cart, retailer] = await Promise.all([
    getCart(client, cartId),
    getActiveRetailerBySlug(client, slug),
  ]);
  if (!cart || cart.ownerId !== user.id || !retailer) return notFound();
  const chosen = pickItem(cart, item.success ? item.data : null);
  if (!chosen) return notFound();

  let target: { url: string; affiliateApplied: boolean };
  try {
    target = buildRetailerRedirect(retailer, chosen.name, readServiceEnv());
  } catch (error) {
    if (error instanceof RedirectTargetError) return notFound();
    throw error;
  }

  try {
    await recordClick(client, {
      cartId,
      retailerId: retailer.id,
      profileId: user.id,
      affiliateApplied: target.affiliateApplied,
      targetUrl: target.url,
    });
  } catch (error) {
    // Sem registro não há atribuição: não vai à loja. Volta à tela de confirmação com aviso e nova tentativa.
    console.error(
      "go: falha ao registrar clique",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    return new Response(null, {
      status: 303,
      headers: {
        ...NO_STORE,
        Location: `/ir-para/${cartId}/${slug}?item=${chosen.id}&erro=clique`,
      },
    });
  }

  const headers = new Headers(cookieHeaders);
  headers.set("Location", target.url);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(null, { status: 307, headers });
}
