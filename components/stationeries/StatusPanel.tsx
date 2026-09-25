import { STATUS_LABEL } from "@/features/stationeries/messages";
import type { AdminRow } from "@/features/stationeries/repository";
import type { StatusEvent } from "@/features/stationeries/queries";
import type { StationeryStatus } from "@/features/stationeries/state";
import { canSubmitForReview } from "@/features/stationeries/submit-rules";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" });
export const formatDateTime = (d: Date): string => dateFmt.format(d);

const NEXT_STEP: Record<StationeryStatus, string> = {
  signup: "Seu cadastro foi iniciado. Envie para a análise para seguir.",
  accreditation: "Cadastro completo. Envie para a análise da equipe.",
  under_review: "A equipe está analisando o cadastro. Você será liberada ou liberado para publicar quando for aprovado. Cadastro não é verificação.",
  approved: "Aprovado. Abra o painel para publicar sua papelaria e cadastrar o catálogo.",
  active: "Sua papelaria está publicada. Gerencie pelo painel.",
  paused: "Sua papelaria está pausada e não aparece para os pais. Reative pelo painel.",
  suspended: "A papelaria foi suspensa pela equipe e não aparece para os pais. Veja o motivo abaixo.",
  rejected: "O cadastro foi recusado. Veja o motivo abaixo; você pode reenviar para nova análise.",
};

const TIMELINE: readonly StationeryStatus[] = ["signup", "accreditation", "under_review", "approved", "active"];

type Props = {
  stationery: AdminRow;
  events: StatusEvent[];
  resubmit?: () => Promise<void>;
  submitError?: boolean;
};

/** Estado do credenciamento com próximos passos e histórico. O dono ainda é `parent` até a aprovação. */
export function StatusPanel({ stationery, events, resubmit, submitError }: Props) {
  const { status } = stationery;
  const idx = TIMELINE.indexOf(status);
  const showReason = (status === "rejected" || status === "suspended") && stationery.statusReason;
  return (
    <section aria-labelledby="cred-titulo" className="flex flex-col gap-5 rounded-card bg-white p-6">
      <div>
        <p className="text-texto-3 text-[13px] font-semibold">{stationery.tradeName}</p>
        <h2 id="cred-titulo" className="text-[22px] font-extrabold tracking-[-0.02em]">
          Credenciamento: <span data-testid="status-label">{STATUS_LABEL[status]}</span>
        </h2>
      </div>
      {idx >= 0 ? (
        <ol className="flex flex-wrap gap-2" aria-label="Etapas">
          {TIMELINE.map((s, i) => (
            <li
              key={s}
              aria-current={i === idx ? "step" : undefined}
              className={`rounded-botao px-3.5 py-1.5 text-[13px] font-extrabold ${i < idx ? "bg-verde-certo" : i === idx ? "bg-tinta text-papel" : "bg-campo text-texto-3"}`}
            >
              {STATUS_LABEL[s]}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="text-texto-2 text-[15px]">{NEXT_STEP[status]}</p>
      {showReason ? (
        <p className="rounded-campo bg-[#fde2e0] px-4 py-3 text-[14px] font-bold text-[#8a1c14]">Motivo informado pela equipe: {stationery.statusReason}</p>
      ) : null}
      {submitError ? (
        <p role="alert" className="rounded-campo bg-[#fde2e0] px-4 py-3 text-[14px] font-bold text-[#8a1c14]">
          Não foi possível enviar para análise agora. Tente de novo.
        </p>
      ) : null}
      {resubmit && canSubmitForReview(status) ? (
        <form action={resubmit}>
          <button type="submit" className="bg-tinta text-papel h-14 rounded-botao px-8 text-base font-extrabold">
            {status === "rejected" ? "Reenviar para análise" : "Enviar para análise"}
          </button>
        </form>
      ) : null}
      <div>
        <h3 className="mb-2 text-[14px] font-extrabold">Histórico</h3>
        {events.length === 0 ? (
          <p className="text-texto-3 text-[14px]">Sem eventos ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="text-[14px]">
                <span className="font-extrabold">{STATUS_LABEL[e.fromStatus]} → {STATUS_LABEL[e.toStatus]}</span>{" "}
                <span className="text-texto-3">
                  · {formatDateTime(e.createdAt)} · {e.actorRole === "admin" ? "equipe" : e.actorRole === "owner" ? "você" : "sistema"}
                </span>
                {e.reason ? <span className="text-texto-2"> · {e.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
