type Props = { atual: number; total: number };

/** Barra de progresso fina (o texto "N de total" fica no cabeçalho). Sem interação. */
export function Progresso({ atual, total }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round((atual / total) * 100)));
  return (
    <div
      role="progressbar"
      aria-label="Progresso da pesquisa"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={atual}
      aria-valuetext={`${atual} de ${total}`}
      className="bg-campo h-1.5 w-full overflow-hidden rounded-full"
    >
      <div
        className="bg-verde-fundo h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
