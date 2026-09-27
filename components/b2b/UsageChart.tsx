// "Chamadas por dia" (B2B01): barras com dado real de `b2b_usage_daily` (últimos 30 dias), sem a nota de
// "proporções ilustrativas" do design (Global Constraints: só dado do banco). Vazio: nenhuma chamada no período.

export function UsageChart({ callsByDay }: { callsByDay: readonly { day: string; count: number }[] }) {
  const max = Math.max(1, ...callsByDay.map((d) => d.count));
  const hasData = callsByDay.some((d) => d.count > 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[200px] items-end gap-1" role="img" aria-label="Chamadas por dia, últimos 30 dias">
        {callsByDay.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.count} chamada(s)`}
            style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
            className={`flex-1 rounded-t-[6px] ${d.count > 0 ? "bg-tinta" : "bg-linha"}`}
          />
        ))}
      </div>
      {hasData ? null : <p className="text-texto-3 text-[13px] font-semibold">Nenhuma chamada registrada no período.</p>}
    </div>
  );
}
