"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import type { ImportState } from "@/app/papelaria/catalogo/actions";

const MAX_BYTES = 2 * 1024 * 1024; // igual ao limite do servidor (CSV_MAX_BYTES)

type Action = (prev: ImportState, formData: FormData) => Promise<ImportState>;

/** Importar planilha CSV: erros por linha voltam num arquivo baixável (com fórmulas neutralizadas). */
export function ImportForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as ImportState);
  const [sizeError, setSizeError] = useState(false);
  const router = useRouter();
  const done = state.status === "done";
  // Depois de importar, sai o aviso antigo ("Item salvo.") da URL e a tabela é relida do servidor.
  useEffect(() => {
    if (done && window.location.search !== "") router.replace("/papelaria/catalogo");
  }, [state, done, router]);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-card bg-white p-5" aria-busy={pending}>
      <h2 className="text-[18px] font-extrabold">Importar planilha</h2>
      <p className="text-texto-2 text-[14px]">
        CSV com as colunas <strong>nome</strong>, <strong>preco</strong> e (opcional) <strong>estoque</strong> (sim, nao ou vazio). Até 2.000 linhas e 2 MB.
        Preço e estoque entram como informados por você, com a data de hoje.
      </p>
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        aria-label="Planilha CSV"
        className="text-[14px]"
        onChange={(e) => setSizeError((e.target.files?.[0]?.size ?? 0) > MAX_BYTES)}
      />
      {sizeError ? (
        <p role="alert" className="text-[14px] font-bold text-red-700">
          A planilha passa de 2 MB. Divida em partes menores.
        </p>
      ) : null}
      <button type="submit" disabled={pending || sizeError} className="bg-tinta text-papel h-12 w-fit rounded-botao px-6 text-[15px] font-extrabold disabled:opacity-60">
        {pending ? "Importando…" : "Importar"}
      </button>
      <div aria-live="polite">
        {state.status === "error" ? (
          <p role="alert" className="text-[14px] font-bold text-red-700">
            {state.message} Escolha o arquivo de novo para tentar outra vez.
          </p>
        ) : null}
        {state.status === "done" ? (
          <div className="text-[14px] font-bold" data-testid="import-result">
            <p className="text-verde-fundo">
              {state.imported} de {state.totalRows} linhas importadas.
              {state.errorCount > 0 ? ` ${state.errorCount} com erro.` : ""}
            </p>
            {state.reportHref ? (
              <a href={state.reportHref} download={state.reportName} className="text-verde-fundo underline">
                Baixar relatório de erros
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
