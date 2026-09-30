import Link from "next/link";

import { signOutAction } from "@/components/auth/sign-out-action";
import { CartsSection } from "@/components/cart/CartsSection";
import { SavedListsSection } from "@/components/saved-lists/SavedListsSection";
import { StudentsSection } from "@/components/students/StudentsSection";
import { Button, buttonClass } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { loadCartLabels } from "@/features/cart/labels";
import { listCartsForOwner } from "@/features/cart/repository";
import { listMySavedLists } from "@/features/saved-lists/queries";
import { sendListHref } from "@/features/submissions/href";
import { accountNotice } from "@/features/students/notices";
import { listMyStudents } from "@/features/students/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minha conta · ListaCerta", robots: { index: false, follow: false } };

const SHORTCUT = "bg-branco-tonal focus-visible:outline-verde-fundo flex min-h-11 items-center justify-between gap-3 rounded-[20px] p-4 focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * App16-HubPais + App12-MinhaConta (S15): estudantes (só apelido e série), listas salvas e carrinhos, todos com
 * status vindo do banco. `/conta` serve os quatro papéis logados (S02); a área da família aparece para qualquer
 * um deles (um `school_member` também pode ter filhos), sem exigir papel `parent`.
 * S29 (UX-048): uma ação principal por vez (adicionar aluno enquanto não há aluno; depois, buscar a lista) e atalhos
 * para enviar a lista, minhas compras e minhas cotações. "Meus envios" (UX-060, S29 Task 14).
 */
export default async function AccountHubPage({ searchParams }: PageProps<"/conta">) {
  const { user } = await requireAccess("/conta");
  const actor = await getSessionActor();
  const notice = accountNotice((await searchParams).aviso);

  const [students, savedLists, carts] = actor
    ? await Promise.all([
        listMyStudents(actor).catch(() => []),
        listMySavedLists(actor).catch(() => []),
        listCartsForOwner(await createClient(), actor.userId).catch(() => []),
      ])
    : [[], [], []];
  const labels = await loadCartLabels(carts.map((c) => c.listId).filter((id): id is string => id !== null));

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-8 px-6 pt-6 pb-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">Minha conta</h1>
        <p className="text-texto-2 text-[14px] font-semibold break-all">{user.email ?? "indisponível"}</p>
      </header>

      {notice ? <InlineStatus tone="success">{notice}</InlineStatus> : null}

      <StudentsSection students={students} savedLists={savedLists} />
      <SavedListsSection savedLists={savedLists} />
      <CartsSection carts={carts} labels={labels} />

      <Link href="/escolas" className={buttonClass(students.length > 0 ? "primary" : "outline", "lg", "w-full")}>
        Buscar lista da escola
      </Link>

      <nav aria-label="Atalhos" className="flex flex-col gap-3">
        <Link href={sendListHref()} className={SHORTCUT}>
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px] font-extrabold">Enviar a lista da escola</span>
            <span className="text-texto-2 text-[13px] font-semibold">Não achou a lista? Mande a foto ou o PDF.</span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/conta/envios" className={SHORTCUT}>
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px] font-extrabold">Meus envios</span>
            <span className="text-texto-2 text-[13px] font-semibold">Veja o andamento das listas que você enviou</span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/conta/compras" className={SHORTCUT}>
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px] font-extrabold">Minhas compras</span>
            <span className="text-texto-2 text-[13px] font-semibold">Informe se comprou na papelaria e avalie o atendimento</span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/cotacao" className={SHORTCUT}>
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px] font-extrabold">Minhas cotações</span>
            <span className="text-texto-2 text-[13px] font-semibold">Veja o status de cada pedido de cotação</span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      </nav>

      <section aria-label="Conta" className="flex flex-col gap-2 border-t border-black/10 pt-6">
        <Link href="/conta/privacidade" className={buttonClass("text", "md", "self-start")}>
          Privacidade e dados
        </Link>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" className="w-full">
            Sair
          </Button>
        </form>
      </section>
    </main>
  );
}
