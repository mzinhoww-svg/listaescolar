import type { Metadata } from "next";

import { ArrowRight } from "@/components/site/icons";
import { PhoneMock } from "@/components/site/PhoneMock";
import { SITE_COPY, pageMetadata } from "@/features/site/copy";

export const metadata: Metadata = pageMetadata("comoFunciona");

export default function ComoFunciona() {
  const h = SITE_COPY.how;
  return (
    <main id="conteudo" className="bg-papel flex-1">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-12 md:py-20">
        <p className="text-verde-fundo text-xs font-extrabold tracking-[0.14em] uppercase">Como funciona</p>
        <h1 className="mt-2 max-w-[22ch] text-[34px] leading-[1.05] font-extrabold tracking-[-0.035em] md:text-[56px]">{h.title}</h1>
        <p className="text-texto-2 mt-4 max-w-[60ch] text-base leading-relaxed md:text-lg">{h.lead}</p>
        <ol className="mt-12 grid gap-14 md:mt-16 md:grid-cols-3 md:gap-20">
          {h.steps.map((s, i) => (
            <li key={s.n} className="relative flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <span aria-hidden className="bg-verde-certo text-tinta flex size-14 shrink-0 items-center justify-center rounded-full text-3xl font-extrabold md:size-16">
                  {s.n}
                </span>
                <h2 className="text-[36px] leading-none font-extrabold tracking-[-0.03em] md:text-5xl">{s.title}</h2>
              </div>
              <p className="text-texto-2 text-[15px] leading-relaxed">{s.text}</p>
              <PhoneMock screen={s.screen} label={`Tela ilustrativa: ${s.title}`} />
              {i < h.steps.length - 1 ? (
                <span aria-hidden className="absolute top-[58%] -right-[3.25rem] hidden w-8 md:block">
                  <ArrowRight />
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
