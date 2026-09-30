import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ClaimFlow } from "@/components/claims/ClaimFlow";
import { ClaimLayout } from "@/components/claims/ClaimLayout";
import { buttonClass } from "@/components/ui/Button";
import { ClaimStepper } from "@/components/claims/ClaimStepper";
import { CreateClaimForm } from "@/components/claims/CreateClaimForm";
import { SchoolSummaryCard } from "@/components/claims/SchoolSummaryCard";
import { getSessionActor } from "@/features/auth/actor";
import { getCurrentUser } from "@/features/auth/queries";
import { loginPath } from "@/features/claims/action-support";
import { ROLE_BLOCK_MESSAGE } from "@/features/claims/messages";
import { getClaimStatusView, getMyClaimForSchool, getSchoolClaimContext } from "@/features/claims/queries";
import { claimStep } from "@/features/claims/steps";

import { createClaimAction, removeEvidenceAction, requestTokenAction, submitClaimAction, uploadEvidenceAction } from "./actions";
import { confirmTokenAction } from "./confirmar/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata: Metadata = { title: "Pedir para administrar a escola · ListaCerta", robots: { index: false, follow: false } };

type Props = { params: Promise<{ inep: string }>; searchParams: Promise<{ nova?: string }> };
const STEPS = ["Seus dados", "Comprovação", "Análise"] as const;

export default async function ClaimPage({ params, searchParams }: Props) {
  const { inep } = await params;
  const context = await getSchoolClaimContext(inep);
  if (!context) notFound();
  const actor = await getSessionActor();
  if (!actor) redirect(loginPath(inep));
  const user = await getCurrentUser();
  const { school } = context;
  const crumb = `Escola / ${school.name} / Pedir para administrar`;

  if (actor.role !== "parent" && actor.role !== "school_member") {
    return (
      <ClaimLayout inep={inep} title="Pedir para administrar a escola" crumb={crumb} exit="back">
        <p role="alert" className="bg-aviso-fundo text-aviso-texto rounded-campo px-4 py-3 text-[14px] font-bold">{ROLE_BLOCK_MESSAGE}</p>
        <Link href={`/escolas/${inep}`} className={buttonClass("outline")}>Voltar ao perfil da escola</Link>
      </ClaimLayout>
    );
  }

  const mine = await getMyClaimForSchool(actor, inep);
  const view = mine ? await getClaimStatusView(actor, mine.id) : null;
  const restart = (await searchParams).nova === "1" && (view === null || view.status === "rejected");
  const showForm = view === null || restart;

  return (
    <ClaimLayout inep={inep} title={showForm ? "Pedir para administrar a escola" : "Seu pedido"} crumb={crumb} exit={showForm ? "cancel" : "back"} why={!(showForm && context.blockedReason)}>
      {showForm && context.blockedReason ? null : <ClaimStepper steps={STEPS} current={showForm ? 1 : claimStep(view)} />}
      <SchoolSummaryCard school={school} />
      {showForm ? (
        context.blockedReason ? (
          <div className="flex flex-col items-start gap-3">
            <p role="note" className="bg-campo rounded-campo w-full px-4 py-3 text-[14px] font-bold">{context.blockedReason}</p>
            <p className="text-texto-2 text-[14px] font-medium">Se você trabalha nesta escola, peça acesso a quem já administra a página. Você também pode buscar outra escola.</p>
            <div className="flex flex-wrap gap-3">
              <Link href={`/escolas/${inep}`} className={buttonClass("primary")}>Voltar ao perfil da escola</Link>
              <Link href="/escolas" className={buttonClass("outline")}>Buscar outra escola</Link>
            </div>
          </div>
        ) : (
          <CreateClaimForm action={createClaimAction} inep={inep} methods={context.methods} accountEmail={user?.email ?? null} />
        )
      ) : view ? (
        <ClaimFlow inep={inep} claim={view} actions={{ upload: uploadEvidenceAction, remove: removeEvidenceAction, submit: submitClaimAction, request: requestTokenAction, confirm: confirmTokenAction }} />
      ) : null}
    </ClaimLayout>
  );
}
