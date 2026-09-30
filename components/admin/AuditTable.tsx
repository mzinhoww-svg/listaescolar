import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";
import type { AuditRow } from "@/features/admin/audit";
import { ACTION_OPTIONS, actionLabel, actorLabel, describeChanges, KNOWN_TABLES, tableLabel } from "@/features/admin/audit-labels";

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

type Values = { action?: string | undefined; entityTable?: string | undefined; entityId?: string | undefined; actorId?: string | undefined; since?: string | undefined; until?: string | undefined };

export function AuditFilters({ values }: { values: Values }) {
  const tables = KNOWN_TABLES.some((t) => t.value === values.entityTable) || !values.entityTable ? KNOWN_TABLES : [...KNOWN_TABLES, { value: values.entityTable, label: tableLabel(values.entityTable) }];
  return (
    <form className="mb-4 grid gap-3 rounded-[20px] bg-white p-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Filtrar eventos">
      <Select label="Ação" name="acao" defaultValue={values.action?.toUpperCase()} options={ACTION_OPTIONS} all="Todas" />
      <Select label="Tabela" name="entidade" defaultValue={values.entityTable} options={tables} all="Todas" />
      <Field label="Id da entidade" name="entidadeId" defaultValue={values.entityId} />
      <Field label="Ator (id)" name="ator" defaultValue={values.actorId} />
      <Field label="De" name="de" type="date" defaultValue={values.since} />
      <Field label="Até" name="ate" type="date" defaultValue={values.until} />
      <button type="submit" className={buttonClass("primary", "md", "col-span-full w-fit sm:col-span-1")}>Filtrar</button>
    </form>
  );
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="rounded-card overflow-x-auto bg-white" tabIndex={0} role="region" aria-label="Tabela (role para o lado para ver todas as colunas)">
      <table className="w-full min-w-[900px] text-left text-[13px]">
        <thead className="text-texto-3 border-b border-black/10 font-bold">
          <tr>
            <th className="px-4 py-3">Quando</th>
            <th className="px-4 py-3">Ação</th>
            <th className="px-4 py-3">O quê</th>
            <th className="px-4 py-3">Quem</th>
            <th className="px-4 py-3">O que mudou</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="text-texto-3 px-4 py-6 font-semibold">Nenhum evento com este filtro.</td></tr>
          ) : (
            rows.map((r) => {
              const who = actorLabel(r);
              const changes = describeChanges(r.action, r.before, r.after);
              return (
                <tr key={r.id} className="border-b border-black/5 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{formatWhen(r.createdAt)}</td>
                  <td className="px-4 py-3 font-bold">{actionLabel(r.action)}</td>
                  <td className="px-4 py-3">
                    {tableLabel(r.entityTable)}
                    {r.entityId ? <span className="text-texto-3 block font-mono text-[12px]">{r.entityId.slice(0, 8)}…</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold">{who.primary}</span>
                    <span className="text-texto-3 block text-[12px]">{who.secondary}</span>
                  </td>
                  <td className="px-4 py-3">
                    {changes.length === 0 ? (
                      <span className="text-texto-3">Sem mudança de campo visível</span>
                    ) : (
                      <ul className="grid gap-1">
                        {changes.slice(0, 8).map((c) => (
                          <li key={c.label}>
                            <span className="font-bold">{c.label}:</span>{" "}
                            {r.action === "UPDATE" ? `${c.before ?? "vazio"} → ${c.after ?? "vazio"}` : (c.after ?? c.before ?? "vazio")}
                          </li>
                        ))}
                        {changes.length > 8 ? <li className="text-texto-3">e mais {changes.length - 8} campo(s)</li> : null}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AuditPager({ page, hasNext, query }: { page: number; hasNext: boolean; query: URLSearchParams }) {
  const href = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("pagina", String(p));
    return `/admin/eventos?${q.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center gap-3" aria-label="Paginação dos eventos">
      {page > 1 ? <Link href={href(page - 1)} className={buttonClass("outline", "md")}>Página anterior</Link> : null}
      <span className="text-texto-3 text-[13px] font-semibold">Página {page}</span>
      {hasNext ? <Link href={href(page + 1)} className={buttonClass("outline", "md")}>Próxima página</Link> : null}
    </nav>
  );
}

function Field({ label, name, defaultValue, type }: { label: string; name: string; defaultValue?: string | undefined; type?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-bold">
      {label}
      <input name={name} type={type ?? "text"} defaultValue={defaultValue} className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium" />
    </label>
  );
}

function Select({ label, name, defaultValue, options, all }: { label: string; name: string; defaultValue?: string | undefined; options: readonly { value: string; label: string }[]; all: string }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-bold">
      {label}
      <select name={name} defaultValue={defaultValue ?? ""} className="bg-campo rounded-campo h-11 px-3 text-[14px] font-medium">
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
