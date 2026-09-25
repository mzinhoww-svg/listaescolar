import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { DemoBadge } from "@/components/admin/DemoBadge";
import { channelLine } from "@/components/claims/ClaimQueueCard";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { ClaimTimeline } from "@/components/claims/ClaimTimeline";
import { DecisionForm, type DecisionOption } from "@/components/claims/DecisionForm";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { formatBytes, formatDate } from "@/features/claims/format";
import { METHOD_LABEL } from "@/features/claims/messages";
import { getClaimForAdmin } from "@/features/claims/queries";
import { uuidSchema } from "@/features/claims/schemas";
import { canTransition } from "@/features/claims/state";
import type { AdminClaimView } from "@/features/claims/types";

import { decideClaimAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reivindicação · ListaCerta" };

/** Aprovar exige canal confirmado (token) ou ao menos um arquivo (documentos) além da transição permitida. */
export function decisionOptions(c: AdminClaimView): DecisionOption[] {
  const missing = c.method === "documents" ? (c.evidence.length === 0 ? "Falta evidência: nenhum arquivo enviado." : null) : c.channelConfirmedAt ? null : "Falta confirmar o canal da escola.";
  const wrong = (to: "approved" | "insufficient_evidence" | "rejected") => (canTransition("admin", c.status, to) ? undefined : "Indisponível neste estado da reivindicação.");
  return [
    { to: "approved", allowed: !wrong("approved") && !missing, reason: wrong("approved") ?? missing ?? undefined },
    { to: "insufficient_evidence", allowed: !wrong("insufficient_evidence"), reason: wrong("insufficient_evidence") },
    { to: "rejected", allowed: !wrong("rejected"), reason: wrong("rejected") },
  ];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireAccess("/admin/reivindicacoes");
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await getSessionActor();
  let claim: AdminClaimView | null = null;
  let failed = false;
  try {
    claim = actor ? await getClaimForAdmin(actor, id.data) : null;
  } catch (error) {
    console.error("reivindicação (admin)", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  if (!failed && !claim) notFound();
  return (
    <AdminShell active="/admin/reivindicacoes" email={user.email} breadcrumb="Admin / Reivindicações / Detalhe" title="Reivindicação" actions={<Link href="/admin/reivindicacoes" className="text-[14px] font-extrabold underline">Voltar à fila</Link>}>
      {failed || !claim ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Não foi possível carregar. <Link href={`/admin/reivindicacoes/${id.data}`} className="underline">Tentar de novo</Link>
        </p>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
          <section className="flex flex-col gap-5 rounded-[24px] bg-white p-6">
            <div className="flex flex-wrap items-center gap-2">
              <ClaimStatusBadge status={claim.status} />
              <span className="bg-campo text-texto-2 rounded-botao px-2.5 py-1 text-[11px] font-extrabold">{claim.school.verificationStatus === "verified" ? "Escola com admin" : "Escola sem admin"}</span>
              {claim.isDemo ? <DemoBadge /> : null}
            </div>
            <h2 className="text-[22px] font-extrabold"><Link href={`/escolas/${claim.school.inep}`} className="hover:underline">{claim.school.name}</Link></h2>
            <dl className="grid gap-2 text-[14px] sm:grid-cols-2">
              <Row k="INEP" v={claim.school.inep} />
              <Row k="Reivindicante" v={`${claim.claimantName} · ${claim.claimantRoleTitle}`} />
              <Row k="E-mail da conta" v={claim.contactEmail} />
              <Row k="Enviada em" v={formatDate(claim.submittedAt ?? claim.createdAt)} />
              <Row k="Método" v={METHOD_LABEL[claim.method]} />
              <Row k="Canal" v={channelLine(claim)} />
            </dl>
            <div>
              <h3 className="text-[15px] font-extrabold">Evidência escrita ({(claim.evidenceNote ?? "").length}/500)</h3>
              <p className="bg-papel rounded-campo mt-1.5 px-4 py-3 text-[14px] font-semibold">{claim.evidenceNote ?? "Sem evidência escrita."}</p>
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold">Arquivos ({claim.evidence.length})</h3>
              {claim.evidence.length === 0 ? <p className="text-texto-3 mt-1 text-[13px] font-semibold">Nenhum arquivo.</p> : (
                <ul className="mt-1.5 flex flex-col gap-2">
                  {claim.evidence.map((e) => (
                    <li key={e.id} className="bg-campo rounded-campo flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] font-bold">
                      <span className="truncate">{e.originalName} <span className="text-texto-3 text-[12px]">· {formatBytes(e.sizeBytes)}</span></span>
                      <a href={`/admin/reivindicacoes/evidencia/${e.id}`} target="_blank" rel="noopener noreferrer" className="text-verde-fundo shrink-0 font-extrabold">Abrir (link de 60 s)</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {claim.decisionReason ? <p className="bg-campo rounded-campo px-4 py-3 text-[14px] font-semibold">Motivo registrado: {claim.decisionReason}</p> : null}
            <ClaimTimeline events={claim.events} status={claim.status} />
          </section>
          <aside className="flex flex-col gap-3">
            <h2 className="text-[17px] font-extrabold">Decisão</h2>
            <DecisionForm claimId={claim.id} options={decisionOptions(claim)} action={decideClaimAction} />
          </aside>
        </div>
      )}
    </AdminShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-texto-3 text-[12px] font-extrabold tracking-[0.06em] uppercase">{k}</dt>
      <dd className="font-bold break-words">{v}</dd>
    </div>
  );
}
