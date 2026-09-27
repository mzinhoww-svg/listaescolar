import { revokeConsentAction } from "@/app/conta/privacidade/actions";
import type { MyConsent } from "@/features/privacy/queries";

const PURPOSE_LABEL: Record<string, string> = {
  list_upload: "Envio de lista escolar",
  lead_whatsapp: "Pedido de cotação por WhatsApp",
  billing_terms: "Termos de cobrança",
  b2b_api_terms: "Termos do portal B2B",
};

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
          ) : (
            <form action={revokeConsentAction}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="text-erro-texto text-[12px] font-extrabold underline">
                Revogar
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
