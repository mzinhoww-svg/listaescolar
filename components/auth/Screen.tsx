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

export const primaryButton =
  "flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-botao bg-tinta text-base font-extrabold whitespace-nowrap text-papel";
export const outlineButton =
  "flex h-[52px] w-full shrink-0 items-center justify-center gap-2 rounded-botao border-[1.5px] border-tinta bg-transparent text-base font-extrabold whitespace-nowrap text-tinta";
