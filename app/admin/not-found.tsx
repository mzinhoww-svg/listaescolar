import type { Metadata } from "next";

import { buttonClass } from "@/components/ui/Button";
import Link from "next/link";

export const metadata: Metadata = { title: "Registro não encontrado · Admin · ListaCerta", robots: { index: false, follow: false } };

/** 404 da equipe: o registro não existe ou foi removido; volta às filas em vez de levar às telas das famílias. */
export default function AdminNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">Registro não encontrado</h1>
      <p className="text-texto-2 text-[15px] font-semibold">O endereço pode estar errado ou o registro foi removido. Volte a uma fila para continuar.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/admin" className={buttonClass("primary")}>Voltar à visão geral</Link>
        <Link href="/admin/revisao" className={buttonClass("outline")}>Ver a fila de revisão</Link>
      </div>
    </main>
  );
}
