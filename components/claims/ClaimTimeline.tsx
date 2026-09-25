import { formatDateTime } from "@/features/claims/format";
import { STATUS_LABEL } from "@/features/claims/messages";
import { OPEN_CLAIM_STATUSES, type ClaimStatus } from "@/features/claims/state";
import type { ClaimEventView } from "@/features/claims/types";

const ACTOR: Record<ClaimEventView["actorKind"], string> = { claimant: "Você", admin: "Equipe ListaCerta", system: "Sistema" };

/** Linha do tempo com as datas reais dos eventos (Escola02, adaptada). O último passo aberto aparece como "a seguir". */
export function ClaimTimeline({ events, status }: { events: ClaimEventView[]; status: ClaimStatus }) {
  const open = OPEN_CLAIM_STATUSES.includes(status);
  return (
    <ol aria-label="Linha do tempo" className="flex flex-col gap-4">
      {events.map((e, i) => (
        <li key={`${e.createdAt}-${i}`} className="flex items-start gap-3">
          <span aria-hidden="true" className="bg-tinta text-papel mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-xs font-extrabold">
            ✓
          </span>
          <div>
            <p className="text-[15px] leading-tight font-extrabold">{STATUS_LABEL[e.toStatus]}</p>
            <p className="text-texto-3 text-[13px] font-semibold">
              {formatDateTime(e.createdAt)} · {ACTOR[e.actorKind]}
            </p>
            {e.reason ? <p className="text-texto-2 mt-1 text-[13px] font-medium">Motivo: {e.reason}</p> : null}
          </div>
        </li>
      ))}
      {open ? (
        <li className="flex items-start gap-3">
          <span aria-hidden="true" className="border-linha mt-0.5 size-6 shrink-0 rounded-full border-2" />
          <div>
            <p className="text-texto-3 text-[15px] leading-tight font-extrabold">Decisão da equipe ListaCerta</p>
            <p className="text-texto-3 text-[13px] font-semibold">Verificada ou recusada, sempre por uma pessoa</p>
          </div>
        </li>
      ) : null}
    </ol>
  );
}
