import Link from "next/link";

type Kind = "unavailable" | "failed" | "lost";
const COPY: Record<Kind, { title: string; body: string }> = {
  unavailable: {
    title: "Leitura automática indisponível no momento",
    body: "Recebemos o seu arquivo e ele fica guardado com segurança. Sem a leitura automática não mostramos itens: tente enviar de novo mais tarde.",
  },
  failed: {
    title: "Não foi possível ler este arquivo",
    body: "A leitura não terminou. Envie outro arquivo (PDF gerado no computador costuma ler melhor que foto).",
  },
  lost: {
    title: "Não conseguimos atualizar o andamento",
    body: "Verifique sua conexão e recarregue a página para ver o resultado.",
  },
};

/** Estados sem resultado: indisponível, erro e perda de conexão. */
export function StatusNotice({ kind }: { kind: Kind }) {
  const c = COPY[kind];
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-1 flex-col gap-4 px-6 pt-14 pb-9">
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">{c.title}</h1>
      <p role={kind === "failed" ? "alert" : undefined} className="text-texto-2 text-[15px] leading-[1.45] font-semibold">
        {c.body}
      </p>
      <Link
        href="/enviar-lista"
        className="bg-tinta text-papel mt-auto flex h-14 w-full items-center justify-center rounded-botao text-base font-extrabold"
      >
        Enviar outro arquivo
      </Link>
    </main>
  );
}
