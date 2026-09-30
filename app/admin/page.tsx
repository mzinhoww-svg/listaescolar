import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import {
  DASHBOARD_CATEGORY_LABEL,
  CLAIM_STATE_LABEL,
  LEAD_STATE_LABEL,
  LIST_STATE_LABEL,
  SCHOOL_STATE_LABEL,
  STATIONERY_STATE_LABEL,
} from "@/features/admin/labels";
import { attentionItems } from "@/features/admin/attention";
import { getConversionService } from "@/features/conversion/wiring";
import {
  getDashboardCounts,
  type DashboardCategory,
  type DashboardCounts,
} from "@/features/admin/dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · ListaCerta" };

const LABELS: Record<keyof DashboardCounts, Record<string, string>> = {
  schools: SCHOOL_STATE_LABEL,
  lists: LIST_STATE_LABEL,
  claims: CLAIM_STATE_LABEL,
  stationeries: STATIONERY_STATE_LABEL,
  leads: LEAD_STATE_LABEL,
};

function CategoryCard({
  title,
  category,
  labels,
}: {
  title: string;
  category: DashboardCategory;
  labels: Record<string, string>;
}) {
  const total = category.unavailable ? null : category.counts.reduce((acc, c) => acc + c.count, 0);
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[16px] font-extrabold">{title}</h2>
        <span className="text-texto-3 text-[13px] font-bold">
          {category.unavailable ? "indisponível" : `${total} no total`}
        </span>
      </div>
      {category.unavailable ? (
        <p className="text-erro-texto text-[13px] font-semibold">
          Não foi possível consultar agora.
        </p>
      ) : category.counts.every((c) => c.count === 0) ? (
        <p className="text-texto-3 text-[13px] font-semibold">Nenhum registro ainda.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-[13px]">
          {category.counts
            .filter((c) => c.count > 0)
            .map((c) => (
              <div
                key={c.state}
                className="bg-campo rounded-botao flex items-center justify-between gap-2 px-3 py-2"
              >
                <dt className="font-semibold">{labels[c.state] ?? c.state}</dt>
                <dd className="font-extrabold">{c.count}</dd>
              </div>
            ))}
        </dl>
      )}
    </section>
  );
}

export default async function Page() {
  const { user } = await requireAccess("/admin");
  const actor = await getSessionActor();
  let counts: DashboardCounts | null = null;
  try {
    if (actor) counts = await getDashboardCounts(actor);
  } catch (error) {
    console.error("dashboard admin", error instanceof Error ? error.message : "erro");
  }
  let openDisputes: number | null = null;
  try {
    if (actor) openDisputes = (await getConversionService().listOpenDisputesForAdmin(actor)).length;
  } catch (error) {
    console.error("dashboard admin: contestações", error instanceof Error ? error.message : "erro");
  }
  const attention = counts ? attentionItems(counts, openDisputes) : [];
  return (
    <AdminShell active="/admin" email={user.email} breadcrumb="Admin" title="Visão geral">
      {counts === null ? (
        <p
          className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold"
          role="alert"
        >
          Não foi possível carregar as contagens agora.
        </p>
      ) : (
        <>
          <section
            aria-labelledby="atencao-titulo"
            className="mb-4 flex flex-col gap-3 rounded-[20px] bg-white p-5"
          >
            <h2 id="atencao-titulo" className="text-[16px] font-extrabold">
              Precisa da sua decisão
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="bg-campo rounded-botao flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-[14px] font-extrabold"
                  >
                    <span>{a.label}</span>
                    <span>{a.count === null ? "indisponível" : a.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(counts) as (keyof DashboardCounts)[]).map((k) => (
              <CategoryCard
                key={k}
                title={DASHBOARD_CATEGORY_LABEL[k]}
                category={counts![k]}
                labels={LABELS[k]}
              />
            ))}
          </div>
        </>
      )}
      <div className="mt-6 flex flex-wrap gap-3 text-[14px] font-extrabold">
        <Link
          href="/admin/importacoes"
          className="text-verde-fundo inline-flex min-h-11 items-center underline"
        >
          Importações de escolas
        </Link>
        <Link
          href="/admin/papelarias"
          className="text-verde-fundo inline-flex min-h-11 items-center underline"
        >
          Papelarias
        </Link>
        <Link
          href="/admin/eventos"
          className="text-verde-fundo inline-flex min-h-11 items-center underline"
        >
          Eventos (auditoria)
        </Link>
        <Link
          href="/admin/denuncias"
          className="text-verde-fundo inline-flex min-h-11 items-center underline"
        >
          Denúncias
        </Link>
        <Link
          href="/admin/ia"
          className="text-verde-fundo inline-flex min-h-11 items-center underline"
        >
          Configuração de IA
        </Link>
      </div>
    </AdminShell>
  );
}
