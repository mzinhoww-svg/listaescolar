import type { Metadata } from "next";
import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { Notice } from "@/components/stationeries/PanelShell";
import { getSessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { resolveDisputeAction } from "@/features/conversion/actions";
import { errorMessageForCode } from "@/features/conversion/messages";
import type { AdminDisputeView, DisputeView } from "@/features/conversion/ports";
import { getConversionService } from "@/features/conversion/wiring";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contestações · Admin · ListaCerta", robots: { index: false, follow: false } };

const REASON_LABEL: Record<DisputeView["reason"], string> = {
  wrong_number: "Número errado",
  incomplete_list: "Lista incompleta",
  duplicate: "Pedido duplicado",
  out_of_area: "Fora da área de entrega",
};

const LEAD_STATUS_LABEL: Record<string, string> = {
  received: "recebido",
  viewed: "visto",
  in_progress: "em atendimento",
  quote_sent: "orçamento enviado",
  awaiting_customer: "aguardando cliente",
  converted: "vendido (Vendi)",
  declined: "não fechou",
  expired: "expirado",
  cancelled: "cancelado",
};

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }).format(d);
}

/** Resumo dos 3 sinais antes de decidir (revisão de segurança): status do lead + papelaria/pai/Pix. */
function signalsSummary(d: AdminDisputeView): string {
  const parts = [d.signals.stationeryConfirmed ? "papelaria" : null, d.signals.parentConfirmed ? "responsável" : null].filter(Boolean);
  return `Status do pedido: ${LEAD_STATUS_LABEL[d.leadStatus] ?? d.leadStatus}. Sinais confirmados: ${parts.length > 0 ? parts.join(" + ") : "nenhum"} (${d.signals.signalCount}/3; Pix pela plataforma indisponível nesta fase).`;
}

const btn = "bg-tinta text-papel rounded-botao h-10 px-4 text-[13px] font-extrabold";
const btnOutline = "border-tinta text-tinta rounded-botao h-10 border-[1.5px] px-4 text-[13px] font-extrabold";

/** Admin12: fila de contestações abertas (com prazo) e histórico das resolvidas. */
export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string | string[]; ok?: string | string[] }> }) {
  const { user } = await requireAccess("/admin");
  const sp = await searchParams;
  const erro = errorMessageForCode(one(sp.erro));
  let open: AdminDisputeView[] = [];
  let resolved: AdminDisputeView[] = [];
  let failed = false;
  try {
    const actor = await getSessionActor();
    if (actor) {
      const svc = getConversionService();
      [open, resolved] = await Promise.all([svc.listOpenDisputesForAdmin(actor), svc.listResolvedDisputesForAdmin(actor, 30)]);
    }
  } catch (error) {
    console.error("listar contestações", error instanceof Error ? error.message : "erro");
    failed = true;
  }
  return (
    <AdminShell active="/admin/contestacoes" email={user.email} breadcrumb="Admin / Contestações" title="Contestações">
      {one(sp.ok) ? <Notice kind="ok">Registrado.</Notice> : null}
      {erro ? <Notice kind="error">{erro}</Notice> : null}
      {failed ? (
        <Notice kind="error">
          Não foi possível carregar. <Link href="/admin/contestacoes" className="underline">Tentar de novo</Link>
        </Notice>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-[18px] font-extrabold">Abertas ({open.length})</h2>
            {open.length === 0 ? (
              <p className="text-texto-2 text-[14px] font-semibold">Nenhuma contestação aberta.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {open.map((d) => (
                  <li key={d.id} className="rounded-card flex flex-wrap items-center justify-between gap-3 bg-white p-4">
                    <div>
                      <p className="text-[14px] font-extrabold">Pedido {d.leadCode} · {REASON_LABEL[d.reason]}</p>
                      <p className="text-texto-3 text-[13px] font-semibold">Prazo do pai/papelaria: até {formatWhen(d.deadlineAt)}{d.detail ? ` · ${d.detail}` : ""}</p>
                      <p className="text-texto-3 text-[13px] font-semibold">{signalsSummary(d)}</p>
                    </div>
                    <div className="flex gap-2">
                      <form action={resolveDisputeAction}>
                        <input type="hidden" name="disputeId" value={d.id} />
                        <input type="hidden" name="decision" value="accepted" />
                        <button type="submit" className={btn}>Aceitar (devolve o crédito, se houver)</button>
                      </form>
                      <form action={resolveDisputeAction}>
                        <input type="hidden" name="disputeId" value={d.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <button type="submit" className={btnOutline}>Rejeitar</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-[18px] font-extrabold">Resolvidas recentemente</h2>
            {resolved.length === 0 ? (
              <p className="text-texto-2 text-[14px] font-semibold">Nenhuma ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {resolved.map((d) => (
                  <li key={d.id} className="bg-campo rounded-campo flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] font-semibold">
                    <span>Pedido {d.leadCode} · {REASON_LABEL[d.reason]}</span>
                    <span className="font-extrabold">
                      {d.status === "accepted" ? (d.reversedEntryId ? "Aceita, crédito devolvido" : "Aceita, sem crédito a devolver") : "Rejeitada"}
                      {d.resolvedAt ? ` · ${formatWhen(d.resolvedAt)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}
