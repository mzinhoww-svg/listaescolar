import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminShell } from "@/components/admin/AdminShell";
import { CountCard } from "@/components/admin/CountCard";
import { DemoBadge } from "@/components/admin/DemoBadge";
import { StatusChip } from "@/components/admin/StatusChip";
import { requireAccess } from "@/features/auth/guard";
import { describeError } from "@/features/schools/error-report";
import { countWarningRows, getBatch, getErrorRows } from "@/features/schools/queries";

export const dynamic = "force-dynamic";
const PREVIEW = 50;

export default async function Page({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const { user } = await requireAccess(`/admin/importacoes/${batchId}`);
  const id = z.string().uuid().safeParse(batchId);
  if (!id.success) notFound();
  const batch = await getBatch(id.data);
  if (!batch) notFound();
  const [errors, warnings] = await Promise.all([getErrorRows(id.data), countWarningRows(id.data)]);
  const t = batch.totals;
  return (
    <AdminShell
      active="/admin/importacoes"
      email={user.email}
      breadcrumb="Admin / Importações / Lote"
      title="Detalhe do lote"
    >
      <div className="flex items-center gap-3">
        <StatusChip status={batch.status} />
        {batch.isDemo ? <DemoBadge /> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <CountCard label="Total" value={t.total} />
        <CountCard label="Inseridas" value={t.inserted} />
        <CountCard label="Atualizadas" value={t.updated} />
        <CountCard label="Sem alteração" value={t.unchanged} />
        <CountCard label="Duplicadas" value={t.duplicate} />
        <CountCard label="Rejeitadas" value={t.rejected} />
        <CountCard label="Linhas com aviso" value={warnings} hint="Município alterado ou mantido" />
      </div>
      <section className="rounded-card bg-branco-tonal flex flex-col gap-3 px-6 py-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Linhas com problema ({errors.length})</h2>
          {errors.length > 0 ? (
            <a href={`/admin/importacoes/${id.data}/erros.csv`} className="text-verde-fundo font-extrabold underline">
              Baixar erros
            </a>
          ) : null}
        </div>
        {errors.length === 0 ? (
          <p className="text-texto-2 text-[15px]">Nenhuma linha com erro neste lote.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-[15px]">
            {errors.slice(0, PREVIEW).map((r) => (
              <li key={r.rowNumber}>
                <strong>Linha {r.rowNumber}</strong> · {r.action === "rejected" ? "Rejeitada" : "Duplicada"} ·{" "}
                {r.errors.map(describeError).join(" ") || "sem detalhe"}
              </li>
            ))}
          </ul>
        )}
        {errors.length > PREVIEW ? (
          <p className="text-texto-3 text-[13px]">Mostrando {PREVIEW} de {errors.length}. O CSV traz todas.</p>
        ) : null}
      </section>
    </AdminShell>
  );
}
