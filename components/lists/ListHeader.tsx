import Link from "next/link";

import { BackIcon } from "@/components/schools/icons";
import { demoBadge } from "@/components/lists/badges";

import { formatListDate, itemCountLabel } from "./format";

type Props = {
  schoolName: string;
  inep: string;
  gradeLabel: string;
  year: number;
  isDemo: boolean;
  /** Ausente quando a lista não está publicada. */
  version?: { number: number; publishedAt: string; itemCount: number };
};

const CHIP = "bg-papel/10 rounded-botao px-3.5 py-2 text-[13px] font-bold whitespace-nowrap";

/** Cabeçalho escuro da lista (App05): status, escola, série/ano e chips de versão. */
export function ListHeader({ schoolName, inep, gradeLabel, year, isDemo, version }: Props) {
  return (
    <header className="bg-tinta text-papel rounded-b-[32px] px-6 pt-14 pb-7">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3.5">
        <Link
          href={`/escolas/${inep}`}
          aria-label={`Voltar para o perfil de ${schoolName}`}
          className="bg-papel/10 focus-visible:outline-verde-certo flex size-12 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <BackIcon />
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className={version ? "text-verde-certo text-xs font-bold" : "text-papel/80 text-xs font-bold"}>
            {version ? "Lista publicada" : "Lista não publicada"}
          </span>
          {isDemo ? demoBadge : null}
        </div>
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em]">{schoolName}</h1>
        <p className="text-papel/80 text-sm font-medium">
          {gradeLabel} · Ano letivo {year}
        </p>
        {version ? (
          <ul className="flex flex-wrap gap-2" aria-label="Resumo da lista">
            <li className={CHIP}>{itemCountLabel(version.itemCount)}</li>
            <li className={CHIP}>Versão {version.number}</li>
            <li className={CHIP}>Atualizada {formatListDate(version.publishedAt)}</li>
          </ul>
        ) : null}
      </div>
    </header>
  );
}
