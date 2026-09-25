export const STEPS = ["Dados da loja", "Atendimento", "Confirmação"] as const;

/** Trilha de passos (Pap01): concluído com marca, atual em Tinta, próximos em contorno. */
export function Stepper({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol aria-label="Passos do cadastro" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      {STEPS.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={label} aria-current={now ? "step" : undefined} className="flex items-center gap-3">
            <span
              className={`grid size-7 place-items-center rounded-full text-[12px] font-extrabold ${
                done || now ? "bg-tinta text-papel" : "text-texto-3 border-[1.5px] border-[#cfc9b8]"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={`text-[15px] font-extrabold ${now || done ? "" : "text-texto-3"}`}>{label}</span>
            {i < STEPS.length - 1 ? <span aria-hidden className={`hidden h-0.5 w-10 sm:block ${done ? "bg-verde-certo" : "bg-[#d9d4c6]"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
