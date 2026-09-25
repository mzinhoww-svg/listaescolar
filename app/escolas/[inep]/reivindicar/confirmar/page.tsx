import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ClaimLayout } from "@/components/claims/ClaimLayout";
import { ConfirmEmailPanel } from "@/components/claims/ConfirmEmailPanel";
import { SchoolSummaryCard } from "@/components/claims/SchoolSummaryCard";
import { getSessionActor } from "@/features/auth/actor";
import { loginPath } from "@/features/claims/action-support";
import { ROLE_BLOCK_MESSAGE } from "@/features/claims/messages";
import { getSchoolClaimContext } from "@/features/claims/queries";
import { emailTokenSchema } from "@/features/claims/schemas";

import { confirmTokenAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirmar e-mail da escola · ListaCerta", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ inep: string }>; searchParams: Promise<{ token?: string | string[] }> };

/** O GET nunca consome o token (scanners de e-mail): só mostra a escola e o botão. Quem confirma é a Server Action. */
export default async function ConfirmPage({ params, searchParams }: Props) {
  const { inep } = await params;
  const context = await getSchoolClaimContext(inep);
  if (!context) notFound();
  const raw = (await searchParams).token;
  const token = emailTokenSchema.safeParse(Array.isArray(raw) ? raw[0] : raw);
  const actor = await getSessionActor();
  if (!actor) redirect(token.success ? `/entrar?next=${encodeURIComponent(`/escolas/${inep}/reivindicar/confirmar?token=${token.data}`)}` : loginPath(inep));
  const crumb = `Escola / ${context.school.name} / Confirmar e-mail`;
  const blocked = actor.role !== "parent" && actor.role !== "school_member";
  return (
    <ClaimLayout inep={inep} title="Confirmar e-mail da escola" crumb={crumb}>
      <SchoolSummaryCard school={context.school} />
      {blocked ? (
        <p role="alert" className="bg-aviso-fundo text-aviso-texto rounded-campo px-4 py-3 text-[14px] font-bold">{ROLE_BLOCK_MESSAGE}</p>
      ) : !token.success ? (
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">Link inválido. Peça um novo na página da reivindicação.</p>
      ) : (
        <>
          <p className="text-texto-2 text-[15px] leading-[1.4] font-medium">Confirme que você recebeu este link no e-mail da escola registrado no INEP. Use a mesma conta que fez o pedido.</p>
          <ConfirmEmailPanel inep={inep} token={token.data} confirm={confirmTokenAction} />
        </>
      )}
      <Link href={`/escolas/${inep}/reivindicar`} className="text-verde-fundo text-[14px] font-extrabold">Ver status da reivindicação</Link>
    </ClaimLayout>
  );
}
