import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { DecisionPanel } from "@/components/review/DecisionPanel";
import { DraftProvider } from "@/components/review/DraftContext";
import { formatTime } from "@/components/review/format";
import { AlertNote } from "@/components/review/AlertNote";
import { ReasonsList } from "@/components/review/ReasonsList";
import { ReviewDocument } from "@/components/review/ReviewDocument";
import { ReviewHeader } from "@/components/review/ReviewHeader";
import { ReviewItemsEditor } from "@/components/review/ReviewItemsEditor";
import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { requireAccess } from "@/features/auth/guard";
import { getReviewDetail } from "@/features/review/queries";
import type { ReviewDetail } from "@/features/review/read-models";
import { submissionIdSchema } from "@/features/review/schemas";
import { approveAndPublishAction, assignSchoolAction, publishAction, reconcileAction, rejectAction, saveReviewAction } from "../actions";
import { AssignSchool } from "@/components/review/AssignSchool";
import { reasonPhrase } from "@/features/review/phrases";
import { buildReviewService, loadPublicationInfo, loadSchoolLabels, loadThresholds } from "../loaders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisar lista · ListaCerta" };

const DOC_ALERTS = ["handwritten", "text_document_mismatch", "invalid_school_grade_year"] as const;

async function load(actor: SessionActor, id: string): Promise<ReviewDetail | null> {
  let d = await getReviewDetail(actor, id);
  if (d?.submission.status === "human_review") {
    await buildReviewService().open(actor, id); // idempotente: cria a versão 1 (extração) na primeira abertura
    if (!d.current) d = await getReviewDetail(actor, id);
  }
  return d;
}

const versionLine = (v: ReviewDetail["versions"][number], me: string): string =>
  v.origin === "extraction" ? `Versão ${v.version} · lida pela IA às ${formatTime(v.createdAt)}` : `Versão ${v.version} · editada por ${v.actorId === me ? "você" : "outro admin"} às ${formatTime(v.createdAt)}`;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireAccess("/admin/revisao");
  const id = submissionIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const actor = await getSessionActor();
  let detail: ReviewDetail | null = null;
  let failed = false;
  try {
    detail = actor ? await load(actor, id.data) : null;
  } catch (error) {
    console.error("detalhe da revisão", error instanceof Error ? error.name : "erro");
    failed = true;
  }
  if (!failed && (!detail || !detail.current)) notFound();
  const shell = { active: "/admin/revisao", email: user.email, breadcrumb: "Admin / Revisão de listas / Detalhe", title: "Revise o que a IA leu" } as const;
  if (failed || !detail || !detail.current || !actor) {
    return (
      <AdminShell {...shell}>
        <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">
          Não foi possível carregar. <Link href={`/admin/revisao/${id.data}`} className="underline">Tentar de novo</Link>
        </p>
      </AdminShell>
    );
  }
  const { submission: s, current } = detail;
  const reviewing = s.status === "human_review";
  const [thresholds, labels, blockers] = await Promise.all([
    loadThresholds(),
    loadSchoolLabels([s.schoolId]),
    reviewing ? buildReviewService().blockers(actor, s.id, false).catch(() => null) : Promise.resolve([]),
  ]);
  const pub = loadPublicationInfo();
  const lastHuman = detail.decisions.filter((d) => d.kind === "review" && d.decision !== "edited" && d.decision !== "reconciled").at(-1);
  const failure = reviewing && lastHuman?.decision === "publish_failed" ? (lastHuman.reasons[0] ?? null) : null;
  const unreadable = reviewing && current.items.length === 0 && detail.extraction === null;
  const reasons = detail.decisions.find((d) => d.kind === "publication" && d.decision === "human_review")?.reasons ?? [];
  const docAlerts = DOC_ALERTS.filter((a) => detail.extraction?.alerts.includes(a));
  const critical = detail.extraction?.criticalAlerts ?? [];
  const humanApproved = detail.decisions.some((d) => d.kind === "review" && d.decision === "approved");
  return (
    <AdminShell {...shell} actions={<Link href="/admin/revisao" className="inline-flex min-h-11 items-center text-[14px] font-extrabold underline">Voltar à fila</Link>}>
      <ReviewHeader status={s.status} source={s.source} createdAt={s.createdAt} isDemo={s.isDemo} school={s.schoolId ? (labels[s.schoolId] ?? null) : null} demoPublication={pub.demo} />
      <DraftProvider>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <ReviewDocument submissionId={s.id} mimeType={s.mimeType} sizeBytes={s.sizeBytes} />
          <div className="flex min-w-0 flex-col gap-4">
            {failure ? <p role="alert" className="bg-erro-fundo text-erro-texto rounded-campo px-4 py-3 text-[14px] font-bold">A última tentativa de publicação falhou e o envio voltou à fila. {reasonPhrase(failure)}.</p> : null}
            {unreadable ? <p role="note" className="bg-aviso-fundo text-aviso-texto rounded-campo px-4 py-3 text-[14px] font-bold">Não foi possível ler os itens desta lista: recuse ou digite os itens.</p> : null}
            {reviewing && s.schoolId === null ? <AssignSchool submissionId={s.id} version={current.version} action={assignSchoolAction} /> : null}
            <ReasonsList reasons={reasons} />
            {[...new Set([...critical, ...docAlerts])].map((a) => <AlertNote key={a} code={a} critical={critical.includes(a)} />)}
            <ReviewItemsEditor
              submissionId={s.id}
              version={current.version}
              initial={{ grade: current.grade, schoolYear: current.schoolYear, items: current.items }}
              thresholds={thresholds}
              readOnly={!reviewing}
              action={saveReviewAction}
            />
            <ol aria-label="Histórico de versões" className="text-texto-2 flex flex-col gap-0.5 text-[13px] font-semibold">
              {detail.versions.map((v) => <li key={v.version}>{versionLine(v, actor.userId)}</li>)}
            </ol>
            <DecisionPanel
              submissionId={s.id}
              version={current.version}
              status={s.status}
              blockers={blockers}
              canPublish={s.status === "approved" && humanApproved}
              orphaned={detail.hasOrphan}
              publicationAvailable={pub.available}
              demoPublication={pub.demo}
              actions={{ approveAndPublish: approveAndPublishAction, reject: rejectAction, publish: publishAction, reconcile: reconcileAction }}
            />
          </div>
        </div>
      </DraftProvider>
    </AdminShell>
  );
}
