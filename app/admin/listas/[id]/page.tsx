import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { buttonClass } from "@/components/ui/Button";
import { AdminShell } from "@/components/admin/AdminShell";
import { DemoBadge } from "@/components/admin/DemoBadge";
import { Notice } from "@/components/stationeries/PanelShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { getListSummaryForAdmin } from "@/features/admin/list-lookup";
import { LIST_STATE_LABEL } from "@/features/admin/labels";
import { LIST_CLOSE_REASON_LABEL, LIST_CLOSE_REASONS } from "@/features/lists/close-reasons";

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
              <span className="bg-campo text-texto-2 rounded-botao px-2.5 py-1 text-[12px] font-extrabold">{LIST_STATE_LABEL[list.status] ?? list.status}</span>
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
                  Motivo (obrigatório)
                  <select name="reasonCode" required defaultValue="" className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium">
                    <option value="" disabled>Escolha</option>
                    {LIST_CLOSE_REASONS.map((code) => (
                      <option key={code} value={code}>{LIST_CLOSE_REASON_LABEL[code]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-bold">
                  Observação (opcional, código curto, sem dado pessoal)
                  <input name="observation" maxLength={60} placeholder="denuncia_123" className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium" />
                </label>
                <button type="submit" className={buttonClass("danger")}>
                  Confirmar arquivamento
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
    </AdminShell>
  );
}
