import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { DelinquencyTable } from "@/components/payouts/DelinquencyTable";
import { requireAccess } from "@/features/auth/guard";
import { getPayoutService } from "@/features/payouts/wiring";
import { getSessionActor } from "@/features/stationeries/actor";

export const dynamic = "force-dynamic";

/** Admin14: régua de cobrança (em dia / atraso / pausado), sempre calculada sobre as faturas em aberto da S21. */
export default async function InadimplenciaPage() {
  const { user } = await requireAccess("/admin/inadimplencia");
  const actor = await getSessionActor();
  if (!actor) redirect("/403");

  const payouts = getPayoutService();
  const [settings, rows] = await Promise.all([payouts.getActiveSettings(), payouts.listDelinquency(actor)]);
  const pausedCount = rows.filter((r) => r.status === "pausado").length;
  const lateCount = rows.filter((r) => r.status === "atraso").length;

  return (
    <AdminShell active="/admin/inadimplencia" email={user.email} breadcrumb="Admin / Inadimplência" title="Inadimplência">
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-card bg-white p-5">
            <p className="text-[28px] leading-none font-extrabold tracking-[-0.02em]">{lateCount}</p>
            <p className="text-texto-2 mt-1 text-[13px] font-semibold">papelaria(s) em atraso</p>
          </div>
          <div className="bg-tinta text-papel rounded-card p-5">
            <p className="text-[28px] leading-none font-extrabold tracking-[-0.02em]">{pausedCount}</p>
            <p className="mt-1 text-[13px] font-semibold text-white/70">pausada(s), sem leads novos</p>
          </div>
        </div>

        {settings ? (
          <p className="text-texto-2 rounded-campo bg-campo px-4 py-3 text-[13px] font-semibold">
            Regra vigente: atraso além de {settings.graceDays} dia(s) entra em &ldquo;em atraso&rdquo;; além de {settings.blockDays} dia(s), a papelaria é
            pausada automaticamente (some das candidatas a novo lead, sem aviso ao responsável do motivo). Prazos configurados em{" "}
            <Link href="/admin/repasses" className="underline">Repasses</Link>.
          </p>
        ) : (
          <p className="text-texto-2 rounded-campo bg-campo px-4 py-3 text-[13px] font-semibold">
            Nenhum prazo publicado ainda: por padrão, ninguém é pausado por atraso (falha aberta). Configure em{" "}
            <Link href="/admin/repasses" className="underline">Repasses</Link>.
          </p>
        )}

        <DelinquencyTable rows={rows} />
      </div>
    </AdminShell>
  );
}
