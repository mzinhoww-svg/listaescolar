import Link from "next/link";

import { BackHeader } from "@/components/cart/CartStates";
import { DemoSeal } from "@/components/leads/StatusBadge";
import { InlineEmpty } from "@/components/ui/InlineEmpty";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { loadCartLabels } from "@/features/cart/labels";
import { listCartsForOwner } from "@/features/cart/repository";
import { cartDate, cartTitle } from "@/features/cart/title";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seus carrinhos · ListaCerta", robots: { index: false, follow: false } };

/** S15: todos os carrinhos da família, mais recentes primeiro (o hub de /conta mostra só os últimos). Nomeados por escola, série e data (UX-048). */
export default async function CartsPage() {
  await requireAccess("/conta/carrinhos");
  const actor = await getSessionActor();
  const carts = actor ? await listCartsForOwner(await createClient(), actor.userId, 100).catch(() => []) : [];
  const labels = await loadCartLabels(carts.map((c) => c.listId).filter((id): id is string => id !== null));

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-6 pb-9">
      <BackHeader href="/conta" title="Seus carrinhos" heading />
      {carts.length === 0 ? (
        <InlineEmpty text="Nenhum carrinho ainda. Abra uma lista publicada e toque em Montar carrinho." href="/escolas" label="Buscar a escola" />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Carrinhos">
          {carts.map((c) => (
            <li key={c.id}>
              <Link href={`/carrinho/${c.id}`} className="bg-branco-tonal flex min-h-11 flex-col gap-1.5 rounded-[24px] p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[16px] font-extrabold break-words">{cartTitle(c.listId ? (labels[c.listId] ?? null) : null, c.createdAt)}</span>
                  {c.isDemo ? <DemoSeal /> : null}
                </div>
                <span className="text-texto-2 text-[13px] font-semibold">
                  {c.itemCount} {c.itemCount === 1 ? "item" : "itens"} · {cartDate(c.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
