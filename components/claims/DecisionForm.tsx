"use client";

import type { DecisionOption } from "@/features/claims/decision";
import type { ClaimActionState } from "@/features/claims/form-state";

import { ActionForm } from "./ActionForm";

type Act = (prev: ClaimActionState, formData: FormData) => Promise<ClaimActionState>;

const LABEL = { approved: "Aprovar", insufficient_evidence: "Pedir mais evidências", rejected: "Recusar" } as const;
const REASON_LABEL = { insufficient_evidence: "Motivo para pedir mais evidências", rejected: "Motivo da recusa" } as const;
const VARIANT = { approved: "primary", insufficient_evidence: "outline", rejected: "danger" } as const;

/** Decisão humana. Aprovar não pede motivo; as outras exigem motivo de 3 a 500 caracteres. Desabilitada mostra o porquê. */
export function DecisionForm({ claimId, options, action }: { claimId: string; options: DecisionOption[]; action: Act }) {
  return (
    <div className="flex flex-col gap-4">
      {options.map((o) => (
        <ActionForm
          key={o.to}
          action={action}
          submitLabel={LABEL[o.to]}
          pendingLabel="Registrando..."
          variant={VARIANT[o.to]}
          disabled={!o.allowed}
          disabledReason={o.reason}
          className="flex flex-col gap-2.5 rounded-[20px] bg-white p-4"
        >
          <input type="hidden" name="claimId" value={claimId} />
          <input type="hidden" name="to" value={o.to} />
          {o.to === "approved" ? null : (
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">
              {REASON_LABEL[o.to]} (3 a 500 caracteres, o reivindicante vê)
              <textarea name="reason" required minLength={3} maxLength={500} rows={3} disabled={!o.allowed} className="bg-campo rounded-campo w-full p-3 text-[14px] font-medium" />
            </label>
          )}
        </ActionForm>
      ))}
    </div>
  );
}
