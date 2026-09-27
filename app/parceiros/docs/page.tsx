import type { Metadata } from "next";
import Link from "next/link";

import { EndpointDoc } from "@/components/b2b/EndpointDoc";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ENDPOINTS } from "@/features/b2b/api/endpoints";
import { buildPageMetadata } from "@/lib/seo";

// `/parceiros/docs`: documentação pública da API v1, gerada do mesmo contrato que valida a API e o
// `/v1/openapi.json` (mesmo componente `EndpointDoc` do B2B03, aqui sem a barra lateral do portal).

export const metadata: Metadata = buildPageMetadata({
  title: "Documentação da API B2B · ListaCerta",
  description: "Endpoints, parâmetros, escopos e erros da API v1 do ListaCerta para parceiros B2B.",
  path: "/parceiros/docs",
});

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-2">
          <span className="bg-tinta text-papel w-fit rounded-botao px-3 py-1 text-[12px] font-extrabold">v1 · estável</span>
          <h1 className="text-[36px] font-extrabold tracking-[-0.03em]">Documentação da API B2B</h1>
          <p className="text-texto-2 text-[15px] font-medium">
            Autenticação por cabeçalho <code>x-listacerta-key</code>. Documento completo em{" "}
            <Link href="/v1/openapi.json" className="underline">
              /v1/openapi.json
            </Link>
            . Exemplos são ilustrativos, nunca dados reais.
          </p>
        </header>
        {ENDPOINTS.map((e) => (
          <EndpointDoc key={e.entry.id} entry={e.entry} />
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
