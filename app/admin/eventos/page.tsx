import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/AdminShell";
import { auditFilterSchema, searchAuditLog, type AuditRow } from "@/features/admin/audit";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eventos (auditoria) · Admin · ListaCerta", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

// 480: cabe a maioria das linhas de configuração (ex.: ai_settings tem ~600 chars com routes+pipeline_version);
// bloqueia só blobs claramente grandes demais para uma tabela.
function json(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = JSON.stringify(v);
  return s.length > 480 ? `${s.slice(0, 480)}…` : s;
}

type SP = { acao?: string | string[]; entidade?: string | string[]; entidadeId?: string | string[]; ator?: string | string[]; de?: string | string[]; ate?: string | string[] };

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
  const parsedFilter = auditFilterSchema.safeParse(rawFilter);
  const actor = await getSessionActor();
  let rows: AuditRow[] = [];
  let failed = false;
  let invalidFilter = false;
  if (!parsedFilter.success) {
    // Filtro inválido (ex.: "Id da entidade" que não é uuid): mensagem clara, sem nem chamar o banco com dado ruim.
    invalidFilter = true;
  } else {
    try {
      if (actor) rows = await searchAuditLog(actor, parsedFilter.data);
    } catch (error) {
      console.error("auditoria (admin08-eventos)", error instanceof Error ? error.message : "erro");
      failed = true;
    }
  }
  return (
    <AdminShell active="/admin/eventos" email={user.email} breadcrumb="Admin / Eventos" title="Eventos (auditoria)">
      <form className="mb-4 grid gap-3 rounded-[20px] bg-white p-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Filtrar eventos">
        <Field label="Ação" name="acao" defaultValue={rawFilter.action} placeholder="UPDATE" />
        <Field label="Tabela" name="entidade" defaultValue={rawFilter.entityTable} placeholder="school_lists" />
        <Field label="Id da entidade" name="entidadeId" defaultValue={rawFilter.entityId} />
        <Field label="Ator (id)" name="ator" defaultValue={rawFilter.actorId} />
        <Field label="De" name="de" type="date" defaultValue={rawFilter.since} />
        <Field label="Até" name="ate" type="date" defaultValue={rawFilter.until} />
        <button type="submit" className="bg-tinta text-papel rounded-botao col-span-full h-11 w-fit px-6 text-[14px] font-extrabold sm:col-span-1">
          Filtrar
        </button>
      </form>
      {invalidFilter ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Filtro inválido: confira o formato de &quot;Id da entidade&quot; (uuid), &quot;Ator&quot; (uuid) e as datas.
        </p>
      ) : failed ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">Não foi possível carregar.</p>
      ) : (
        <div className="rounded-card overflow-x-auto bg-white">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead className="text-texto-3 border-b border-black/10 font-bold">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Tabela</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">Ator</th>
                <th className="px-4 py-3">Antes</th>
                <th className="px-4 py-3">Depois</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="text-texto-3 px-4 py-6 font-semibold">Nenhum evento com este filtro.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-black/5 align-top">
                    <td className="px-4 py-3 whitespace-nowrap">{formatWhen(r.createdAt)}</td>
                    <td className="px-4 py-3 font-bold">{r.action}</td>
                    <td className="px-4 py-3">{r.entityTable}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.entityId ?? "—"}</td>
                    <td className="px-4 py-3">{r.actorRole ?? "—"}{r.actorId ? <span className="text-texto-3 block font-mono text-[11px]">{r.actorId}</span> : null}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">{json(r.before)}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">{json(r.after)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, name, defaultValue, placeholder, type }: { label: string; name: string; defaultValue?: string; placeholder?: string; type?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-bold">
      {label}
      <input name={name} type={type ?? "text"} defaultValue={defaultValue} placeholder={placeholder} className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium" />
    </label>
  );
}
