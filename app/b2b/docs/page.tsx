import Link from "next/link";

import { CurlSample } from "@/components/b2b/CurlSample";
import { EndpointDoc } from "@/components/b2b/EndpointDoc";
import { ENDPOINTS } from "@/features/b2b/api/endpoints";
import { siteBase } from "@/lib/site-base";

// B2B03 (`/b2b/docs`): documentação da API v1, no portal (com a barra lateral do `/b2b/layout.tsx`). Mesmo
// componente `EndpointDoc` de `/parceiros/docs` (pública, sem barra lateral) — a mesma fonte (o contrato), nunca
// uma lista escrita à mão.

export const metadata = { title: "Documentação · Portal B2B · ListaCerta" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="bg-tinta text-papel w-fit rounded-botao px-3 py-1 text-[12px] font-extrabold">v1 · estável</span>
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.035em]">Documentação</h1>
        <p className="text-texto-2 text-[15px] font-medium">
          Documento completo em{" "}
          <Link href="/v1/openapi.json" className="underline">
            /v1/openapi.json
          </Link>
          . Erros: 401 chave inválida · 404 não encontrado · 429 limite excedido (use <code>Retry-After</code>).
        </p>
      </header>
      <section className="flex flex-col gap-3 rounded-[24px] bg-white p-6">
        <h2 className="text-[18px] font-extrabold">Sua primeira chamada</h2>
        <p className="text-texto-2 text-[14px] font-medium">Crie uma chave em API e chaves, troque SUA_CHAVE no exemplo e rode no terminal.</p>
        <CurlSample environment="test" origin={(siteBase() ?? "https://SEU_ENDERECO_DA_LISTACERTA").replace(/\/$/, "")} />
      </section>
      {ENDPOINTS.map((e) => (
        <EndpointDoc key={e.entry.id} entry={e.entry} />
      ))}
    </div>
  );
}
