"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

import { OpenInBrowserNote } from "./OpenInBrowserNote";

export const RESEND_SECONDS = 30;

type Props = {
  email: string;
  next: string;
  pending: boolean;
  resend: (formData: FormData) => void;
  onChangeEmail: () => void;
};

/**
 * Depois do envio: diz para onde foi o link, o que fazer e libera o reenvio após 30 s. A contagem fica no botão,
 * fora de região viva (o leitor de tela não repete o número); a região viva só anuncia "você já pode reenviar".
 */
export function LinkSent({ email, next, pending, resend, onChangeEmail }: Props) {
  const [left, setLeft] = useState(RESEND_SECONDS);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="flex flex-col gap-3">
        <p id="email-msg" className="text-verde-fundo text-[15px] leading-snug font-semibold">
          Enviamos o link para <strong className="break-all">{email}</strong>. Abra o e-mail neste aparelho e toque no link.
        </p>
        <OpenInBrowserNote />
      </div>
      <p className="text-texto-2 text-[14px] font-medium">Não chegou? Veja a caixa de spam ou peça outro link.</p>
      <form action={resend}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <Button
          type="submit"
          variant="outline"
          className="w-full disabled:border-texto-3 disabled:bg-campo disabled:text-texto-2 disabled:opacity-100"
          disabled={pending || left > 0}
        >
          {pending ? "Enviando…" : left > 0 ? `Reenviar link em ${left} s` : "Reenviar link"}
        </Button>
      </form>
      <p role="status" className="sr-only">
        {left === 0 ? "Você já pode reenviar o link." : ""}
      </p>
      <Button variant="text" onClick={onChangeEmail} className="self-start">
        Trocar e-mail
      </Button>
    </div>
  );
}
