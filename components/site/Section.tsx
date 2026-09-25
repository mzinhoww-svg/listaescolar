import type { ReactNode } from "react";

type Props = { id: string; eyebrow: string; title: string; dark?: boolean; children: ReactNode };

/** Bloco de seção da landing: eyebrow, título (h2) e conteúdo; `dark` usa fundo Tinta. */
export function Section({ id, eyebrow, title, dark = false, children }: Props) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className={dark ? "bg-tinta text-papel" : ""}>
      <div className="mx-auto w-full max-w-[1200px] px-6 py-14 md:py-20">
        <p className={`text-sm font-extrabold ${dark ? "text-verde-certo" : "text-verde-fundo"}`}>{eyebrow}</p>
        <h2 id={`${id}-t`} className="mt-2 max-w-[22ch] text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] md:text-[40px]">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
