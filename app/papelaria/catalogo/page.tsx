import Link from "next/link";

import { CatalogTable } from "@/components/stationeries/CatalogTable";
import { ImportForm } from "@/components/stationeries/ImportForm";
import { ItemForm } from "@/components/stationeries/ItemForm";
import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { STATUS_LABEL } from "@/features/stationeries/messages";
import { listCatalogItems, type CatalogRow } from "@/features/stationeries/repository";
import { getOwnerContext } from "@/features/stationeries/session";
import { CATALOG_WRITABLE_STATUSES } from "@/features/stationeries/state";
import { createAdminClient } from "@/lib/supabase/admin";

import { importCatalogAction, saveItemAction } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; editar?: string }> }) {
  const { ok, erro, editar } = await searchParams;
  const ctx = await getOwnerContext("/papelaria/catalogo");
  if (!ctx) {
    return (
      <>
        <PageHeader crumb="Papelaria / Catálogo" title="Catálogo" />
        <Notice kind="info">Nenhuma papelaria vinculada a esta conta.</Notice>
      </>
    );
  }
  const { stationery, actor } = ctx;
  const writable = CATALOG_WRITABLE_STATUSES.includes(stationery.status);

  let rows: CatalogRow[] = [];
  let failed = false;
  try {
    rows = await listCatalogItems(createAdminClient(), actor, stationery.id);
  } catch (error) {
    console.error("listar catálogo", error);
    failed = true;
  }
  const editing = rows.find((r) => r.id === editar);

  return (
    <>
      <PageHeader crumb="Papelaria / Catálogo" title="Catálogo" />
      {ok ? <Notice kind="ok">Item salvo.</Notice> : null}
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      {!writable ? (
        <Notice kind="info">
          Catálogo bloqueado: sua papelaria está em “{STATUS_LABEL[stationery.status]}”.{" "}
          {stationery.status === "suspended" ? "A equipe suspendeu o acesso." : "Ele é liberado depois da aprovação."}
        </Notice>
      ) : (
        <div className="mb-6 flex flex-col gap-4">
          <ItemForm action={saveItemAction} editing={editing} />
          <ImportForm action={importCatalogAction} />
        </div>
      )}
      {failed ? (
        <Notice kind="error">
          Não foi possível carregar o catálogo.{" "}
          <Link href="/papelaria/catalogo" className="underline">
            Tentar de novo
          </Link>
        </Notice>
      ) : (
        <CatalogTable rows={rows} editHref={(id) => `/papelaria/catalogo?editar=${id}`} />
      )}
    </>
  );
}
