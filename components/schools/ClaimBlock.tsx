import Link from "next/link";

import { formatDate } from "@/features/claims/format";
import type { VerificationStatus } from "@/features/schools/search/types";

/** O que o bloco precisa da reivindicação do PRÓPRIO usuário logado (nada de decided_by nem contato da escola). */
export type OwnClaimSummary = { status: "submitted" | "awaiting_verification" | "token_expired" | "insufficient_evidence" | "rejected" | "approved"; createdAt: string; decisionReason: string | null };

const outline =
  "border-tinta text-tinta focus-visible:outline-verde-fundo rounded-botao flex h-[52px] items-center justify-center border-[1.5px] text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2";
const solid =
  "bg-tinta text-papel focus-visible:outline-verde-fundo rounded-botao flex h-[52px] items-center justify-center text-base font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2";
const soft = "bg-campo text-tinta rounded-botao flex h-[52px] items-center justify-center text-base font-extrabold";
const OPEN = ["submitted", "awaiting_verification", "token_expired", "insufficient_evidence"];

type Props = { inep: string; status: VerificationStatus; claim?: OwnClaimSummary | null };

function Card({ eyebrow, tag, title, text, children }: { eyebrow: string; tag: string; title: string; text: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby="reivindicar" className="bg-campo flex flex-col gap-3 rounded-3xl p-5" data-claim-state={eyebrow}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-texto-3 text-[11px] font-extrabold tracking-[0.1em] uppercase">{eyebrow}</span>
        <span className="rounded-botao bg-white px-2.5 py-1 text-[11px] font-extrabold">{tag}</span>
      </div>
      <h2 id="reivindicar" className="text-base font-extrabold">{title}</h2>
      <p className="text-texto-2 text-[13px] leading-[1.4] font-medium">{text}</p>
      {children}
    </section>
  );
}

/**
 * Bloco de ação do perfil (App14b), pelo estado real: 1 sem admin, 2 com admin (sem botão: convites adiados),
 * 3 reivindicação própria em análise, 4 própria recusada. Suspensa não mostra bloco. Escola demonstrativa também mostra.
 */
export function ClaimBlock({ inep, status, claim }: Props) {
  if (status === "suspended") return null;
  const href = `/escolas/${inep}/reivindicar`;
  if (claim && OPEN.includes(claim.status)) {
    const text =
      claim.status === "submitted"
        ? `Pedido iniciado em ${formatDate(claim.createdAt)}. Conclua o envio para a equipe analisar.`
        : claim.status === "awaiting_verification"
          ? `Enviada em ${formatDate(claim.createdAt)}. Acompanhe o status na página da reivindicação.`
          : `Enviada em ${formatDate(claim.createdAt)}. Precisa da sua atenção: veja o status.`;
    return (
      <Card eyebrow="Estado 3" tag={claim.status === "awaiting_verification" ? "Pendente" : "Ação necessária"} title="Reivindicação em análise" text={text}>
        <Link href={href} className={soft}>Ver status</Link>
      </Card>
    );
  }
  if (claim?.status === "approved") {
    return (
      <Card eyebrow="Sua escola" tag="Com admin" title="Você administra esta escola" text="Sua reivindicação foi aprovada pela equipe ListaCerta.">
        <Link href="/escola" className={soft}>Ir para Minhas escolas</Link>
      </Card>
    );
  }
  if (status === "verified") {
    return (
      <Card eyebrow="Estado 2" tag="Com admin" title="Esta escola já tem administrador" text="Peça um convite a quem administra para virar co-admin." />
    );
  }
  if (claim?.status === "rejected") {
    return (
      <Card eyebrow="Estado 4" tag="Recusada" title="Reivindicação recusada" text={`Motivo: ${claim.decisionReason ?? "indisponível"}. Você pode enviar uma nova com mais evidências.`}>
        <Link href={`${href}?nova=1`} className={outline}>Reivindicar de novo</Link>
      </Card>
    );
  }
  return (
    <Card
      eyebrow="Estado 1"
      tag="Sem admin"
      title="Você trabalha nesta escola?"
      text={status === "claimed" ? "Este perfil já tem uma reivindicação em andamento. Se você também trabalha na escola, envie a sua." : "Ninguém administra esta página ainda."}
    >
      <Link href={href} className={solid}>Reivindicar escola</Link>
    </Card>
  );
}
