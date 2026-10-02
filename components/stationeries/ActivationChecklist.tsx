import Link from "next/link";

import type { Activation } from "@/features/stationeries/activation";

/** Caminho até o primeiro lead. Só renderiza com passo pendente; some quando tudo foi feito. */
export function ActivationChecklist({ activation }: { activation: Activation }) {
  if (activation.complete) return null;
  const total = activation.steps.length;
  return (
    <section aria-labelledby="ativacao-titulo" className="rounded-card mb-6 bg-white p-6" data-testid="activation">
      <h2 id="ativacao-titulo" className="text-[18px] font-extrabold tracking-[-0.02em]">
        Falta pouco para receber pedidos
      </h2>
      <p className="text-texto-2 mt-1 text-[14px] font-semibold">
        {activation.doneCount} de {total} passos feitos.
      </p>
      <ol className="mt-4 flex flex-col gap-2">
        {activation.steps.map((s) => (
          <li key={s.id} className="flex items-start gap-3" data-done={s.done}>
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${s.done ? "bg-verde-fundo text-white" : "border-tinta border-[1.5px]"}`}
            >
              {s.done ? "✓" : ""}
            </span>
            <div className="min-h-11 flex-1">
              {s.done ? (
                <p className="text-texto-3 text-[15px] font-bold">
                  {s.label}
                  <span className="sr-only"> (feito)</span>
                </p>
              ) : (
                <>
                  <p className="text-[15px] font-extrabold">{s.label}</p>
                  <p className="text-texto-2 text-[13px] font-semibold">{s.hint}</p>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      {activation.next ? (
        <Link
          href={activation.next.href}
          className="bg-tinta text-papel rounded-botao mt-4 flex h-12 items-center justify-center px-6 text-[15px] font-extrabold"
        >
          {activation.next.label}
        </Link>
      ) : null}
    </section>
  );
}
