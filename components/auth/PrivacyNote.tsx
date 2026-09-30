import Link from "next/link";

const LINK =
  "text-tinta hover:text-verde-fundo focus-visible:outline-verde-fundo inline-flex min-h-11 items-center px-1 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2";

/** Aceite dos Termos e da Política. A nota do Google fica junto do botão do Google (`GoogleButton`). */
export function PrivacyNote() {
  return (
    <p className="text-texto-2 text-center text-[14px] leading-[1.4] font-medium">
      Ao entrar, você aceita os{" "}
      <Link href="/termos" className={LINK}>
        Termos
      </Link>{" "}
      e a{" "}
      <Link href="/privacidade" className={LINK}>
        Política de Privacidade
      </Link>
      .
    </p>
  );
}
