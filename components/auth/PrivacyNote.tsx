import Link from "next/link";

const LINK =
  "text-tinta hover:text-verde-fundo focus-visible:outline-verde-fundo inline-flex min-h-11 items-center px-1 text-[14px] font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2";

/** Aceite dos Termos e da Política. A nota do Google fica junto do botão do Google (`GoogleButton`). */
export function PrivacyNote() {
  return (
    <div className="flex flex-col items-center">
      <p className="text-texto-2 text-[14px] leading-[1.4] font-medium">Ao entrar, você aceita:</p>
      <div className="flex flex-wrap justify-center gap-x-4">
        <Link href="/termos" className={LINK}>
          Termos
        </Link>
        <Link href="/privacidade" className={LINK}>
          Política de Privacidade
        </Link>
      </div>
    </div>
  );
}
