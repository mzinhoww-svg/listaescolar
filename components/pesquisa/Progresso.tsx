type Props = { atual: number; total: number };

/** Barra de progresso "N de total". Sem interação: renderiza em qualquer boundary. */
export function Progresso({ atual, total }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round((atual / total) * 100)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-campo h-1.5 w-full overflow-hidden rounded-full">
        <div className="bg-verde-fundo h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-texto-3 text-xs font-bold">
        {atual} de {total}
      </p>
    </div>
  );
}
