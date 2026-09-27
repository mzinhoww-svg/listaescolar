import Link from "next/link";

import { signOutAction } from "@/components/auth/sign-out-action";
import { CartsSection } from "@/components/cart/CartsSection";
import { SavedListsSection } from "@/components/saved-lists/SavedListsSection";
import { StudentsSection } from "@/components/students/StudentsSection";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { listCartsForOwner } from "@/features/cart/repository";
import { listMySavedLists } from "@/features/saved-lists/queries";
import { listMyStudents } from "@/features/students/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minha conta · ListaCerta", robots: { index: false, follow: false } };

/**
 * App16-HubPais + App12-MinhaConta (S15): estudantes (só apelido e série), listas salvas e carrinhos, todos com
 * status vindo do banco. `/conta` serve os quatro papéis logados (S02); a área da família aparece para qualquer
 * um deles (um `school_member` também pode ter filhos), sem exigir papel `parent`.
 */
export default async function AccountHubPage() {
  const { user, role } = await requireAccess("/conta");
  const actor = await getSessionActor();

  const [students, savedLists, carts] = actor
    ? await Promise.all([
        listMyStudents(actor).catch(() => []),
        listMySavedLists(actor).catch(() => []),
        listCartsForOwner(await createClient(), actor.userId).catch(() => []),
      ])
    : [[], [], []];

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-8 px-6 pt-6 pb-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Minha conta</h1>
        <p className="text-texto-2 text-[13px] font-semibold">{user.email ?? "indisponível"}</p>
      </header>

      <StudentsSection students={students} />
      <SavedListsSection savedLists={savedLists} />
      <CartsSection carts={carts} />

      <Link
        href="/escolas"
        className="bg-tinta text-papel focus-visible:outline-verde-certo flex h-14 w-full items-center justify-center gap-2 rounded-botao text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Buscar lista da escola
      </Link>

      <section aria-label="Cotações" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">Cotações</h2>
        <Link
          href="/cotacao"
          className="bg-branco-tonal focus-visible:outline-verde-fundo flex items-center justify-between rounded-[20px] p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className="text-[14px] font-extrabold">Ver suas cotações e o status de cada uma</span>
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section aria-label="Perfil" className="flex flex-col gap-2 border-t border-black/10 pt-6">
        <dl className="text-texto-2 flex flex-col gap-1 text-[13px] font-semibold">
          <div className="flex gap-2">
            <dt className="font-extrabold">Papel</dt>
            <dd>{role}</dd>
          </div>
        </dl>
        <Link
          href="/conta/privacidade"
          className="border-tinta text-tinta focus-visible:outline-verde-fundo flex h-[52px] w-full items-center justify-center rounded-botao border-[1.5px] text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Privacidade e dados
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="border-tinta text-tinta focus-visible:outline-verde-fundo flex h-[52px] w-full items-center justify-center rounded-botao border-[1.5px] text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
