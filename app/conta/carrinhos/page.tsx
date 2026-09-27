import Link from "next/link";

import { BackHeader } from "@/components/cart/CartStates";
import { STRATEGY_LABEL } from "@/components/cart/format";
import { DemoSeal } from "@/components/leads/StatusBadge";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listCartsForOwner } from "@/features/cart/repository";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seus carrinhos · ListaCerta", robots: { index: false, follow: false } };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" });

/** S15: todos os carrinhos da família, mais recentes primeiro (o hub de /conta mostra só os últimos). */
export default async function CartsPage() {
  await requireAccess("/conta");
  const actor = await getSessionActor();
  const carts = actor ? await listCartsForOwner(await createClient(), actor.userId, 100).catch(() => []) : [];

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-14 pb-9">
      <BackHeader href="/conta" title="Seus carrinhos" />
      {carts.length === 0 ? (
        <p className="text-texto-2 text-[15px] font-medium">Nenhum carrinho ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Carrinhos">
          {carts.map((c) => (
            <li key={c.id}>
              <Link href={`/carrinho/${c.id}`} className="bg-branco-tonal flex flex-col gap-1.5 rounded-[24px] p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[16px] font-extrabold">{STRATEGY_LABEL[c.strategy]}</span>
                  {c.isDemo ? <DemoSeal /> : null}
                </div>
                <span className="text-texto-2 text-[13px] font-semibold">
                  {c.itemCount} {c.itemCount === 1 ? "item" : "itens"} · {dateFmt.format(c.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
