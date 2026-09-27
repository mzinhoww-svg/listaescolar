import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminShell } from "@/components/admin/AdminShell";
import { DemoBadge } from "@/components/admin/DemoBadge";
import { Notice } from "@/components/stationeries/PanelShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { getListSummaryForAdmin } from "@/features/admin/list-lookup";
import { LIST_STATE_LABEL } from "@/features/admin/labels";

import { archiveListAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lista · Admin · ListaCerta", robots: { index: false, follow: false } };

const ERROR_MESSAGE: Record<string, string> = {
  invalido: "Informe um motivo de 3 a 1000 caracteres.",
  forbidden: "Você não tem acesso a esta ação.",
  invalid_transition: "Só listas publicadas podem ser arquivadas.",
  not_found: "Lista não encontrada.",
};

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { user } = await requireAccess("/admin/listas");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const sp = await searchParams;
  const actor = await getSessionActor();
  let list: Awaited<ReturnType<typeof getListSummaryForAdmin>> = null;
  let failed = false;
  try {
    if (actor) list = await getListSummaryForAdmin(actor, id.data);
  } catch (error) {
    console.error("lista (admin)", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  return (
    <AdminShell active="/admin/listas" email={user.email} breadcrumb="Admin / Listas" title="Lista">
      {sp.ok ? <Notice kind="ok">Lista arquivada.</Notice> : null}
      {sp.erro ? <Notice kind="error">{ERROR_MESSAGE[sp.erro] ?? "Não foi possível concluir agora."}</Notice> : null}
      {failed || !list ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          {failed ? "Não foi possível carregar." : "Lista não encontrada."}
        </p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-campo text-texto-2 rounded-botao px-2.5 py-1 text-[11px] font-extrabold">{LIST_STATE_LABEL[list.status] ?? list.status}</span>
              {list.isDemo ? <DemoBadge /> : null}
            </div>
            <h2 className="text-[22px] font-extrabold">
              <Link href={`/escolas/${list.schoolInep}`} className="hover:underline">{list.schoolName}</Link>
            </h2>
            <dl className="grid gap-2 text-[14px] sm:grid-cols-2">
              <div><dt className="text-texto-3 font-semibold">Série</dt><dd className="font-bold">{list.gradeName}</dd></div>
              <div><dt className="text-texto-3 font-semibold">Ano letivo</dt><dd className="font-bold">{list.schoolYear}</dd></div>
            </dl>
          </section>
          <aside className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
            <h2 className="text-[16px] font-extrabold">Arquivar lista</h2>
            {list.status !== "published" ? (
              <p className="text-texto-3 text-[13px] font-semibold">Só listas publicadas podem ser arquivadas (estado atual: {LIST_STATE_LABEL[list.status] ?? list.status}).</p>
            ) : (
              <form action={archiveListAction} className="flex flex-col gap-3">
                <input type="hidden" name="listId" value={list.id} />
                <label className="flex flex-col gap-1.5 text-[13px] font-bold">
                  Motivo (obrigatório; sem dado pessoal)
                  <textarea name="reason" required minLength={3} maxLength={1000} rows={3} className="bg-campo rounded-campo w-full p-3 text-[14px] font-medium" />
                </label>
                <button type="submit" className="border-[1.5px] border-[#8a1c14] bg-transparent text-[#8a1c14] rounded-botao h-11 text-[14px] font-extrabold">
                  Arquivar lista
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
    </AdminShell>
  );
}
