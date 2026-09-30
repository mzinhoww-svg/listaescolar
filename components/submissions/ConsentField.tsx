import { CONSENT_LABEL, CONSENT_RETENTION_NOTE, FORM_ERROR_ID } from "@/features/submissions/copy";

/**
 * Consentimento explícito: caixa desmarcada por padrão; o servidor e o banco exigem de novo. Com `error`, a
 * mensagem fica junto da caixa (UX-064); `invalid` sozinho (formulário da escola) aponta para o erro geral.
 */
export function ConsentField({ invalid, error }: { invalid?: boolean; error?: string | undefined }) {
  const bad = invalid === true || error !== undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="bg-campo flex cursor-pointer items-start gap-3 rounded-2xl p-3.5">
        <input
          id="consent"
          type="checkbox"
          name="consent"
          aria-invalid={bad}
          aria-describedby={error !== undefined ? "consent-erro" : bad ? FORM_ERROR_ID : undefined}
          className="accent-verde-fundo focus-visible:outline-verde-fundo mt-0.5 size-6 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <span className="text-texto-2 text-[13px] leading-[1.4] font-semibold">{CONSENT_LABEL}</span>
      </label>
      <p className="text-texto-3 px-1 text-[12px] font-semibold">{CONSENT_RETENTION_NOTE}</p>
      {error !== undefined ? (
        <p id="consent-erro" role="alert" className="text-erro-texto px-1 text-[13px] font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
