/** Passos do pedido (Escola01, adaptada: a reivindicação não edita dado do INEP, então sem "Endereço"). `current` é 1-based. */
export function ClaimStepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol aria-label="Etapas da reivindicação" className="flex items-center gap-3 text-sm font-bold">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex flex-1 items-center gap-3 last:flex-none">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                done ? "bg-verde-certo text-tinta" : active ? "bg-tinta text-papel" : "border-linha text-texto-3 border-2"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={active || done ? "" : "text-texto-3"}>{label}</span>
            {n < steps.length ? <span aria-hidden="true" className={`h-0.5 flex-1 ${done ? "bg-verde-certo" : "bg-linha"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
