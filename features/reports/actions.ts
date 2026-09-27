"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionActor } from "@/features/auth/actor";

import { reportErrorCode } from "./messages";
import { createReportSchema, resolveReportSchema } from "./schemas";
import { getReportsService } from "./wiring";

/** Denúncia pública (S16): qualquer autenticado, sobre a lista publicada em exibição (app/escolas/[inep]). */
export async function submitReportAction(next: string, formData: FormData): Promise<void> {
  // `next` pode já ter query string própria (?serie=...&ano=...): o separador do parâmetro de retorno precisa
  // respeitar isso, senão um segundo "?" quebra a leitura de searchParams na página de destino.
  const sep = next.includes("?") ? "&" : "?";
  const actor = await getSessionActor();
  if (!actor) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  const parsed = createReportSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
    detailCode: formData.get("detailCode") || undefined,
  });
  if (!parsed.success) redirect(`${next}${sep}denunciaErro=invalido#denunciar`);
  try {
    const service = await getReportsService();
    await service.submit(actor, parsed.data);
  } catch (error) {
    console.error("denunciar", error instanceof Error ? error.message : "erro");
    redirect(`${next}${sep}denunciaErro=${reportErrorCode(error)}#denunciar`);
  }
  revalidatePath(next);
  redirect(`${next}${sep}denunciaOk=1#denunciar`);
}

/** Resolução do admin: transição de estado + resolução (o gatilho de banco confere a matriz de novo). */
export async function resolveReportAction(formData: FormData): Promise<void> {
  const actor = await getSessionActor();
  if (!actor) redirect("/entrar?next=%2Fadmin%2Fdenuncias");
  const reportId = String(formData.get("reportId") ?? "");
  const back = `/admin/denuncias/${reportId}`;
  const status = formData.get("status");
  // "Colocar em análise" não passa por resolução: ignora o que sobrou do <select>/campo de código na mesma tela.
  const isReviewing = status === "reviewing";
  const parsed = resolveReportSchema.safeParse({
    reportId,
    status,
    resolution: isReviewing ? undefined : formData.get("resolution") || undefined,
    resolutionNote: isReviewing ? undefined : formData.get("resolutionNote") || undefined,
  });
  if (!parsed.success) redirect(`${back}?erro=invalido`);
  try {
    const service = await getReportsService();
    await service.resolve(actor, parsed.data);
  } catch (error) {
    console.error("resolver denúncia", error instanceof Error ? error.message : "erro");
    redirect(`${back}?erro=${reportErrorCode(error)}`);
  }
  revalidatePath("/admin/denuncias");
  revalidatePath(back);
  redirect(`${back}?ok=1`);
}
