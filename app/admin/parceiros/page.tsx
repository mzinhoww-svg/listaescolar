import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { PartnerStatusBadge } from "@/components/b2b/StatusBadge";
import { requireAccess } from "@/features/auth/guard";
import { getSessionActor } from "@/features/auth/actor";
import { getPartnerForAdmin, listPartnersForAdmin } from "@/features/b2b/queries";
import type { AdminPartnerRow } from "@/features/b2b/repository";
import type { B2bPartnerStatus } from "@/features/b2b/states";

// Admin15 (`/admin/parceiros`): filtros Todos/Varejistas/Marcas/EdTech/Pendentes (N do banco), colunas Empresa,
// Tipo, Plano, Chamadas hoje (uso real), Limite/dia, Status, Gerir. "Nova conta" fica fora (o parceiro se
// cadastra; Ruling S24 · Planejamento).

export const dynamic = "force-dynamic";
export const metadata = { title: "Parceiros B2B · Admin · ListaCerta" };

const PARTNER_TYPE_LABEL: Record<string, string> = { retailer: "Varejista", brand: "Marca", edtech: "EdTech" };

const TABS: ReadonlyArray<{ key: string; label: string; test: (r: AdminPartnerRow) => boolean }> = [
  { key: "todos", label: "Todos", test: () => true },
  { key: "varejistas", label: "Varejistas", test: (r) => r.partnerType === "retailer" },
  { key: "marcas", label: "Marcas", test: (r) => r.partnerType === "brand" },
  { key: "edtech", label: "EdTech", test: (r) => r.partnerType === "edtech" },
  { key: "pendentes", label: "Pendentes", test: (r) => r.status === "pending" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { user } = await requireAccess("/admin/parceiros");
  const aba = (await searchParams).aba;
  const tab = TABS.find((t) => t.key === aba) ?? TABS[0]!;
  const actor = await getSessionActor();

  let rows: AdminPartnerRow[] | null = null;
  let usage: Map<string, { callsToday: number; limitPerDay: number | null }> = new Map();
  try {
    if (actor) {
      rows = await listPartnersForAdmin(actor);
      // Uso de hoje e limite/dia vêm de `b2b_partner_overview` (não estão em `AdminPartnerRow`). Aceitável na
      // escala do piloto (Ruling); revisitar com volume real de parceiros.
      const overviews = await Promise.all(rows.map((r) => getPartnerForAdmin(actor, r.id)));
      usage = new Map(
        rows.map((r, i) => {
          const o = overviews[i];
          const limitPerDay = o?.status === "active" ? o.limits.liveRatePerDay : (o?.limits.testRatePerDay ?? null);
          return [r.id, { callsToday: o?.callsToday ?? 0, limitPerDay }];
        }),
      );
    }
  } catch (error) {
    console.error("listagem de parceiros (admin)", error instanceof Error ? error.message : "erro");
  }

  const pendingCount = rows?.filter((r) => r.status === "pending").length ?? 0;
  const filtered = rows?.filter(tab.test) ?? [];

  return (
    <AdminShell active="/admin/parceiros" email={user.email} breadcrumb="Admin / Parceiros B2B" title="Parceiros B2B">
      <nav aria-label="Filtro por tipo/situação" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/parceiros?aba=${t.key}`}
            aria-current={t.key === tab.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-botao px-5 py-2.5 text-[14px] font-extrabold ${t.key === tab.key ? "bg-tinta text-papel" : "bg-campo"}`}
          >
            {t.label}
            {t.key === "pendentes" ? ` (${pendingCount})` : ""}
          </Link>
        ))}
      </nav>
      {rows === null ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Não foi possível carregar os parceiros. <Link href="/admin/parceiros" className="underline">Tentar de novo</Link>
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-texto-2 rounded-[24px] bg-white p-8 text-[15px] font-bold">Nenhum parceiro nesta aba.</p>
      ) : (
        <div className="overflow-x-auto rounded-[24px] bg-white" tabIndex={0} role="region" aria-label="Tabela (role para o lado para ver todas as colunas)">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="text-texto-3 border-linha border-b text-[12px] uppercase">
                <th className="px-4 py-3 font-extrabold">Empresa</th>
                <th className="px-4 py-3 font-extrabold">Tipo</th>
                <th className="px-4 py-3 font-extrabold">Plano</th>
                <th className="px-4 py-3 font-extrabold">Chamadas hoje</th>
                <th className="px-4 py-3 font-extrabold">Limite/dia</th>
                <th className="px-4 py-3 font-extrabold">Status</th>
                <th className="px-4 py-3 font-extrabold sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(15,27,45,0.18)]">Gerir</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-linha border-b last:border-0">
                  <td className="px-4 py-3 font-bold">{r.tradeName}</td>
                  <td className="px-4 py-3">{PARTNER_TYPE_LABEL[r.partnerType] ?? r.partnerType}</td>
                  <td className="px-4 py-3">{r.plan ?? "—"}</td>
                  <td className="px-4 py-3">{usage.get(r.id)?.callsToday ?? 0}</td>
                  <td className="px-4 py-3">{usage.get(r.id)?.limitPerDay ?? "—"}</td>
                  <td className="px-4 py-3">
                    <PartnerStatusBadge status={r.status as B2bPartnerStatus} />
                  </td>
                  <td className="px-4 py-3 sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(15,27,45,0.18)]" data-sticky-action>
                    <Link href={`/admin/parceiros/${r.id}`} className="text-verde-fundo inline-flex min-h-11 items-center font-extrabold underline">
                      Gerir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
