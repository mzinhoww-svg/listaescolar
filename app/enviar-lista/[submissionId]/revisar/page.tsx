import { notFound } from "next/navigation";
import { z } from "zod";

import { EmptyState } from "@/components/cart/CartStates";
import { ParentCopyEditor } from "@/components/review/ParentCopyEditor";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { buildParentCopyService } from "@/features/review/deps";
import type { ParentCopyView } from "@/features/review/parent-copy";

import { saveParentCopyAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisar meus itens · ListaCerta" };

/** Revisão da PRÓPRIA lista do pai (App15). Qualquer caso sem acesso (outro dono, envio de escola, admin, sem resultado, id inválido) é o mesmo 404. */
export default async function Page({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  await requireAccess("/enviar-lista");
  if (!z.uuid().safeParse(submissionId).success) notFound();
  const actor = await getSessionActor();
  if (!actor || actor.role !== "parent") notFound();
  let copy: ParentCopyView | null;
  try {
    copy = await buildParentCopyService().open(actor, submissionId);
  } catch (error) {
    console.error("cópia do pai", error instanceof Error ? error.name : "erro");
    return <EmptyState title="Não foi possível abrir sua lista" text="Tente de novo em instantes." />;
  }
  if (!copy) notFound();
  return <ParentCopyEditor copyId={copy.copyId} submissionId={submissionId} initialVersion={copy.version} initialItems={copy.items} grade={copy.grade} schoolYear={copy.schoolYear} action={saveParentCopyAction} />;
}
