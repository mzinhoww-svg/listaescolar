/** Passos do pedido (Escola01, adaptada: a reivindicação não edita dado do INEP, então sem "Endereço"). `current` é 1-based. */
export function ClaimStepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol aria-label="Etapas do pedido" className="grid min-w-0 grid-cols-3 gap-2 text-sm font-bold sm:flex sm:items-center sm:gap-3">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-1 sm:flex-row sm:text-left sm:gap-3 sm:last:flex-none">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                done ? "bg-verde-certo text-tinta" : active ? "bg-tinta text-papel" : "border-linha text-texto-3 border-2"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={`min-w-0 break-words ${active || done ? "" : "text-texto-3"}`}>{label}</span>
            {n < steps.length ? <span aria-hidden="true" className={`hidden h-0.5 flex-1 sm:block ${done ? "bg-verde-certo" : "bg-linha"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
