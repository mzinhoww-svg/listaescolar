import type { Metadata } from "next";

import { PhoneMock } from "@/components/site/PhoneMock";
import { SITE_COPY, pageMetadata } from "@/features/site/copy";

export const metadata: Metadata = pageMetadata("comoFunciona");

export default function ComoFunciona() {
  const h = SITE_COPY.how;
  return (
    <main id="conteudo" className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-12 md:py-20">
      <p className="text-verde-fundo text-sm font-extrabold">Como funciona</p>
      <h1 className="mt-2 max-w-[20ch] text-[34px] leading-[1.05] font-extrabold tracking-[-0.035em] md:text-[56px]">{h.title}</h1>
      <p className="text-texto-2 mt-4 max-w-[60ch] text-base leading-relaxed md:text-lg">{h.lead}</p>
      <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-8">
        {h.steps.map((s) => (
          <li key={s.n} className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span aria-hidden className="bg-tinta text-papel flex size-10 items-center justify-center rounded-full font-extrabold">
                {s.n}
              </span>
              <h2 className="text-2xl font-extrabold">{s.title}</h2>
            </div>
            <p className="text-texto-2 text-[15px] leading-relaxed">{s.text}</p>
            <PhoneMock screen={s.screen} label={`Tela ilustrativa: ${s.title}`} />
          </li>
        ))}
      </ol>
    </main>
  );
}
