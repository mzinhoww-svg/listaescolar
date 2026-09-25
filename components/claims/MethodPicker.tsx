import { METHOD_LABEL } from "@/features/claims/messages";
import { CLAIM_METHODS, type ClaimMethod } from "@/features/claims/state";
import type { SchoolClaimContext } from "@/features/claims/types";

const HINT: Record<ClaimMethod, string> = {
  institutional_email: "Enviamos um link ao e-mail registrado no INEP. O endereço não é exibido.",
  institutional_whatsapp: "Enviamos um código de 6 dígitos ao celular registrado no INEP. O número não é exibido.",
  documents: "Envie documentos que mostrem seu vínculo com a escola. A equipe ListaCerta revisa.",
};

/** As três opções de método. Indisponível vem desabilitada com o motivo (sem revelar o contato). */
export function MethodPicker({ methods, error }: { methods: SchoolClaimContext["methods"]; error?: string }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1 text-[15px] font-extrabold">Como confirmar seu vínculo</legend>
      {CLAIM_METHODS.map((m) => {
        const a = methods[m];
        return (
          <label
            key={m}
            className={`rounded-campo flex items-start gap-3 border-[1.5px] p-3.5 ${a.available ? "border-linha bg-white" : "border-linha bg-campo text-texto-3"}`}
          >
            <input type="radio" name="method" value={m} required disabled={!a.available} defaultChecked={m === "documents"} className="accent-tinta mt-1 size-4" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-extrabold">{METHOD_LABEL[m]}</span>
              <span className="text-[13px] font-medium">{a.available ? HINT[m] : `Indisponível: ${a.reason}`}</span>
            </span>
          </label>
        );
      })}
      {error ? <p role="alert" className="text-erro-texto text-[13px] font-bold">{error}</p> : null}
    </fieldset>
  );
}
