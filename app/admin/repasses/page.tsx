import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { BatchesTable } from "@/components/payouts/BatchesTable";
import { CommissionSettingsForm } from "@/components/payouts/CommissionSettingsForm";
import { ConfirmSalesAdminList } from "@/components/payouts/ConfirmSalesAdminList";
import { PayoutKpiRow } from "@/components/payouts/PayoutKpiRow";
import { PaymentAlertsList } from "@/components/payouts/PaymentAlertsList";
import { PendingRepassesTable } from "@/components/payouts/PendingRepassesTable";
import { SalesTable } from "@/components/payouts/SalesTable";
import { SchoolConfigForm } from "@/components/payouts/SchoolConfigForm";
import { SchoolConfigTable } from "@/components/payouts/SchoolConfigTable";
import { Notice } from "@/components/stationeries/PanelShell";
import { requireAccess } from "@/features/auth/guard";
import { getBillingService } from "@/features/billing/wiring";
import { errorMessageForCode } from "@/features/payouts/messages";
import { getPayoutService } from "@/features/payouts/wiring";
import { getSessionActor } from "@/features/stationeries/actor";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Admin13: comissão, repasse por escola/APM, vendas confirmadas, lotes de pagamento e conciliação (D-101). */
export default async function RepassesPage({ searchParams }: { searchParams: Promise<{ erro?: string | string[]; ok?: string | string[] }> }) {
  const { user } = await requireAccess("/admin/repasses");
  const actor = await getSessionActor();
  if (!actor) redirect("/403");
  const sp = await searchParams;
  const erro = errorMessageForCode(one(sp.erro));

  const payouts = getPayoutService();
  const billing = getBillingService();
  const [settings, schoolConfigs, schoolOptions, confirmableSales, sales, pending, batches, alerts] = await Promise.all([
    payouts.getActiveSettings(),
    payouts.listSchoolConfigs(actor),
    payouts.listSchoolOptions(actor),
    payouts.listConfirmableSalesForAdmin(actor),
    payouts.listRecentSalePayments(actor, 100),
    payouts.listPendingRepasses(actor),
    payouts.listBatches(actor, 50),
    billing.listPaymentAlerts(actor),
  ]);

  const executedCents = batches.filter((b) => b.status === "executed").reduce((sum, b) => sum + b.totalCents, 0);

  return (
    <AdminShell active="/admin/repasses" email={user.email} breadcrumb="Admin / Repasses" title="Repasses para escolas e APMs">
      {one(sp.ok) ? <Notice kind="ok">Feito.</Notice> : null}
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      <div className="flex flex-col gap-8">
        <PayoutKpiRow
          pendingCents={pending.reduce((sum, p) => sum + p.pendingCents, 0)}
          schoolsWithRepasse={pending.length}
          executedCents={executedCents}
        />

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CommissionSettingsForm settings={settings} />
          <SchoolConfigForm schools={schoolOptions} />
        </section>

        <section>
          <h2 className="mb-3 text-[18px] font-extrabold">Escolas com repasse configurado</h2>
          <SchoolConfigTable rows={schoolConfigs} />
        </section>

        <ConfirmSalesAdminList sales={confirmableSales} schools={schoolOptions} />

        <section>
          <h2 className="mb-3 text-[18px] font-extrabold">Repasse pendente</h2>
          <PendingRepassesTable rows={pending} />
        </section>

        <section>
          <h2 className="mb-3 text-[18px] font-extrabold">Lotes de pagamento</h2>
          <BatchesTable rows={batches} />
        </section>

        <PaymentAlertsList alerts={alerts} />

        <section>
          <h2 className="mb-3 text-[18px] font-extrabold">Vendas confirmadas (Pix pela plataforma)</h2>
          <SalesTable rows={sales} />
        </section>
      </div>
    </AdminShell>
  );
}
