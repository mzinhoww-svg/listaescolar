import { CONSENT_LABEL } from "@/features/submissions/copy";

/** Consentimento explícito: caixa desmarcada por padrão; o servidor e o banco exigem de novo. */
export function ConsentField({ invalid }: { invalid?: boolean }) {
  return (
    <label className="bg-campo flex cursor-pointer items-start gap-3 rounded-2xl p-3.5">
      <input
        type="checkbox"
        name="consent"
        aria-invalid={invalid === true}
        className="accent-verde-fundo mt-0.5 size-5 shrink-0"
      />
      <span className="text-texto-2 text-[13px] leading-[1.4] font-semibold">{CONSENT_LABEL}</span>
    </label>
  );
}
