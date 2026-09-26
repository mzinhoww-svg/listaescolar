import { formatDateTime } from "@/components/stationeries/StatusPanel";
import { formatBrl } from "@/features/billing/money";
import type { WalletSummary } from "@/features/billing/ports";

type Props = { summary: WalletSummary; weeklyAverage: number | null; isDemo: boolean };

/** Cartão "Saldo" do Pap06: créditos em reais, grátis restantes e validade, consumo médio (ou "indisponível"). */
export function BalanceCard({ summary, weeklyAverage, isDemo }: Props) {
  if (!summary.available) {
    return (
      <div className="rounded-card bg-white p-6" data-testid="balance-card">
        <p className="text-[16px] font-extrabold">Planos indisponíveis no momento</p>
        <p className="text-texto-2 mt-1 text-[14px] font-semibold">Ainda não há um plano de cobrança publicado.</p>
      </div>
    );
  }
  return (
    <div className="bg-tinta text-papel rounded-card p-6" data-testid="balance-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-verde-certo text-[12px] font-extrabold tracking-[0.12em] uppercase">Saldo</p>
          <p className="text-[36px] leading-none font-extrabold tracking-[-0.03em]" data-testid="balance-amount">
            {formatBrl(summary.balanceCents)}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-white/70">
            Créditos em reais; cada lead entregue debita o preço da faixa de itens da lista.
          </p>
        </div>
        {isDemo ? <span className="bg-verde-certo text-tinta h-fit rounded-botao px-3 py-1 text-[12px] font-extrabold">Demonstração</span> : null}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 sm:grid-cols-3">
        <div>
          <p className="text-[20px] font-extrabold">{summary.freeLeft}</p>
          <p className="text-[12px] font-semibold text-white/70">
            leads grátis restantes{summary.freeExpiresAt ? ` · até ${formatDateTime(summary.freeExpiresAt)}` : ""}
          </p>
        </div>
        <div>
          <p className="text-[20px] font-extrabold">{weeklyAverage === null ? "indisponível" : weeklyAverage.toFixed(1)}</p>
          <p className="text-[12px] font-semibold text-white/70">consumo médio por semana</p>
        </div>
        {summary.activePass ? (
          <div>
            <p className="text-[20px] font-extrabold">{summary.activePass.leadsLeft}</p>
            <p className="text-[12px] font-semibold text-white/70">leads restantes no passe (até {summary.activePass.seasonEnd})</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
