"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { GRADES, STAGE_LABEL, findGrade, type GradeStage } from "@/features/grades/catalog";

type Props = {
  inep: string;
  serie: string | null;
  ano: number | null;
  years: readonly number[];
  /** Lista publicada para a série/ano da URL (dado real do servidor); null = não publicada. */
  published?: { versionNumber: number; itemCount: number } | null;
};

const STAGES: GradeStage[] = ["ei", "ef", "em"];
const FIELD =
  "border-tinta focus-visible:outline-verde-fundo h-12 w-full rounded-campo border-[1.5px] bg-white px-3 text-[15px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Seletor de série e ano letivo. A seleção vive na query string (`?serie=ef-4&ano=2027`) e, com JS,
 * `router.replace` pede ao servidor o estado real da lista (S05). Sem JS, o `<form method="get">` recarrega a página.
 */
export function GradeYearPicker({ inep, serie, ano, years, published = null }: Props) {
  const router = useRouter();
  const [grade, setGrade] = useState(serie ?? "");
  const [year, setYear] = useState(String(ano ?? years[0]));

  function sync(nextGrade: string, nextYear: string) {
    const p = new URLSearchParams();
    if (nextGrade) p.set("serie", nextGrade);
    p.set("ano", nextYear);
    startTransition(() => router.replace(`?${p.toString()}`, { scroll: false }));
  }

  const selected = findGrade(grade);
  return (
    <section aria-labelledby="lista" className="flex flex-col gap-3">
      <h2 id="lista" className="text-base font-extrabold">
        Lista de material
      </h2>
      <form method="get" action={`/escolas/${inep}`} className="flex flex-col gap-2.5">
        <div className="flex gap-2.5">
          <div className="flex min-w-0 grow flex-col gap-1">
            <label htmlFor="serie" className="text-texto-3 text-xs font-semibold">
              Série
            </label>
            <select
              id="serie"
              name="serie"
              value={grade}
              className={FIELD}
              onChange={(e) => {
                setGrade(e.target.value);
                sync(e.target.value, year);
              }}
            >
              <option value="">Escolha a série</option>
              {STAGES.map((stage) => (
                <optgroup key={stage} label={STAGE_LABEL[stage]}>
                  {GRADES.filter((g) => g.stage === stage).map((g) => (
                    <option key={g.slug} value={g.slug}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex w-28 shrink-0 flex-col gap-1">
            <label htmlFor="ano" className="text-texto-3 text-xs font-semibold">
              Ano letivo
            </label>
            <select
              id="ano"
              name="ano"
              value={year}
              className={FIELD}
              onChange={(e) => {
                setYear(e.target.value);
                sync(grade, e.target.value);
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <noscript>
          <button type="submit" className="bg-tinta text-papel rounded-botao h-12 w-full text-base font-extrabold">
            Ver lista
          </button>
        </noscript>
      </form>
      <div className="rounded-[22px] bg-white p-4" role="status">
        {selected && published ? (
          <>
            <p className="text-[15px] font-extrabold">{`${selected.label} · ${year}: lista publicada`}</p>
            <p className="text-texto-2 mt-1 text-[13px] leading-[1.4] font-medium">
              {`Versão ${published.versionNumber} · ${published.itemCount === 1 ? "1 item" : `${published.itemCount} itens`}`}
            </p>
            <Link
              href={`/escolas/${inep}/${selected.slug}?ano=${year}`}
              className="bg-tinta text-papel rounded-botao mt-3 flex h-12 w-full items-center justify-center text-base font-extrabold"
            >
              Ver lista
            </Link>
          </>
        ) : (
          <>
            <p className="text-[15px] font-extrabold">
              {selected ? `${selected.label} · ${year}: lista não publicada` : "Escolha a série para ver a lista"}
            </p>
            <p className="text-texto-2 mt-1 text-[13px] leading-[1.4] font-medium">
              {selected
                ? "Ainda não há lista publicada para esta escola, série e ano. Quando houver, ela aparece aqui."
                : "Nenhuma lista publicada está disponível para esta escola no momento."}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
