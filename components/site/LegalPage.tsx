import { Fragment } from "react";

import { LEGAL, PRELIMINARY_BANNER, type LegalSection } from "@/features/site/legal";

import { Placeholder } from "./Placeholder";

type Props = { title: string; sections: LegalSection[] };

export function LegalPage({ title, sections }: Props) {
  return (
    <main id="conteudo" className="mx-auto w-full max-w-[720px] flex-1 px-6 py-12">
      <p role="note" className="bg-aviso-fundo text-aviso-texto rounded-campo mb-6 px-4 py-3 text-sm font-bold">
        {PRELIMINARY_BANNER}
      </p>
      <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.03em] md:text-5xl">{title}</h1>
      <ol className="mt-8 flex flex-col gap-7">
        {sections.map((s, i) => (
          <li key={s.title}>
            <h2 className="text-xl font-extrabold">
              {i + 1}. {s.title}
            </h2>
            {s.paragraphs.map((p, j) => (
              <p key={j} className="text-texto-2 mt-2 text-base leading-relaxed">
                {p.map((part, k) =>
                  typeof part === "string" ? (
                    <Fragment key={k}>{part}</Fragment>
                  ) : (
                    <Placeholder key={k} label={part.label} value={LEGAL[part.key]} />
                  ),
                )}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </main>
  );
}
