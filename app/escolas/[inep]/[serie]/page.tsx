import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createCartAction } from "@/app/carrinho/novo/actions";
import { TrackClick } from "@/components/analytics/TrackClick";
import { TrackView } from "@/components/analytics/TrackView";
import { SubmitButton } from "@/components/cart/SubmitButton";
import { ItemsTable } from "@/components/lists/ItemsTable";
import { ListHeader } from "@/components/lists/ListHeader";
import { SaveListButton } from "@/components/lists/SaveListButton";
import { UnpublishedState } from "@/components/lists/UnpublishedState";
import { VersionHistory } from "@/components/lists/VersionHistory";
import { WatchButton } from "@/components/notifications/WatchButton";
import { WhatsAppShareButton } from "@/components/share/WhatsAppShareButton";
import { ShareListCard } from "@/components/share/ShareListCard";
import { ReportListForm } from "@/components/schools/ReportListForm";
import { buttonClass } from "@/components/ui/Button";
import { getSessionActor } from "@/features/auth/actor";
import { unwatchListAction, watchListAction } from "@/app/conta/notificacoes/actions";
import { saveListAction } from "@/app/conta/listas-salvas/actions";
import { channelAvailability } from "@/features/notifications/preferences";
import { isWatching } from "@/features/notifications/queries";
import { defaultAcademicYear, findGrade, parseGradeSelection } from "@/features/grades/catalog";
import { getPublishedList, listVersionHistory } from "@/features/lists/queries";
import { submitReportAction } from "@/features/reports/actions";
import { loadSchool } from "@/features/schools/search/load-school";
import { listMyStudents } from "@/features/students/queries";
import { encodeShortCode, shortLinkUrl } from "@/features/short-links/code";
import { SITE_LOCALE, SITE_NAME } from "@/lib/seo";
import { siteBase } from "@/lib/site-base";

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
  const title = `Lista de material ${grade.label} ${year} · ${school.name}${school.isDemo ? " (Demonstração)" : ""} · ListaCerta`;
  return {
    title,
    openGraph: { type: "website", siteName: SITE_NAME, locale: SITE_LOCALE, title },
    // Sempre noindex nesta fatia (listas ainda demo); liberar para escola claimed|verified é dívida registrada no ledger.
    robots: { index: false, follow: true },
  };
}

export default async function ListPage({ params, searchParams }: Props) {
  const { inep, serie } = await params;
  const now = new Date();
  const grade = findGrade(serie);
  const sp = await searchParams;
  const year = resolveYear(first(sp.ano), now);
  if (!grade || year === null) notFound();
  const school = await loadSchool(inep);
  if (!school) notFound();

  const list = await getPublishedList(inep, grade.slug, year);
  const history = list ? await listVersionHistory(inep, grade.slug, year, { listId: list.id }) : [];
  const version = list?.version;
  const shareOrigin = version ? siteBase() : null;
  // App24: sem lista publicada, oferece "Me avise" (com login; sem login, leva ao /entrar?next=)
  const watchActor = version ? null : await getSessionActor().catch(() => null);
  const watching = watchActor ? await isWatching(watchActor, { inep: school.inep, gradeSlug: grade.slug, year }).catch(() => false) : false;
  // S15: lista publicada oferece "Salvar lista" para um aluno da família.
  const saveActor = version ? await getSessionActor().catch(() => null) : null;
  const myStudents = saveActor ? await listMyStudents(saveActor).catch(() => []) : [];

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
        {version && list ? (
          <>
            <TrackView
              name="list_viewed"
              props={{ school_inep: school.inep, grade_slug: grade.slug, school_year: year, list_version_id: version.id, items_count: version.itemCount }}
            />
            <ItemsTable items={version.items} />
            <p className="text-texto-2 -mb-3 text-[13px] leading-snug font-semibold">
              Preços aparecem quando a loja ou a papelaria informa.
            </p>
            <div className="bg-papel/95 sticky bottom-0 z-10 -mx-6 flex flex-col gap-2 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
              <Link href={`/carrinho/novo?lista=${version.id}`} className={buttonClass("primary", "lg", "w-full")}>
                Montar carrinho com esta lista
              </Link>
              {saveActor === null ? (
                <p className="text-texto-2 text-center text-xs font-semibold">Ao continuar, você entra com seu e-mail e volta para esta lista.</p>
              ) : null}
            </div>
            {/* Cria o carrinho no servidor e cai direto no pedido de cotação (UX-040: sem a tela intermediária). */}
            <form action={createCartAction}>
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <input type="hidden" name="listId" value={version.id} />
              <input type="hidden" name="destino" value="cotacao" />
              <SubmitButton variant="outline" pendingLabel="Montando o pedido" className="w-full">
                Pedir preço à papelaria do bairro
              </SubmitButton>
            </form>
            {shareOrigin ? (
              <TrackClick name="list_shared" props={{ channel: "whatsapp", school_inep: school.inep, grade_slug: grade.slug }}>
                <WhatsAppShareButton
                  schoolName={school.name}
                  gradeLabel={grade.label}
                  year={year}
                  link={shortLinkUrl(encodeShortCode({ inep: school.inep, gradeSlug: grade.slug }), shareOrigin)}
                />
              </TrackClick>
            ) : null}
            <SaveListButton
              listId={list.id}
              students={myStudents.map((s) => ({ id: s.id, nickname: s.nickname }))}
              loggedIn={saveActor !== null}
              nextPath={`/escolas/${school.inep}/${grade.slug}?ano=${year}`}
              save={saveListAction}
            />
            <VersionHistory versions={history} />
            {shareOrigin ? <ShareListCard inep={school.inep} gradeSlug={grade.slug} origin={shareOrigin} /> : null}
            <ReportListForm
              listId={list.id}
              action={submitReportAction.bind(null, `/escolas/${school.inep}/${grade.slug}?ano=${year}`)}
              ok={first(sp.denunciaOk) === "1"}
              erro={first(sp.denunciaErro) ?? null}
            />
          </>
        ) : (
          <UnpublishedState
            inep={school.inep}
            gradeSlug={grade.slug}
            gradeLabel={grade.label}
            year={year}
            notify={
              <WatchButton
                inep={school.inep}
                gradeSlug={grade.slug}
                year={year}
                loggedIn={watchActor !== null}
                watching={watching}
                nextPath={`/escolas/${school.inep}/${grade.slug}?ano=${year}`}
                watch={watchListAction}
                unwatch={unwatchListAction}
                pushAvailable={channelAvailability(process.env).web_push}
              />
            }
          />
        )}
      </main>
    </div>
  );
}
