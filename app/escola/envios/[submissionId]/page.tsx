import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { SchoolPanelShell } from "@/components/claims/SchoolPanelShell";
import { requireAccess } from "@/features/auth/guard";
import { getSubmissionStatus } from "@/features/submissions/status";
import { siteBase } from "@/lib/site-base";
import { createClient } from "@/lib/supabase/server";

import { SchoolStatusPanel } from "./SchoolStatusPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Andamento do envio · ListaCerta" };

/**
 * Andamento do envio da escola, dentro do painel da escola (UX-090). Sem `loading.tsx` acima: a rota chama `notFound()`
 * e um carregando por cima a transformaria em 200 (D-043). Inexistente ou de outra pessoa: mesma resposta 404.
 */
export default async function Page({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const { user } = await requireAccess("/escola");
  if (!z.uuid().safeParse(submissionId).success) notFound();
  const initial = await getSubmissionStatus(await createClient(), submissionId);
  if (!initial) notFound();
  if (initial.source === "parent") redirect(`/enviar-lista/${submissionId}`);
  return (
    <SchoolPanelShell email={user.email} active="listas" crumb="Painel / Enviar lista / Andamento" title="Andamento do envio" back={{ href: "/escola", label: "Minhas escolas" }}>
      <SchoolStatusPanel submissionId={submissionId} initial={initial} origin={siteBase() ?? ""} />
    </SchoolPanelShell>
  );
}
