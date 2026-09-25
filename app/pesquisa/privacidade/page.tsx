import type { Metadata } from "next";
import Link from "next/link";

import { Cabecalho } from "@/components/pesquisa/Cabecalho";

export const metadata: Metadata = {
  title: "Como usamos seus dados | Pesquisa ListaCerta",
  description: "Como usamos os dados coletados na pesquisa sobre a compra da lista de material escolar.",
};

export default function PesquisaPrivacidadePage() {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 px-5 pt-3 pb-12">
      <Cabecalho />
      <div>
        <Link
          href="/pesquisa"
          className="text-texto-2 focus-visible:outline-verde-fundo -ml-2 inline-flex h-11 items-center rounded-full px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ← Voltar para a pesquisa
        </Link>
        <h1 className="mt-4 text-[28px] leading-[1.15] font-extrabold tracking-[-0.02em]">
          Como usamos seus dados
        </h1>
      </div>
      <section className="text-texto-2 flex flex-col gap-4 text-base leading-relaxed">
        <p>
          <strong className="text-tinta">Finalidade.</strong> Entender a experiência de compra da lista de
          material escolar e, se você autorizar, avisar pelo WhatsApp quando a lista da sua escola estiver
          disponível.
        </p>
        <p>
          <strong className="text-tinta">Controlador.</strong> ListaCerta (Aurimar Nogueira), contato:{" "}
          mazinhoww@gmail.com.
        </p>
        <p>
          <strong className="text-tinta">Dados coletados.</strong> Suas respostas são anônimas. Nome e
          WhatsApp só são coletados quando você decide informá-los.
        </p>
        <p>
          <strong className="text-tinta">Crianças.</strong> Não coletamos nenhum dado do seu filho além da
          etapa escolar.
        </p>
        <p>
          <strong className="text-tinta">Retenção.</strong> As respostas ficam guardadas por até 24 meses.
          Seu contato fica guardado até você pedir a exclusão ou até 31/12/2027.
        </p>
        <p>
          <strong className="text-tinta">Exclusão.</strong> Para pedir a exclusão dos seus dados, basta
          escrever para mazinhoww@gmail.com.
        </p>
        <p className="bg-aviso-fundo text-aviso-texto rounded-campo px-4 py-3 text-sm font-bold">
          Este aviso não afirma conformidade legal total com a legislação de proteção de dados.
        </p>
      </section>
    </main>
  );
}
