import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ItemsTable } from "@/components/lists/ItemsTable";
import { ListHeader } from "@/components/lists/ListHeader";
import { UnpublishedState } from "@/components/lists/UnpublishedState";
import { VersionHistory } from "@/components/lists/VersionHistory";
import { defaultAcademicYear, findGrade, parseGradeSelection } from "@/features/grades/catalog";
import { getPublishedList, listVersionHistory } from "@/features/lists/queries";
import { loadSchool } from "@/features/schools/search/load-school";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ inep: string; serie: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ?ano= ausente vale o ano padrão; presente e inválido (ou fora dos dois anos suportados) é 404. */
function resolveYear(raw: string | undefined, now: Date): number | null {
  if (raw === undefined) return defaultAcademicYear(now);
  return parseGradeSelection(undefined, raw, now).year;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { inep, serie } = await params;
  const school = await loadSchool(inep);
  const grade = findGrade(serie);
  const year = resolveYear(first((await searchParams).ano), new Date());
  if (!school || !grade || year === null) {
    return { title: "Lista não encontrada · ListaCerta", robots: { index: false, follow: false } };
  }
  return {
    title: `Lista de material ${grade.label} ${year} · ${school.name}${school.isDemo ? " (Demonstração)" : ""} · ListaCerta`,
    // Sempre noindex nesta fatia (listas ainda demo); liberar para escola claimed|verified é dívida registrada no ledger.
    robots: { index: false, follow: true },
  };
}

export default async function ListPage({ params, searchParams }: Props) {
  const { inep, serie } = await params;
  const now = new Date();
  const grade = findGrade(serie);
  const year = resolveYear(first((await searchParams).ano), now);
  if (!grade || year === null) notFound();
  const school = await loadSchool(inep);
  if (!school) notFound();

  const list = await getPublishedList(inep, grade.slug, year);
  const history = list ? await listVersionHistory(inep, grade.slug, year, { listId: list.id }) : [];
  const version = list?.version;

  return (
    <div className="flex min-h-dvh flex-col">
      <ListHeader
        schoolName={school.name}
        inep={school.inep}
        gradeLabel={grade.label}
        year={year}
        isDemo={school.isDemo || Boolean(list?.isDemo)}
        version={
          version
            ? {
                number: version.versionNumber,
                publishedAt: version.publishedAt,
                itemCount: version.itemCount,
              }
            : undefined
        }
      />
      <main className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-6 pb-9">
        {version ? (
          <>
            <ItemsTable items={version.items} />
            <VersionHistory versions={history} />
          </>
        ) : (
          <UnpublishedState inep={school.inep} gradeLabel={grade.label} year={year} />
        )}
      </main>
    </div>
  );
}
