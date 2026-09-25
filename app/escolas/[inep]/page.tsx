import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClaimBlock } from "@/components/schools/ClaimBlock";
import { ProfileHeader } from "@/components/schools/ProfileHeader";
import { ProfileInfo } from "@/components/schools/ProfileInfo";
import { ProfileNotices } from "@/components/schools/ProfileNotices";
import { academicYears, defaultAcademicYear, parseGradeSelection } from "@/features/grades/catalog";
import { getPublishedList } from "@/features/lists/queries";
import { buildSchoolJsonLd, serializeJsonLd } from "@/features/schools/search/jsonld";
import { loadSchool } from "@/features/schools/search/load-school";
import { buildSchoolMetadata } from "@/features/schools/search/seo";
import { siteBase } from "@/lib/site-base";

import { GradeYearPicker } from "./GradeYearPicker";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ inep: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const school = await loadSchool((await params).inep);
  if (!school) return { title: "Escola não encontrada · ListaCerta", robots: { index: false, follow: false } };
  return buildSchoolMetadata(school);
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SchoolPage({ params, searchParams }: Props) {
  const school = await loadSchool((await params).inep);
  if (!school) notFound();

  const sp = await searchParams;
  const now = new Date();
  const { grade, year } = parseGradeSelection(first(sp.serie), first(sp.ano), now);
  const selectedYear = year ?? defaultAcademicYear(now);
  const list = grade ? await getPublishedList(school.inep, grade.slug, selectedYear) : null;
  const jsonLd = buildSchoolJsonLd(school, siteBase() ?? undefined);

  return (
    <div className="flex min-h-dvh flex-col">
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      ) : null}
      <ProfileHeader school={school} />
      <main className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-6 pb-9">
        <ProfileNotices school={school} />
        <GradeYearPicker
          inep={school.inep}
          serie={grade?.slug ?? null}
          ano={selectedYear}
          years={academicYears(now)}
          published={list ? { versionNumber: list.version.versionNumber, itemCount: list.version.itemCount } : null}
        />
        <ClaimBlock inep={school.inep} status={school.verificationStatus} isDemo={school.isDemo} />
        <ProfileInfo school={school} />
      </main>
    </div>
  );
}
