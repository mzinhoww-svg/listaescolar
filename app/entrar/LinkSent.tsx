"use client";

import { useEffect, useState } from "react";

export const RESEND_SECONDS = 30;

type Props = {
  email: string;
  next: string;
  pending: boolean;
  resend: (formData: FormData) => void;
  onChangeEmail: () => void;
};

/** Depois do envio: diz para onde foi o link, o que fazer e libera o reenvio após 30 s. */
export function LinkSent({ email, next, pending, resend, onChangeEmail }: Props) {
  const [left, setLeft] = useState(RESEND_SECONDS);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p id="email-msg" className="text-verde-fundo text-[15px] leading-snug font-semibold">
        Enviamos o link para <strong className="break-all">{email}</strong>. Abra o e-mail neste aparelho e toque no link.
      </p>
      <p className="text-texto-3 text-[13px] font-medium">Não chegou? Veja a caixa de spam ou peça outro link.</p>
      <form action={resend}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={pending || left > 0}
          className="border-tinta text-tinta rounded-botao flex h-[52px] w-full items-center justify-center border-[1.5px] text-base font-extrabold disabled:opacity-60"
        >
          {pending ? "Enviando…" : left > 0 ? `Reenviar link em ${left} s` : "Reenviar link"}
        </button>
      </form>
      <button type="button" onClick={onChangeEmail} className="text-verde-fundo min-h-11 text-[14px] font-extrabold underline">
        Trocar e-mail
      </button>
    </div>
  );
}
