import { revokeConsentAction } from "@/app/conta/privacidade/actions";
import { REVOCABLE_CONSENT_PURPOSES } from "@/features/privacy/queries";
import type { MyConsent } from "@/features/privacy/queries";

const PURPOSE_LABEL: Record<string, string> = {
  list_upload: "Envio de lista escolar",
  billing_terms: "Termos de cobrança",
  b2b_api_terms: "Termos do portal B2B",
};

/** Efeito real de revogar, por finalidade (Revisão de segurança/privacidade, S17: nunca afirmar um efeito que a
 * revogação não tem — cada envio grava seu próprio consentimento; revogar um não desfaz nem bloqueia envios). */
const REVOKE_EFFECT_NOTE: Record<string, string> = {
  list_upload: "Revogar não desfaz o envio já feito nem impede novos envios: cada envio novo grava seu próprio consentimento.",
};

const revocable = (purpose: string): boolean => (REVOCABLE_CONSENT_PURPOSES as readonly string[]).includes(purpose);

/** "Meus consentimentos" (Server Component; revogar é uma ação de servidor simples, sem JS de cliente). */
export function ConsentsList({ consents }: { consents: MyConsent[] }) {
  if (consents.length === 0) {
    return <p className="text-texto-2 text-[13px] font-semibold">Nenhum consentimento registrado ainda.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {consents.map((c) => (
        <li key={c.id} className="bg-branco-tonal flex flex-col gap-1 rounded-[20px] p-4">
          <p className="text-[14px] font-extrabold">{PURPOSE_LABEL[c.purpose] ?? c.purpose}</p>
          <p className="text-texto-2 text-[12px] font-semibold">
            Concedido em {new Date(c.granted_at).toLocaleDateString("pt-BR")} · versão {c.text_version}
          </p>
          {c.revoked_at ? (
            <p className="text-texto-2 text-[12px] font-bold">Revogado em {new Date(c.revoked_at).toLocaleDateString("pt-BR")}</p>
          ) : revocable(c.purpose) ? (
            <>
              <p className="text-texto-3 text-[11px] font-semibold">{REVOKE_EFFECT_NOTE[c.purpose]}</p>
              <form action={revokeConsentAction}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="text-erro-texto text-[12px] font-extrabold underline">
                  Revogar
                </button>
              </form>
            </>
          ) : (
            <p className="text-texto-3 text-[11px] font-semibold">Aceite contratual: para revogar, encerre o contrato correspondente.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
