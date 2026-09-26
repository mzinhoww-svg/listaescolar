"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = { children: ReactNode; focar?: boolean; className?: string };

/**
 * Título (h1) de uma tela da pesquisa. Com `focar`, recebe o foco ao montar, sem rolar:
 * cada tela é remontada por step, então isso leva teclado e leitor de tela direto à nova
 * pergunta (em vez de recomeçar no topo) e faz a troca ser anunciada mesmo sem uma
 * região aria-live persistente.
 */
export function TituloTela({ children, focar = false, className = "" }: Props) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focar) ref.current?.focus({ preventScroll: true });
  }, [focar]);

  return (
    <h1
      ref={ref}
      tabIndex={focar ? -1 : undefined}
      className={`focus-visible:outline-verde-fundo rounded-sm text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance focus-visible:outline-2 focus-visible:outline-offset-4 ${className}`}
    >
      {children}
    </h1>
  );
}
