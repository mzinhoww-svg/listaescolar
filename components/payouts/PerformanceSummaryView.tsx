import { formatBrl } from "@/features/billing/money";
import type { PerformanceSummary } from "@/features/payouts/ports";

const ROW = "flex items-center justify-between gap-3 text-[14px] font-bold";

/** Pap07: funil, ticket médio e declarado × confirmado. Sem "respondido em 1h" nem bairro nesta fatia (dívida). */
export function PerformanceSummaryView({ summary }: { summary: PerformanceSummary }) {
  const divergence = summary.declaredCount === 0 ? null : summary.declaredCount - summary.confirmedCount;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-card flex flex-col gap-3 bg-white p-6">
        <h2 className="text-[16px] font-extrabold">Funil dos seus leads</h2>
        <div className={ROW}><span className="text-texto-2 font-semibold">Leads enviados</span><span>{summary.funnel.sent}</span></div>
        <div className={ROW}><span className="text-texto-2 font-semibold">Lista aberta</span><span>{summary.funnel.opened}</span></div>
        <div className={ROW}><span className="text-texto-2 font-semibold">Atendidos</span><span>{summary.funnel.attended}</span></div>
        <div className={ROW}><span className="text-texto-2 font-semibold">Vendidos</span><span>{summary.funnel.sold}</span></div>
        <p className="text-texto-3 mt-2 text-[13px] font-semibold">
          Ticket médio (vendas com Pix pela plataforma confirmado):{" "}
          {summary.ticketAverageCents === null ? "indisponível" : formatBrl(summary.ticketAverageCents)}
        </p>
      </section>
      <section className="rounded-card flex flex-col gap-3 bg-white p-6">
        <h2 className="text-[16px] font-extrabold">Declarado × confirmado</h2>
        <p className="text-texto-2 text-[13px] font-semibold">Vendas que você marcou como &ldquo;Vendi&rdquo; e que bateram na regra de 2 de 3 sinais (S22).</p>
        <div className={ROW}><span className="text-texto-2 font-semibold">Você declarou</span><span>{summary.declaredCount}</span></div>
        <div className={ROW}><span className="text-texto-2 font-semibold">Confirmadas (2 de 3 sinais)</span><span>{summary.confirmedCount}</span></div>
        {divergence !== null ? (
          <p className={`rounded-campo px-4 py-3 text-[13px] font-extrabold ${divergence > 0 ? "bg-campo" : "bg-verde-certo text-tinta"}`}>
            {divergence > 0 ? `${divergence} venda(s) declarada(s) ainda sem 2º sinal de confirmação.` : "Todas as vendas declaradas já têm 2 sinais de confirmação."}
          </p>
        ) : (
          <p className="text-texto-3 text-[13px] font-semibold">Sem vendas declaradas ainda.</p>
        )}
      </section>
    </div>
  );
}
