import Link from "next/link";

import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { StatusPanel } from "@/components/stationeries/StatusPanel";
import { errorMessageForCode, STATUS_LABEL } from "@/features/stationeries/messages";
import { listStatusEvents } from "@/features/stationeries/queries";
import { getOwnerContext } from "@/features/stationeries/session";

import { ownerStatusAction } from "./actions";

const btn = "bg-tinta text-papel h-12 rounded-botao px-6 text-[15px] font-extrabold";
const btnOutline = "border-tinta h-12 rounded-botao border-[1.5px] px-6 text-[15px] font-extrabold";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const ctx = await getOwnerContext("/papelaria");
  if (!ctx) {
    return (
      <>
        <PageHeader crumb="Papelaria" title="Visão geral" />
        <Notice kind="info">Nenhuma papelaria vinculada a esta conta.</Notice>
      </>
    );
  }
  const { stationery } = ctx;
  const events = await listStatusEvents(stationery.id);
  const move = (to: "active" | "paused", label: string, outline = false) => (
    <form action={ownerStatusAction}>
      <input type="hidden" name="to" value={to} />
      <button type="submit" className={outline ? btnOutline : btn}>
        {label}
      </button>
    </form>
  );
  return (
    <>
      <PageHeader crumb="Papelaria" title={stationery.tradeName}>
        <span className="bg-campo rounded-botao px-4 py-2 text-[13px] font-extrabold" data-testid="status-label">
          {STATUS_LABEL[stationery.status]}
        </span>
      </PageHeader>
      {ok ? <Notice kind="ok">Status atualizado.</Notice> : null}
      {erro ? <Notice kind="error">{errorMessageForCode(erro)}</Notice> : null}
      <div className="mb-6 flex flex-wrap gap-3">
        {stationery.status === "approved" ? move("active", "Publicar papelaria") : null}
        {stationery.status === "active" ? move("paused", "Pausar", true) : null}
        {stationery.status === "paused" ? move("active", "Reativar") : null}
        <Link href="/papelaria/catalogo" className={`${btnOutline} flex items-center`}>
          Catálogo
        </Link>
        {stationery.status === "active" ? (
          <Link href={`/papelarias/${stationery.slug}`} className={`${btnOutline} flex items-center`}>
            Ver perfil público
          </Link>
        ) : null}
      </div>
      {stationery.status === "approved" ? (
        <Notice kind="info">Aprovada: publique para aparecer aos pais. Preço e estoque só aparecem se você informar no catálogo.</Notice>
      ) : null}
      <StatusPanel stationery={stationery} events={events} />
    </>
  );
}
