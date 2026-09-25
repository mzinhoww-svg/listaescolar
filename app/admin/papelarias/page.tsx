import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable } from "@/components/stationeries/AdminTable";
import { Notice } from "@/components/stationeries/PanelShell";
import { requireAccess } from "@/features/auth/guard";
import { ADMIN_TABS, filterRows, parseTab } from "@/features/stationeries/admin-filter";
import { errorMessageForCode } from "@/features/stationeries/messages";
import { listAdminRows, type AdminListRow } from "@/features/stationeries/queries";

import { adminTransitionAction } from "./actions";

type SP = { aba?: string; q?: string; ok?: string; erro?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await requireAccess("/admin");
  const sp = await searchParams;
  const tab = parseTab(sp.aba);
  const q = (sp.q ?? "").slice(0, 80);
  let all: AdminListRow[] = [];
  let failed = false;
  try {
    all = await listAdminRows();
  } catch (error) {
    console.error("listar papelarias (admin)", error);
    failed = true;
  }
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const rows = filterRows(all, tab, q);
  const cards = [
    { n: count("under_review"), label: "aguardando aprovação", cls: "bg-tinta text-white" },
    { n: count("active"), label: "ativas", cls: "bg-white" },
    { n: count("paused"), label: "pausadas", cls: "bg-white" },
    { n: count("suspended"), label: "suspensas", cls: "bg-white" },
  ];
  return (
    <AdminShell
      active="/admin/papelarias"
      email={user.email}
      breadcrumb="Admin / Papelarias"
      title="Papelarias"
      actions={
        <form action="/admin/papelarias" role="search" className="flex">
          <input type="hidden" name="aba" value={tab} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Nome, CNPJ ou bairro"
            aria-label="Buscar por nome, CNPJ ou bairro"
            className="h-12 w-[280px] rounded-botao bg-white px-5 text-[14px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-verde-fundo"
          />
        </form>
      }
    >
      {sp.ok ? <Notice kind="ok">Status atualizado.</Notice> : null}
      {sp.erro ? <Notice kind="error">{errorMessageForCode(sp.erro)}</Notice> : null}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-card p-5 ${c.cls}`}>
            <p className="text-[32px] leading-none font-extrabold">{c.n}</p>
            <p className="mt-2 text-[13px] font-bold opacity-80">{c.label}</p>
          </div>
        ))}
      </div>
      <nav aria-label="Filtro por status" className="mb-4 flex flex-wrap gap-2">
        {ADMIN_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/papelarias?aba=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`rounded-botao px-5 py-2.5 text-[14px] font-extrabold ${t.key === tab ? "bg-tinta text-papel" : "bg-campo"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {failed ? (
        <Notice kind="error">
          Não foi possível carregar a fila.{" "}
          <Link href="/admin/papelarias" className="underline">Tentar de novo</Link>
        </Notice>
      ) : (
        <AdminTable rows={rows} approve={adminTransitionAction} />
      )}
    </AdminShell>
  );
}
