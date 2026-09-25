import Image from "next/image";
import type { ReactNode } from "react";

import { CheckIcon } from "./icons";

export type ProcessingPhase = "sending" | "reading";
type StepState = "done" | "active" | "todo";

/** Etapas reais do envio (nada de tempo ou contagem inventados). */
function stepsFor(phase: ProcessingPhase): { label: string; state: StepState }[] {
  return [
    { label: "Arquivo recebido", state: phase === "sending" ? "active" : "done" },
    { label: "Lendo os itens e as quantidades", state: phase === "sending" ? "todo" : "active" },
    { label: "Preparando a lista para a sua revisão", state: "todo" },
  ];
}

function StepMark({ state }: { state: StepState }) {
  if (state === "done") return <CheckIcon size={24} className="text-verde-certo shrink-0" />;
  if (state === "active") {
    return (
      <span
        aria-hidden="true"
        className="border-verde-certo/25 border-t-verde-certo size-6 shrink-0 animate-spin rounded-full border-[3px]"
      />
    );
  }
  return <span aria-hidden="true" className="border-papel/15 size-6 shrink-0 rounded-full border-[3px]" />;
}

/** App20-AILoading (390×844): tela escura com as etapas. `children` recebe as ações do estado assíncrono. */
export function ProcessingScreen({
  phase,
  title = "Lendo sua lista",
  subtitle = "Identificando cada item e conferindo as quantidades.",
  children,
}: {
  phase: ProcessingPhase;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <main
      role="status"
      aria-live="polite"
      className="bg-tinta text-papel mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col px-7 pt-24 pb-9"
    >
      <span className="bg-papel mb-5 grid size-20 place-items-center rounded-[22px]">
        <Image src="/brand/simbolo.svg" alt="" width={56} height={56} priority />
      </span>
      <h1 className="text-[32px] leading-[1.05] font-extrabold tracking-[-0.035em]">{title}</h1>
      <p className="text-papel/70 mt-3 text-[15px] leading-[1.4] font-medium">{subtitle}</p>
      <ol className="mt-8 flex flex-col gap-4">
        {stepsFor(phase).map((s) => (
          <li
            key={s.label}
            data-state={s.state}
            className={`flex items-center gap-3 text-base font-extrabold ${s.state === "todo" ? "text-papel/40" : ""}`}
          >
            <StepMark state={s.state} />
            {s.label}
          </li>
        ))}
      </ol>
      <div className="mt-auto flex flex-col gap-3 pt-10">{children}</div>
    </main>
  );
}
