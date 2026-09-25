import { Field } from "@/components/stationeries/fields";
import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { STATUS_LABEL } from "@/features/stationeries/messages";
import { listOwnAreas } from "@/features/stationeries/queries";
import { getOwnerContext } from "@/features/stationeries/session";
import { AREAS_WRITABLE_STATUSES } from "@/features/stationeries/state";

import { saveAreasAction } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const ctx = await getOwnerContext("/papelaria/areas");
  if (!ctx) {
    return (
      <>
        <PageHeader crumb="Papelaria / Bairros" title="Bairros atendidos" />
        <Notice kind="info">Nenhuma papelaria vinculada a esta conta.</Notice>
      </>
    );
  }
  const writable = AREAS_WRITABLE_STATUSES.includes(ctx.stationery.status);
  const areas = await listOwnAreas(ctx.stationery.id);
  return (
    <>
      <PageHeader crumb="Papelaria / Bairros" title="Bairros atendidos" />
      {ok ? <Notice kind="ok">Bairros salvos.</Notice> : null}
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      {!writable ? (
        <Notice kind="info">Edição bloqueada no status “{STATUS_LABEL[ctx.stationery.status]}”.</Notice>
      ) : null}
      <form action={saveAreasAction} className="flex max-w-[560px] flex-col gap-4 rounded-card bg-white p-5">
        <Field id="areas" label="Um bairro por linha" hint="Só os bairros de atendimento do seu município.">
          <textarea
            id="areas"
            name="areas"
            rows={8}
            defaultValue={areas.join("\n")}
            disabled={!writable}
            className="bg-campo text-tinta w-full rounded-campo p-4 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo"
          />
        </Field>
        <button type="submit" disabled={!writable} className="bg-tinta text-papel h-12 w-fit rounded-botao px-6 text-[15px] font-extrabold disabled:opacity-50">
          Salvar bairros
        </button>
      </form>
    </>
  );
}
