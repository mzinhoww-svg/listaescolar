import type { ReactNode } from "react";

/** Coluna mobile das telas de sistema (390 de referência), com fundo Papel. */
export function Screen({ children, top = 56 }: { children: ReactNode; top?: 56 | 72 }) {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-6 pb-9"
      style={{ paddingTop: top }}
    >
      {children}
    </main>
  );
}

// S18 (D-057/estados e a11y): as duas variantes ganham foco visível (contorno Verde Fundo, 2px (Verde Certo sobre claro dá 1,9:1) + offset), pois
// nenhuma das ~20 telas de sistema que usam este botão tinha indicação de foco além do padrão do navegador.
export const primaryButton =
  "flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-botao bg-tinta text-base font-extrabold whitespace-nowrap text-papel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fundo";
export const outlineButton =
  "flex h-[52px] w-full shrink-0 items-center justify-center gap-2 rounded-botao border-[1.5px] border-tinta bg-transparent text-base font-extrabold whitespace-nowrap text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fundo";
