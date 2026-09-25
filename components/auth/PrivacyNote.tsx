import Link from "next/link";
import { ShieldIcon } from "./icons";

export function PrivacyNote() {
  return (
    <>
      <div className="bg-campo rounded-2xl p-3.5">
        <div className="flex items-start gap-2.5">
          <ShieldIcon />
          <p className="text-texto-2 text-[13px] leading-[1.4] font-semibold">
            Usamos só nome e e-mail da sua conta Google. Nada é publicado.
          </p>
        </div>
      </div>
      <p className="text-texto-3 text-center text-xs leading-[1.4] font-medium">
        Ao entrar, você aceita os{" "}
        <Link href="/termos" className="text-tinta hover:text-verde-fundo underline">
          Termos
        </Link>{" "}
        e a{" "}
        <Link href="/privacidade" className="text-tinta hover:text-verde-fundo underline">
          Política de Privacidade
        </Link>
        .
      </p>
    </>
  );
}
