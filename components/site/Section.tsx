import type { ReactNode } from "react";

export type Tone = "papel" | "white" | "tinta";
type Props = { id: string; eyebrow: string; title: string; tone?: Tone; children: ReactNode };

const BG: Record<Tone, string> = { papel: "bg-papel", white: "bg-white", tinta: "bg-tinta text-papel" };

/** Bloco de seção da landing (fundo alterna Papel, branco e Tinta): eyebrow, título (h2) e conteúdo. */
export function Section({ id, eyebrow, title, tone = "papel", children }: Props) {
  const dark = tone === "tinta";
  return (
    <section id={id} aria-labelledby={`${id}-t`} className={BG[tone]}>
      <div className="mx-auto w-full max-w-[1200px] px-6 py-14 md:py-20">
        <p className={`text-xs font-extrabold tracking-[0.14em] uppercase ${dark ? "text-verde-certo" : "text-verde-fundo"}`}>{eyebrow}</p>
        <h2 id={`${id}-t`} className="mt-2 text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] md:text-[40px]">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
