import type { Metadata } from "next";

import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { B2B_TERMS_TEXT, B2B_TERMS_TEXT_VERSION } from "@/features/b2b/terms";
import { buildPageMetadata } from "@/lib/seo";

// `/parceiros/termos`: texto da API com placeholders jurídicos, sem afirmar conformidade (padrão S27/LegalPage).
// Aceito no cadastro (`consents`, `purpose = 'b2b_api_terms'`, `text_version = B2B_TERMS_TEXT_VERSION`).

export const metadata: Metadata = buildPageMetadata({
  title: "Termos da API B2B · ListaCerta",
  description: "Termos de uso da API B2B do ListaCerta: dados expostos, proibições de uso, revogação e limites.",
  path: "/parceiros/termos",
});

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto w-full max-w-[720px] flex-1 px-6 py-12">
        <p role="note" className="bg-aviso-fundo text-aviso-texto rounded-campo mb-6 px-4 py-3 text-sm font-bold">
          Versão preliminar, em revisão jurídica. Este documento não constitui parecer jurídico nem declaração de
          conformidade regulatória.
        </p>
        <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-[-0.03em] md:text-5xl">Termos de uso da API B2B</h1>
        <p className="text-texto-3 mt-3 text-[13px] font-bold">Versão: {B2B_TERMS_TEXT_VERSION}</p>
        <div className="text-texto-2 mt-8 flex flex-col gap-5 text-base leading-relaxed whitespace-pre-line">{B2B_TERMS_TEXT}</div>
      </main>
      <SiteFooter />
    </>
  );
}
