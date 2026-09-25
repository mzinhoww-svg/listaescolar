import { z } from "zod";

import { getCurrentRole, getCurrentUser } from "@/features/auth/queries";
import { buildErrorReportCsv, safeReportFileName } from "@/features/schools/error-report";
import { getBatch, getErrorRows } from "@/features/schools/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  if (!(await getCurrentUser())) return new Response("Não autenticado", { status: 401 });
  if ((await getCurrentRole()) !== "admin") return new Response("Acesso negado", { status: 403 });
  const { batchId } = await ctx.params;
  const id = z.string().uuid().safeParse(batchId);
  if (!id.success) return new Response("Lote inválido", { status: 404 });
  const batch = await getBatch(id.data);
  if (!batch) return new Response("Lote não encontrado", { status: 404 });
  const csv = buildErrorReportCsv(await getErrorRows(id.data), batch.fileErrors);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeReportFileName(id.data)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
