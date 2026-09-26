import type { Metadata } from "next";

import { BalanceCard } from "@/components/billing/BalanceCard";
import { InvoiceList } from "@/components/billing/InvoiceList";
import { PackageCards } from "@/components/billing/PackageCards";
import { PassCard } from "@/components/billing/PassCard";
import { PriceTierTable } from "@/components/billing/PriceTierTable";
import { StatementTable } from "@/components/billing/StatementTable";
import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { billingErrorMessage } from "@/features/billing/messages";
import { getBillingService } from "@/features/billing/wiring";
import { getOwnerContext } from "@/features/stationeries/session";

export const metadata: Metadata = { title: "Créditos e plano · ListaCerta" };

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function CreditosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getOwnerContext("/papelaria/creditos");
  if (!ctx) {
    return (
      <>
        <PageHeader crumb="Papelaria" title="Créditos e plano" />
        <Notice kind="info">Nenhuma papelaria vinculada a esta conta.</Notice>
      </>
    );
  }
  const erro = billingErrorMessage(one(sp.erro));
  const billing = getBillingService();
  const plan = await billing.getActivePlan();

  if (!plan) {
    return (
      <>
        <PageHeader crumb="Papelaria / Créditos" title="Créditos e plano" />
        {erro ? <Notice kind="error">{erro}</Notice> : null}
        <Notice kind="info">Planos indisponíveis no momento.</Notice>
      </>
    );
  }

  const [summary, statement, invoices, maxInstallments] = await Promise.all([
    billing.getSummary(ctx.actor, ctx.stationery.id),
    billing.getStatement(ctx.actor, ctx.stationery.id),
    billing.listInvoices(ctx.actor, ctx.stationery.id),
    billing.maxInstallmentsForPass(),
  ]);
  const paymentAvailable = billing.paymentAvailable(ctx.stationery.isDemo);
  const season = billing.seasonWindowFor(plan);

  return (
    <>
      <PageHeader crumb="Papelaria / Créditos" title="Créditos e plano" />
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      {sp.ok ? <Notice kind="ok">Feito.</Notice> : null}
      <div className="flex flex-col gap-6">
        <BalanceCard summary={summary} weeklyAverage={statement.weeklyAverage} isDemo={ctx.stationery.isDemo} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-card bg-white p-6">
            <PriceTierTable tiers={plan.tiers} />
          </div>
          {plan.pass ? (
            <PassCard
              plan={plan}
              pass={plan.pass}
              season={season}
              stationeryId={ctx.stationery.id}
              paymentAvailable={paymentAvailable}
              isDemo={ctx.stationery.isDemo}
              maxInstallments={maxInstallments}
              now={new Date()}
            />
          ) : null}
        </div>
        <PackageCards plan={plan} packages={plan.packages} stationeryId={ctx.stationery.id} paymentAvailable={paymentAvailable} isDemo={ctx.stationery.isDemo} />
        <section aria-labelledby="extrato" className="rounded-card bg-white p-6">
          <h2 id="extrato" className="mb-4 text-[17px] font-extrabold">Extrato</h2>
          <StatementTable lines={statement.lines} />
        </section>
        <section aria-labelledby="faturas">
          <h2 id="faturas" className="mb-4 text-[17px] font-extrabold">Faturas</h2>
          <InvoiceList invoices={invoices} />
        </section>
      </div>
    </>
  );
}
