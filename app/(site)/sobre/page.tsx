import type { Metadata } from "next";

import { Logo } from "@/components/brand/Logo";
import { AboutSteps } from "@/components/site/AboutSteps";
import { Placeholder } from "@/components/site/Placeholder";
import { SITE_COPY, pageMetadata } from "@/features/site/copy";
import { LEGAL } from "@/features/site/legal";

export const metadata: Metadata = pageMetadata("sobre");

export default function Sobre() {
  const a = SITE_COPY.about;
  return (
    <main id="conteudo" className="mx-auto w-full max-w-[720px] flex-1 px-6 py-8 md:py-16">
      <section className="bg-tinta text-papel rounded-card flex flex-col gap-5 p-6 md:p-10">
        <span className="bg-papel flex size-14 items-center justify-center rounded-2xl p-2">
          <Logo variant="simbolo" height={40} />
        </span>
        <h1 className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.03em] md:text-4xl">{a.title}</h1>
      </section>
      <h2 className="mt-8 mb-4 text-base font-extrabold">{a.stepsTitle}</h2>
      <AboutSteps items={a.steps} />
      <p className="text-texto-2 mt-8 text-base leading-relaxed">{a.neutral}</p>
      <p className="text-texto-3 mt-10 text-center text-[13px] font-bold">
        Nasceu em Cuiabá · MT. Contato: <Placeholder label="e-mail de contato" value={LEGAL.contactEmail} />
      </p>
    </main>
  );
}
