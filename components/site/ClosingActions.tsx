import Link from "next/link";

import { buttonClass } from "@/components/ui/Button";

type Props = { back?: boolean; className?: string };

/** Fecho de página de leitura: uma ação adiante ("Buscar a escola") e, nas páginas legais, "Voltar ao início". */
export function ClosingActions({ back = true, className = "" }: Props) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <Link href="/escolas" className={buttonClass("primary")}>
        Buscar a escola
      </Link>
      {back ? (
        <Link href="/" className={buttonClass("outline")}>
          Voltar ao início
        </Link>
      ) : null}
    </div>
  );
}
