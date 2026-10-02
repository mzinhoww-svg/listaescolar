import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { TrackView } from "@/components/analytics/TrackView";
import { ClaimBlock, type OwnClaimSummary } from "@/components/schools/ClaimBlock";
import { ProfileHeader } from "@/components/schools/ProfileHeader";
import { ProfileInfo } from "@/components/schools/ProfileInfo";
import { ProfileNotices } from "@/components/schools/ProfileNotices";
import { ReportListForm } from "@/components/schools/ReportListForm";
import { getSessionActor } from "@/features/auth/actor";
import { getMyClaimForSchool } from "@/features/claims/queries";
import { academicYears, defaultAcademicYear, parseGradeSelection } from "@/features/grades/catalog";
import { getPublishedList, listPublishedGradeYears } from "@/features/lists/queries";
import { submitReportAction } from "@/features/reports/actions";
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
  if (!school)
    return { title: "Escola não encontrada · ListaCerta", robots: { index: false, follow: false } };
  return buildSchoolMetadata(school);
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reivindicação do usuário logado (a própria; nunca de terceiros). Falha de consulta não derruba o perfil: sem bloco personalizado. */
async function loadOwnClaim(inep: string): Promise<OwnClaimSummary | null> {
  try {
    const actor = await getSessionActor();
    if (!actor) return null;
    const claim = await getMyClaimForSchool(actor, inep);
    return claim ? { status: claim.status, createdAt: claim.createdAt, decisionReason: claim.decisionReason } : null;
  } catch {
    return null;
  }
}

export default async function SchoolPage({ params, searchParams }: Props) {
  const school = await loadSchool((await params).inep);
  if (!school) notFound();

  const sp = await searchParams;
  const now = new Date();
  const { grade, year } = parseGradeSelection(first(sp.serie), first(sp.ano), now);
  const selectedYear = year ?? defaultAcademicYear(now);
  let list: Awaited<ReturnType<typeof getPublishedList>> = null;
  let listUnavailable = false;
  if (grade) {
    try {
      list = await getPublishedList(school.inep, grade.slug, selectedYear);
    } catch {
      // Falha de consulta não derruba o perfil: o bloco mostra "indisponível".
      listUnavailable = true;
    }
  }
  let shortcuts: Awaited<ReturnType<typeof listPublishedGradeYears>> | undefined;
  try {
    shortcuts = await listPublishedGradeYears(school.inep);
  } catch {
    shortcuts = undefined; // consulta falhou: sem atalhos e sem afirmar "nenhuma lista".
  }
  const ownClaim = await loadOwnClaim(school.inep);
  const jsonLd = buildSchoolJsonLd(school, siteBase() ?? undefined);
  // Nonce por requisição (S19, CSP sem 'unsafe-inline' em script-src): vem do middleware via `x-nonce`.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      {jsonLd ? (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
      <TrackView name="school_viewed" props={{ school_inep: school.inep, verification_status: school.verificationStatus }} />
      <ProfileHeader school={school} />
      <main className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-6 pt-6 pb-9">
        <ProfileNotices school={school} />
        <GradeYearPicker
          inep={school.inep}
          serie={grade?.slug ?? null}
          ano={selectedYear}
          years={academicYears(now)}
          unavailable={listUnavailable}
          publishedShortcuts={shortcuts?.map((s) => ({ gradeSlug: s.gradeSlug, year: s.year }))}
          published={
            list
              ? { versionNumber: list.version.versionNumber, itemCount: list.version.itemCount }
              : null
          }
        />
        <ClaimBlock inep={school.inep} status={school.verificationStatus} claim={ownClaim} />
        {list ? (
          <ReportListForm
            listId={list.id}
            action={submitReportAction.bind(null, `/escolas/${school.inep}?serie=${grade?.slug ?? ""}&ano=${selectedYear}`)}
            ok={first(sp.denunciaOk) === "1"}
            erro={first(sp.denunciaErro) ?? null}
          />
        ) : null}
        <ProfileInfo school={school} />
      </main>
    </div>
  );
}
