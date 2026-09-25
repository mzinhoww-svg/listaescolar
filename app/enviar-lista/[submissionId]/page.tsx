import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAccess } from "@/features/auth/guard";
import { getSubmissionStatus } from "@/features/submissions/status";
import { createClient } from "@/lib/supabase/server";

import { StatusPanel } from "./StatusPanel";

export const metadata = { title: "Andamento do envio · ListaCerta" };

export default async function Page({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  await requireAccess("/enviar-lista");
  if (!z.uuid().safeParse(submissionId).success) notFound();
  const initial = await getSubmissionStatus(await createClient(), submissionId);
  if (!initial) notFound(); // inexistente ou de outra pessoa: mesma resposta
  return <StatusPanel submissionId={submissionId} initial={initial} />;
}
