import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/AdminShell";
import { auditFilterSchema, MAX_AUDIT_PAGE, searchAuditLog, type AuditPage } from "@/features/admin/audit";
import { AuditFilters, AuditPager, AuditTable } from "@/components/admin/AuditTable";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eventos (auditoria) · Admin · ListaCerta", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

type SP = { acao?: string | string[]; entidade?: string | string[]; entidadeId?: string | string[]; ator?: string | string[]; de?: string | string[]; ate?: string | string[]; pagina?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await requireAccess("/admin/eventos");
  const sp = await searchParams;
  const rawFilter = {
    action: one(sp.acao) || undefined,
    entityTable: one(sp.entidade) || undefined,
    entityId: one(sp.entidadeId) || undefined,
    actorId: one(sp.ator) || undefined,
    since: one(sp.de) || undefined,
    until: one(sp.ate) || undefined,
  };
  const pageRaw = Number(one(sp.pagina));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, MAX_AUDIT_PAGE) : 1;
  const parsedFilter = auditFilterSchema.safeParse(rawFilter);
  const actor = await getSessionActor();
  let result: AuditPage | null = null;
  let failed = false;
  let invalidFilter = false;
  if (!parsedFilter.success) {
    // Filtro inválido (ex.: "Id da entidade" que não é uuid): mensagem clara, sem nem chamar o banco com dado ruim.
    invalidFilter = true;
  } else {
    try {
      if (actor) result = await searchAuditLog(actor, parsedFilter.data, { page });
    } catch (error) {
      console.error("auditoria (admin08-eventos)", error instanceof Error ? error.message : "erro");
      failed = true;
    }
  }
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ acao: rawFilter.action, entidade: rawFilter.entityTable, entidadeId: rawFilter.entityId, ator: rawFilter.actorId, de: rawFilter.since, ate: rawFilter.until })) {
    if (v) query.set(k, v);
  }
  return (
    <AdminShell active="/admin/eventos" email={user.email} breadcrumb="Admin / Eventos" title="Eventos (auditoria)">
      <AuditFilters values={rawFilter} />
      {invalidFilter ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Filtro inválido: confira o formato de &quot;Id da entidade&quot; (uuid), &quot;Ator&quot; (uuid) e as datas.
        </p>
      ) : failed || !result ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">Não foi possível carregar.</p>
      ) : (
        <>
          <AuditTable rows={result.rows} />
          <AuditPager page={result.page} hasNext={result.hasNext} query={query} />
        </>
      )}
    </AdminShell>
  );
}
