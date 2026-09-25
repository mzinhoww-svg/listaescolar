import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ClaimFlow } from "@/components/claims/ClaimFlow";
import { ClaimLayout } from "@/components/claims/ClaimLayout";
import { ClaimStepper } from "@/components/claims/ClaimStepper";
import { CreateClaimForm } from "@/components/claims/CreateClaimForm";
import { SchoolSummaryCard } from "@/components/claims/SchoolSummaryCard";
import { getSessionActor } from "@/features/auth/actor";
import { getCurrentUser } from "@/features/auth/queries";
import { loginPath } from "@/features/claims/action-support";
import { ROLE_BLOCK_MESSAGE } from "@/features/claims/messages";
import { getClaimStatusView, getMyClaimForSchool, getSchoolClaimContext } from "@/features/claims/queries";
import { PRIVACY_TEXT_VERSION } from "@/features/claims/schemas";

import { createClaimAction, removeEvidenceAction, requestTokenAction, submitClaimAction, uploadEvidenceAction } from "./actions";
import { confirmTokenAction } from "./confirmar/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata: Metadata = { title: "Reivindicar escola · ListaCerta", robots: { index: false, follow: false } };

type Props = { params: Promise<{ inep: string }>; searchParams: Promise<{ nova?: string }> };
const STEPS = ["Pedido", "Verificação", "Análise"] as const;
const stepFor = (status: string | null) => (status === null ? 1 : status === "submitted" || status === "token_expired" || status === "insufficient_evidence" ? 2 : 3);

export default async function ClaimPage({ params, searchParams }: Props) {
  const { inep } = await params;
  const context = await getSchoolClaimContext(inep);
  if (!context) notFound();
  const actor = await getSessionActor();
  if (!actor) redirect(loginPath(inep));
  const user = await getCurrentUser();
  const { school } = context;
  const crumb = `Escola / ${school.name} / Reivindicar`;

  if (actor.role !== "parent" && actor.role !== "school_member") {
    return (
      <ClaimLayout inep={inep} title="Reivindicar escola" crumb={crumb}>
        <p role="alert" className="bg-aviso-fundo text-aviso-texto rounded-campo px-4 py-3 text-[14px] font-bold">{ROLE_BLOCK_MESSAGE}</p>
        <Link href={`/escolas/${inep}`} className="text-verde-fundo text-[14px] font-extrabold">Voltar ao perfil da escola</Link>
      </ClaimLayout>
    );
  }

  const mine = await getMyClaimForSchool(actor, inep);
  const view = mine ? await getClaimStatusView(actor, mine.id) : null;
  const restart = (await searchParams).nova === "1" && (view === null || view.status === "rejected");
  const showForm = view === null || restart;

  return (
    <ClaimLayout inep={inep} title={showForm ? "Reivindicar escola" : "Sua reivindicação"} crumb={crumb}>
      <ClaimStepper steps={STEPS} current={showForm ? 1 : stepFor(view?.status ?? null)} />
      <SchoolSummaryCard school={school} />
      {showForm ? (
        context.blockedReason ? (
          <p role="note" className="bg-campo rounded-campo px-4 py-3 text-[14px] font-bold">{context.blockedReason}</p>
        ) : (
          <CreateClaimForm action={createClaimAction} inep={inep} methods={context.methods} accountEmail={user?.email ?? null} privacyVersion={PRIVACY_TEXT_VERSION} />
        )
      ) : view ? (
        <ClaimFlow inep={inep} claim={view} actions={{ upload: uploadEvidenceAction, remove: removeEvidenceAction, submit: submitClaimAction, request: requestTokenAction, confirm: confirmTokenAction }} />
      ) : null}
    </ClaimLayout>
  );
}
