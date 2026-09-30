import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ActivationChecklist } from "@/components/stationeries/ActivationChecklist";
import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { StatusPanel } from "@/components/stationeries/StatusPanel";
import { listStationeryLeads } from "@/features/leads/queries";
import { computeActivation } from "@/features/stationeries/activation";
import { errorMessageForCode, STATUS_LABEL } from "@/features/stationeries/messages";
import { countCatalogItems, listOwnAreas, listStatusEvents } from "@/features/stationeries/queries";
import { getOwnerContext } from "@/features/stationeries/session";

import { ownerStatusAction } from "../actions";

const btn = buttonClass("primary");
const btnOutline = buttonClass("outline");

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
  const showActivation = stationery.status === "approved" || stationery.status === "active" || stationery.status === "paused";
  const leadRows = showActivation ? (await listStationeryLeads(ctx.actor, stationery.id)).rows : [];
  // UX-080: pedidos esperando a primeira resposta ganham link direto para a aba dos novos.
  const waiting = leadRows.filter((r) => r.status === "received" || r.status === "viewed").length;
  const activation = showActivation
    ? computeActivation({
        hasProfile: stationery.status === "active" || stationery.status === "paused",
        areasCount: (await listOwnAreas(stationery.id)).length,
        catalogCount: await countCatalogItems(stationery.id),
        leadsReceived: leadRows.length,
      })
    : null;
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
        {stationery.status === "active" ? (
          <ConfirmDialog
            triggerLabel="Pausar papelaria"
            triggerStyle="button"
            triggerVariant="outline"
            confirmVariant="primary"
            title="Pausar a papelaria?"
            body={<p>Sua papelaria sai da busca e não recebe novos pedidos de cotação até você reativar. Os pedidos que já chegaram continuam no painel.</p>}
            confirmLabel="Pausar papelaria"
            action={ownerStatusAction}
            hidden={{ to: "paused" }}
          />
        ) : null}
        {stationery.status === "paused" ? move("active", "Reativar") : null}
        <Link href="/papelaria/catalogo" className={btnOutline}>
          Catálogo
        </Link>
        {stationery.status === "active" ? (
          <Link href={`/papelarias/${stationery.slug}`} className={btnOutline}>
            Ver perfil público
          </Link>
        ) : null}
      </div>
      {waiting > 0 ? (
        <Notice kind="info">
          {waiting === 1 ? "1 pedido está esperando sua resposta." : `${waiting} pedidos estão esperando sua resposta.`}{" "}
          <Link href="/papelaria/leads?aba=new" className="underline">
            Ver pedidos
          </Link>
        </Notice>
      ) : null}
      {stationery.status === "approved" ? (
        <Notice kind="info">Aprovada: publique para aparecer às famílias. Preço e estoque só aparecem se você informar no catálogo.</Notice>
      ) : null}
      {activation ? <ActivationChecklist activation={activation} /> : null}
      <StatusPanel stationery={stationery} events={events} />
    </>
  );
}
