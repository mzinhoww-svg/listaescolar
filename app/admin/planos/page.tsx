import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { Notice } from "@/components/stationeries/PanelShell";
import { requireAccess } from "@/features/auth/guard";
import { billingErrorMessage } from "@/features/billing/messages";
import { formatBrl } from "@/features/billing/money";
import { getBillingService } from "@/features/billing/wiring";
import { getSessionActor } from "@/features/stationeries/actor";

import { PlanForm } from "./PlanForm";

export default async function PlanosPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { user } = await requireAccess("/admin/planos");
  const actor = await getSessionActor();
  if (!actor) redirect("/403");
  const sp = await searchParams;
  const billing = getBillingService();
  const [plan, history] = await Promise.all([billing.getActivePlan(), billing.listPlanHistory(actor)]);
  const erro = billingErrorMessage(sp.erro);

  return (
    <AdminShell active="/admin/planos" email={user.email} breadcrumb="Admin / Planos e preços" title="Planos e preços">
      {sp.ok ? <Notice kind="ok">Plano publicado.</Notice> : null}
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      <PlanForm plan={plan} />
      <section aria-labelledby="historico" className="mt-6 rounded-card bg-white p-6">
        <h2 id="historico" className="mb-3 text-[16px] font-extrabold">Histórico de versões (somente leitura)</h2>
        {history.length === 0 ? (
          <p className="text-texto-3 text-[14px]">Nenhum plano publicado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((p) => (
              <li key={p.id} className="text-[14px]">
                <span className="font-extrabold">v{p.version}</span>
                <span className="text-texto-2">
                  {" "}
                  · {p.freeLeads} grátis · {p.tiers.length} faixa(s), 1ª a {formatBrl(p.tiers[0]?.priceCents ?? 0)} · {p.packages.length} pacote(s)
                  {p.pass ? ` · passe ${formatBrl(p.pass.priceCents)}` : " · sem passe"}
                  {plan?.id === p.id ? " · ativo" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
