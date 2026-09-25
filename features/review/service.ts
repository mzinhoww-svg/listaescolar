// Serviço da revisão humana (S10). Só admin (SessionActor de marca); o `actor_id` vem da sessão, nunca de formulário.
// Sem IA: nenhuma dependência de roteador/adapters.
import { isSessionActor, type SessionActor } from "@/features/auth/actor";
import type { PublicationSettingsProvider } from "../../supabase/functions/_shared/publication/settings";
import type { PublicationContext } from "../../supabase/functions/_shared/publication/types";

import { ReviewError } from "./errors";
import { CRITICAL_ACK_REASON, type BlockerCode } from "./codes";
import { approvalBlockers, criticalAlertsIn, publicationBlockers, type CriticalAck, type GateInput } from "./gate";
import { publishApproved, type OnAlert, type ReviewPublicationDeps } from "./publish";
import { approveSchema, assignSchoolSchema, rejectSchema, reviewPayloadSchema, submissionIdSchema } from "./schemas";
import type { PublishOutcome, ReconcileOutcome, ReviewContext, ReviewOutcome, ReviewStore } from "./types";

export { ReviewError };

export type ReviewServiceDeps = {
  store: ReviewStore;
  publication: ReviewPublicationDeps & { settings: PublicationSettingsProvider };
  onAlert?: OnAlert;
};

function assertAdmin(actor: unknown): asserts actor is SessionActor {
  if (!isSessionActor(actor) || actor.role !== "admin") throw new ReviewError("forbidden");
}
const parse = <T,>(r: { success: true; data: T } | { success: false }): T => {
  if (!r.success) throw new ReviewError("invalid_input");
  return r.data;
};
const idOf = (raw: unknown): string => parse(submissionIdSchema.safeParse(raw));

const gateOf = (c: ReviewContext): GateInput => ({ schoolId: c.submission.schoolId, grade: c.version.grade, schoolYear: c.version.schoolYear, items: c.version.items });

export type ReviewService = ReturnType<typeof createReviewService>;

export function createReviewService(deps: ReviewServiceDeps) {
  const { store, publication } = deps;

  async function context(id: string): Promise<ReviewContext> {
    const c = await store.loadContext(id);
    if (!c) throw new ReviewError("not_found");
    return c;
  }

  /** Alerta crítico do resultado x configuração (ai_settings); sem configuração vale só o que a extração já marcou. */
  async function criticalAck(c: ReviewContext, acknowledged: boolean): Promise<CriticalAck> {
    let config: readonly string[] = [];
    try {
      config = (await publication.settings.load())?.criticalAlerts ?? [];
    } catch {
      config = [];
    }
    return { required: criticalAlertsIn(c.resultAlerts, config).length > 0, acknowledged };
  }

  const portsUp = (): boolean => publication.publisher !== null && publication.context !== null;

  /** Bloqueios que a tela mostra: com as portas ligadas vale o portão de publicação (contexto); sem elas, só os intrínsecos. */
  async function blockersFor(c: ReviewContext, acknowledged: boolean): Promise<BlockerCode[]> {
    const ack = await criticalAck(c, acknowledged);
    if (!portsUp() || !publication.context) return approvalBlockers(gateOf(c), ack);
    let pctx: PublicationContext | null = null;
    try {
      pctx = await publication.context.load({ schoolId: c.submission.schoolId, grade: c.version.grade, schoolYear: c.version.schoolYear, submittedBy: c.submission.submittedBy });
    } catch {
      pctx = null;
    }
    return publicationBlockers(gateOf(c), pctx, ack);
  }

  async function approveWith(actor: SessionActor, id: string, raw: unknown, usePublicationGate: boolean): Promise<ReviewOutcome> {
    const input = parse(approveSchema.safeParse(raw));
    const c = await context(id);
    if (c.submission.status !== "human_review") return { status: "not_reviewable" };
    if (c.version.version !== input.expectedVersion) return { status: "stale", version: c.version.version, versionId: c.version.id };
    const ack = await criticalAck(c, input.acknowledged);
    const codes = usePublicationGate ? await blockersFor(c, input.acknowledged) : approvalBlockers(gateOf(c), ack);
    if (codes.length > 0) return { status: "blocked", codes };
    const r = await store.approve(id, actor.userId, input.expectedVersion, ack.required ? [CRITICAL_ACK_REASON] : []);
    return r === "approved" ? { status: "approved" } : { status: r };
  }

  return {
    async open(actor: SessionActor, submissionId: string) {
      assertAdmin(actor);
      return store.open(idOf(submissionId), actor.userId);
    },

    async save(actor: SessionActor, submissionId: string, raw: unknown): Promise<ReviewOutcome> {
      assertAdmin(actor);
      const id = idOf(submissionId);
      const p = parse(reviewPayloadSchema.safeParse(raw));
      const r = await store.save(id, actor.userId, p.expectedVersion, { grade: p.grade, schoolYear: p.schoolYear, items: p.items });
      return r.state === "saved" ? { status: "saved", version: r.version, versionId: r.versionId } : r.state === "stale" ? { status: "stale", version: r.version, versionId: r.versionId } : { status: "not_reviewable" };
    },

    async approve(actor: SessionActor, submissionId: string, raw: unknown): Promise<ReviewOutcome> {
      assertAdmin(actor);
      return approveWith(actor, idOf(submissionId), raw, false);
    },

    async reject(actor: SessionActor, submissionId: string, raw: unknown): Promise<ReviewOutcome> {
      assertAdmin(actor);
      const id = idOf(submissionId);
      const p = parse(rejectSchema.safeParse(raw));
      const r = await store.reject(id, actor.userId, p.expectedVersion, p.reason);
      return r === "rejected" ? { status: "rejected" } : { status: r };
    },

    async publish(actor: SessionActor, submissionId: string): Promise<PublishOutcome> {
      assertAdmin(actor);
      return publishApproved({ store, publication, actorId: actor.userId, submissionId: idOf(submissionId), ...(deps.onAlert ? { onAlert: deps.onAlert } : {}) });
    },

    /** "Aprovar e publicar": aprova (portão de publicação quando há portas) e publica. Bloqueado/stale não publica. */
    async approveAndPublish(actor: SessionActor, submissionId: string, raw: unknown): Promise<{ approval: ReviewOutcome; publication: PublishOutcome | null }> {
      assertAdmin(actor);
      const id = idOf(submissionId);
      const approval = await approveWith(actor, id, raw, true);
      if (approval.status !== "approved") return { approval, publication: null };
      return { approval, publication: await publishApproved({ store, publication, actorId: actor.userId, submissionId: id, ...(deps.onAlert ? { onAlert: deps.onAlert } : {}) }) };
    },

    /** S11: atribui a escola a um envio em revisão que não tem (obrigação da S10 para envio de pai sem escola). */
    async assignSchool(actor: SessionActor, submissionId: string, raw: unknown): Promise<ReviewOutcome> {
      assertAdmin(actor);
      const id = idOf(submissionId);
      const p = parse(assignSchoolSchema.safeParse(raw));
      const r = await store.assignSchool(id, actor.userId, p.expectedVersion, p.schoolId);
      return r === "assigned" ? { status: "school_assigned" } : { status: r };
    },

    /** S11: "Conciliar publicação" (D-066). Só o admin, por clique: conciliar sozinho arriscaria vincular a versão errada. */
    async reconcile(actor: SessionActor, submissionId: string): Promise<ReconcileOutcome> {
      assertAdmin(actor);
      return store.reconcileOrphan(idOf(submissionId), actor.userId);
    },

    /** Bloqueios para a tela (mesmo cálculo do "Aprovar e publicar"). */
    async blockers(actor: SessionActor, submissionId: string, acknowledged: boolean): Promise<BlockerCode[]> {
      assertAdmin(actor);
      return blockersFor(await context(idOf(submissionId)), acknowledged);
    },
  };
}
