import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClaimBlock } from "@/components/schools/ClaimBlock";
import { ProfileHeader } from "@/components/schools/ProfileHeader";
import { ProfileInfo } from "@/components/schools/ProfileInfo";
import { academicYears, parseGradeSelection } from "@/features/grades/catalog";
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
  const jsonLd = buildSchoolJsonLd(school, siteBase());

  return (
    <div className="flex min-h-dvh flex-col">
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      ) : null}
      <ProfileHeader school={school} />
      <main className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-6 pb-9">
        <GradeYearPicker inep={school.inep} serie={grade?.slug ?? null} ano={year} years={academicYears(now)} />
        <ClaimBlock inep={school.inep} status={school.verificationStatus} />
        <ProfileInfo school={school} />
      </main>
    </div>
  );
}
