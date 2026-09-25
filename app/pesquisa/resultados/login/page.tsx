import type { Metadata } from "next";

import { Cabecalho } from "@/components/pesquisa/Cabecalho";
import { LoginForm } from "@/components/pesquisa/resultados/LoginForm";

export const metadata: Metadata = {
  title: "Entrar nos resultados | ListaCerta",
  robots: { index: false, follow: false },
};

export default function ResultadosLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-6 px-5 pt-3 pb-14">
      <Cabecalho />
      <div className="flex flex-col gap-2 pt-6">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.02em]">Resultados da pesquisa</h1>
        <p className="text-texto-2 text-base leading-relaxed">Informe a senha para ver os resultados.</p>
      </div>
      <LoginForm />
    </main>
  );
}
