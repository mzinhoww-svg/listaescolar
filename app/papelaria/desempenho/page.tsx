import type { Metadata } from "next";

import { PerformanceSummaryView } from "@/components/payouts/PerformanceSummaryView";
import { Notice, PageHeader } from "@/components/stationeries/PanelShell";
import { getPayoutService } from "@/features/payouts/wiring";
import { getOwnerContext } from "@/features/stationeries/session";

export const metadata: Metadata = { title: "Desempenho · ListaCerta" };

/** Pap07: funil, ticket médio e declarado × confirmado da própria papelaria. */
export default async function DesempenhoPage() {
  const ctx = await getOwnerContext("/papelaria/desempenho");
  if (!ctx) return null;
  let summary = null;
  try {
    summary = await getPayoutService().getPerformanceSummary(ctx.actor, ctx.stationery.id);
  } catch (error) {
    console.error("ler desempenho", error instanceof Error ? error.message : "erro");
  }
  return (
    <>
      <PageHeader crumb="Papelaria / Desempenho" title="Desempenho" />
      {summary ? <PerformanceSummaryView summary={summary} /> : <Notice kind="error">Não foi possível carregar agora.</Notice>}
    </>
  );
}
