"use client";

import Link from "next/link";

import { ShareListCard } from "@/components/share/ShareListCard";
import { useSubmissionStatus } from "@/components/submissions/useSubmissionStatus";
import { buttonClass } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { PUBLICATION_STATE_COPY } from "@/features/submissions/copy";
import type { StatusPayload } from "@/features/submissions/status-model";

const SEND = "/escola/listas/nova";
const LIST_HREF = /^\/escolas\/(\d{8})\/([a-z0-9-]+)/;

type Copy = { title: string; body: string };

/** Título e texto por fase. Só diz "equipe" quando o estado real é revisão humana; sem estado definido, texto neutro (a publicação automática pode estar ligada). */
function copyFor(data: StatusPayload, phase: string, lost: boolean): Copy {
  if (lost) return { title: "Não conseguimos atualizar o andamento", body: "Verifique sua conexão e recarregue a página. O envio já foi feito." };
  if (phase === "failed") return { title: "Não foi possível ler este arquivo", body: "A leitura não terminou e este envio não vale como lista. Envie outro arquivo: um PDF gerado no computador costuma ler melhor que foto." };
  if (phase === "unavailable") return { title: "Leitura automática indisponível no momento", body: "O arquivo está guardado. Sem a leitura automática não mostramos os itens agora. Não precisa enviar de novo: reenviar cria outro envio." };
  if (phase === "reading") return { title: "Recebemos o arquivo da escola", body: "A leitura automática está identificando os itens e as quantidades. Você pode sair desta página: o andamento fica guardado." };
  // `approved` também é o estado da aprovação automática (migration 0203): não diz "pela equipe".
  if (data.status === "approved") return { title: "Aprovada; publicação em andamento", body: "A lista foi aprovada e a publicação ainda não terminou." };
  const key = data.status === "published" ? (data.publishedBy === "auto" ? "published_auto" : "published") : data.status === "human_review" || data.status === "approved" || data.status === "rejected" ? data.status : null;
  if (key) return PUBLICATION_STATE_COPY[key];
  return { title: "Leitura concluída", body: "A leitura terminou. A ListaCerta confere a lista antes de publicar; se precisar, a equipe revisa." };
}

/** Andamento do envio da escola, dentro do painel da escola (UX-090). O `main` e o menu são da casca. */
export function SchoolStatusPanel({ submissionId, initial, origin = "" }: { submissionId: string; initial: StatusPayload; origin?: string }) {
  const { data, phase, lost } = useSubmissionStatus(submissionId, initial);
  const c = copyFor(data, phase, lost);
  const published = data.status === "published" && data.listHref !== undefined;
  const share = published ? LIST_HREF.exec(data.listHref ?? "") : null;
  const items = data.result?.items.length ?? 0;
  const problem = lost || phase === "failed";
  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <section aria-labelledby="andamento" className="flex flex-col gap-3 rounded-[24px] bg-white p-6">
        {data.isDemo ? <p className="bg-campo text-texto-2 w-fit rounded-full px-3 py-1 text-xs font-extrabold">Demonstração</p> : null}
        <h2 id="andamento" className="text-[22px] leading-[1.15] font-extrabold tracking-[-0.03em]">{c.title}</h2>
        <p className="text-texto-2 text-[15px] leading-[1.45] font-medium" role={problem ? "alert" : "status"}>{c.body}</p>
        {phase === "ready" && items > 0 ? <p className="text-[14px] font-extrabold">{items === 1 ? "1 item lido no arquivo." : `${items} itens lidos no arquivo.`}</p> : null}
        {phase === "reading" || (phase === "ready" && !["published", "human_review", "approved", "rejected"].includes(data.status)) ? (
          <InlineStatus tone="info">A ListaCerta confere a lista antes de publicar; se precisar, a equipe revisa.</InlineStatus>
        ) : null}
      </section>
      {share ? <ShareListCard inep={share[1] ?? ""} gradeSlug={share[2] ?? ""} origin={origin} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {published ? <Link href={data.listHref ?? "/escola"} className={buttonClass("primary", "lg")}>Ver a lista oficial</Link> : null}
        {phase === "failed" ? (
          <Link href={SEND} className={buttonClass("primary", "lg")}>Enviar outro arquivo</Link>
        ) : (
          <Link href={SEND} className={buttonClass(published ? "outline" : "primary", published ? "md" : "lg")}>Enviar outra série</Link>
        )}
        <Link href="/escola" className={buttonClass("text")}>Voltar para Minhas escolas</Link>
      </div>
    </div>
  );
}
