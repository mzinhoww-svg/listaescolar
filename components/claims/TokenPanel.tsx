"use client";

import type { ClaimActionState } from "@/features/claims/form-state";
import type { ClaimMethod } from "@/features/claims/state";

import { ActionForm } from "./ActionForm";

type Act = (prev: ClaimActionState, formData: FormData) => Promise<ClaimActionState>;
type Props = {
  inep: string;
  claimId: string;
  method: Exclude<ClaimMethod, "documents">;
  /** Já houve emissão (o estado saiu de `submitted`): o botão vira "reenviar". */
  issued: boolean;
  confirmed: boolean;
  request: Act;
  confirm: Act;
};

/** E-mail: enviar/reenviar o link. WhatsApp: enviar código e campo de 6 dígitos. Nunca mostra o contato da escola. */
export function TokenPanel({ inep, claimId, method, issued, confirmed, request, confirm }: Props) {
  const email = method === "institutional_email";
  return (
    <div className="flex flex-col gap-5">
      {confirmed ? (
        <p role="status" className="bg-verde-certo/20 text-verde-fundo rounded-campo px-3 py-2.5 text-[13px] font-bold">
          Canal confirmado. A equipe ListaCerta segue com a análise.
        </p>
      ) : (
        <>
          <ActionForm
            action={request}
            variant={issued ? "outline" : "primary"}
            submitLabel={
              email
                ? issued ? "Reenviar link" : "Enviar link para o e-mail da escola registrado no INEP"
                : issued ? "Reenviar código" : "Enviar código para o WhatsApp da escola registrado no INEP"
            }
            pendingLabel="Enviando..."
          >
            <input type="hidden" name="inep" value={inep} />
            <input type="hidden" name="claimId" value={claimId} />
          </ActionForm>
          {email ? (
            issued ? <p className="text-texto-2 text-[13px] font-semibold">Abra o link enviado ao e-mail da escola, com esta mesma conta, e confirme.</p> : null
          ) : (
            <ActionForm action={confirm} submitLabel="Confirmar código" pendingLabel="Confirmando...">
              <input type="hidden" name="inep" value={inep} />
              <input type="hidden" name="claimId" value={claimId} />
              <input type="hidden" name="channel" value="whatsapp" />
              <label className="flex flex-col gap-1.5 text-[14px] font-bold">
                Código de 6 dígitos
                <input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" className="bg-campo rounded-campo h-12 px-4 text-[18px] font-extrabold tracking-[0.3em]" />
              </label>
            </ActionForm>
          )}
        </>
      )}
    </div>
  );
}
