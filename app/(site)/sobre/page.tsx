import type { Metadata } from "next";

import { Placeholder } from "@/components/site/Placeholder";
import { StepsSection } from "@/components/site/StepsSection";
import { SITE_COPY, pageMetadata } from "@/features/site/copy";
import { LEGAL } from "@/features/site/legal";

export const metadata: Metadata = pageMetadata("sobre");

export default function Sobre() {
  const a = SITE_COPY.about;
  return (
    <main id="conteudo" className="mx-auto w-full max-w-[720px] flex-1 px-6 py-12 md:py-20">
      <p className="text-verde-fundo text-sm font-extrabold">Sobre</p>
      <h1 className="mt-2 text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em] md:text-5xl">{a.title}</h1>
      <h2 className="mt-10 mb-4 text-xl font-extrabold">{a.stepsTitle}</h2>
      <StepsSection items={a.steps} />
      <p className="text-texto-2 mt-8 text-base leading-relaxed">{a.neutral}</p>
      <p className="text-texto-2 mt-3 text-base leading-relaxed">
        {a.origin} Contato: <Placeholder label="e-mail de contato" value={LEGAL.contactEmail} />
      </p>
    </main>
  );
}
