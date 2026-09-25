import "server-only";

import { z } from "zod";

import { extractionResultSchema } from "../../supabase/functions/_shared/extraction-schema";

import type { ReviewRepository } from "./repository";
import { ReviewError } from "./errors";
import type { ReviewVersion } from "./types";

// Leituras da fila e do detalhe (S10). Nunca devolvem nome/e-mail de quem enviou, nome do arquivo nem `storage_path`.
export type QueueTab = "pending" | "approved" | "rejected";
export const QUEUE_LIMIT = 100;

const submissionRow = z.object({
  id: z.string().uuid(),
  status: z.string(),
  source: z.enum(["parent", "school"]),
  school_id: z.string().uuid().nullable(),
  grade: z.string().nullable(),
  school_year: z.number().int().nullable(),
  is_demo: z.boolean(),
  created_at: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
});
const COLS = "id, status, source, school_id, grade, school_year, is_demo, created_at, mime_type, size_bytes";
const decisionRow = z.object({ kind: z.enum(["publication", "review"]), decision: z.string(), reasons: z.array(z.string()), actor_id: z.string().uuid().nullable(), entity_id: z.string().uuid(), created_at: z.string() });
const versionMeta = z.object({ version: z.number().int(), origin: z.enum(["extraction", "admin_edit"]), created_at: z.string(), actor_id: z.string().uuid().nullable() });
const DEC_COLS = "kind, decision, reasons, actor_id, entity_id, created_at";

export type QueueRow = {
  id: string;
  source: "parent" | "school";
  schoolId: string | null;
  grade: string | null;
  schoolYear: number | null;
  isDemo: boolean;
  createdAt: string;
  itemCount: number | null;
  /** Códigos (nunca texto livre) do veredito da S09; a tela os traduz por `reasonPhrase`. */
  reasons: string[];
  /** Aba Aprovadas: "Aguardando publicação" ou "Publicada". */
  state: "awaiting_publication" | "published" | null;
};

export type DecisionView = { kind: "publication" | "review"; decision: string; reasons: string[]; actorId: string | null; createdAt: string };
export type ReviewDetail = {
  submission: { id: string; status: string; source: "parent" | "school"; schoolId: string | null; grade: string | null; schoolYear: number | null; isDemo: boolean; createdAt: string; mimeType: string; sizeBytes: number };
  current: ReviewVersion | null;
  versions: { version: number; origin: "extraction" | "admin_edit"; createdAt: string; actorId: string | null }[];
  extraction: { overallConfidence: number; alerts: string[]; criticalAlerts: string[]; itemCount: number } | null;
  decisions: DecisionView[];
  /** D-071: quem publicou, vindo da linha (publication:published = automática; review:published = humana), não do status. */
  publishedBy: "auto" | "human" | null;
  hasOrphan: boolean;
};

const RECENT_DECISIONS = 300;

/** Envios da aba, já filtrados NO BANCO: pendentes = status; aprovadas/recusadas = as decisões `review` mais recentes (nunca as 300 linhas mais antigas). */
async function submissionsFor(repo: ReviewRepository, tab: QueueTab): Promise<z.infer<typeof submissionRow>[]> {
  const { client } = repo;
  if (tab === "pending") {
    const { data, error } = await client.from("list_submissions").select(COLS).eq("status", "human_review").order("created_at", { ascending: true }).limit(QUEUE_LIMIT);
    if (error) throw new ReviewError("unavailable");
    return z.array(submissionRow).parse(data ?? []);
  }
  const wanted = tab === "approved" ? "approved" : "rejected";
  const statuses = tab === "approved" ? ["approved", "published"] : ["rejected"];
  const recent = await client.from("ai_decisions").select("entity_id").eq("kind", "review").eq("decision", wanted).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(RECENT_DECISIONS);
  if (recent.error) throw new ReviewError("unavailable");
  const order = [...new Set(z.array(z.object({ entity_id: z.string().uuid() })).parse(recent.data ?? []).map((r) => r.entity_id))];
  if (order.length === 0) return [];
  const { data, error } = await client.from("list_submissions").select(COLS).in("id", order).in("status", statuses);
  if (error) throw new ReviewError("unavailable");
  const byId = new Map(z.array(submissionRow).parse(data ?? []).map((r) => [r.id, r]));
  return order.flatMap((id) => byId.get(id) ?? []).slice(0, QUEUE_LIMIT);
}

const ocrRow = z.object({ submission_id: z.string().uuid(), result: z.unknown() });

export async function listQueue(repo: ReviewRepository, tab: QueueTab): Promise<QueueRow[]> {
  const { client } = repo;
  const kept = await submissionsFor(repo, tab);
  if (kept.length === 0) return [];
  const ids = kept.map((s) => s.id);
  const dec = await client.from("ai_decisions").select(DEC_COLS).in("entity_id", ids).in("kind", ["publication", "review"]).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (dec.error) throw new ReviewError("unavailable");
  const decisions = z.array(decisionRow).parse(dec.data ?? []);
  const of = (id: string) => decisions.filter((d) => d.entity_id === id);
  const ocr = await client.from("ocr_jobs").select("submission_id, result").in("submission_id", ids).not("result", "is", null).order("created_at", { ascending: false });
  if (ocr.error) throw new ReviewError("unavailable");
  const counts = new Map<string, number>();
  for (const o of z.array(ocrRow).parse(ocr.data ?? [])) {
    if (counts.has(o.submission_id)) continue; // o mais recente vale
    const p = extractionResultSchema.safeParse(o.result);
    if (p.success) counts.set(o.submission_id, p.data.items.length);
  }
  return kept.map((s) => {
    const rows = of(s.id);
    const verdict = rows.find((d) => d.kind === "publication" && d.decision === "human_review");
    const lastHuman = rows.filter((d) => d.kind === "review" && d.decision !== "edited").at(-1);
    const failure = tab === "pending" && lastHuman?.decision === "publish_failed" ? lastHuman.reasons : [];
    return {
      id: s.id,
      source: s.source,
      schoolId: s.school_id,
      grade: s.grade,
      schoolYear: s.school_year,
      isDemo: s.is_demo,
      createdAt: s.created_at,
      itemCount: counts.get(s.id) ?? null,
      reasons: [...new Set([...failure, ...(verdict?.reasons ?? [])])],
      state: tab === "approved" ? (s.status === "published" ? "published" : "awaiting_publication") : null,
    };
  });
}

export async function getDetail(repo: ReviewRepository, id: string): Promise<ReviewDetail | null> {
  const { client } = repo;
  const { data, error } = await client.from("list_submissions").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new ReviewError("unavailable");
  if (!data) return null;
  const s = submissionRow.parse(data);
  const vs = await client.from("review_versions").select("version, origin, created_at, actor_id").eq("submission_id", id).order("version", { ascending: true });
  if (vs.error) throw new ReviewError("unavailable");
  const versionRows = z.array(versionMeta).parse(vs.data ?? []);
  const cur = await repo.latestVersion(id);
  const dec = await client.from("ai_decisions").select(DEC_COLS).eq("entity_id", id).in("kind", ["publication", "review"]).order("created_at", { ascending: true });
  if (dec.error) throw new ReviewError("unavailable");
  const decisions = z.array(decisionRow).parse(dec.data ?? []);
  const parsed = extractionResultSchema.safeParse(await repo.resultOf(id));
  const r = parsed.success ? parsed.data : null;
  const itemAlerts = r ? r.items.flatMap((i) => i.alerts ?? []) : [];
  const published = decisions.find((d) => d.decision === "published");
  return {
    submission: { id: s.id, status: s.status, source: s.source, schoolId: s.school_id, grade: s.grade, schoolYear: s.school_year, isDemo: s.is_demo, createdAt: s.created_at, mimeType: s.mime_type, sizeBytes: s.size_bytes },
    current: cur ? { id: cur.id, version: cur.version, grade: cur.grade, schoolYear: cur.school_year, items: cur.items, origin: cur.origin, createdAt: cur.created_at } : null,
    versions: versionRows.map((v) => ({ version: v.version, origin: v.origin, createdAt: v.created_at, actorId: v.actor_id })),
    extraction: r ? { overallConfidence: r.overallConfidence, alerts: [...new Set([...(r.alerts ?? []), ...itemAlerts])], criticalAlerts: r.criticalAlerts ?? [], itemCount: r.items.length } : null,
    decisions: decisions.map((d) => ({ kind: d.kind, decision: d.decision, reasons: d.reasons, actorId: d.actor_id, createdAt: d.created_at })),
    publishedBy: published ? (published.kind === "publication" ? "auto" : "human") : null,
    hasOrphan: decisions.some((d) => d.decision === "publish_orphaned"),
  };
}

/** Referência do arquivo para a rota do documento (URL assinada de 60 s). `storage_path` nunca sobe para a tela. */
export async function documentRef(repo: ReviewRepository, id: string): Promise<{ storagePath: string; mimeType: string } | null> {
  const { data, error } = await repo.client.from("list_submissions").select("storage_path, mime_type").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const p = z.object({ storage_path: z.string(), mime_type: z.string() }).safeParse(data);
  return p.success ? { storagePath: p.data.storage_path, mimeType: p.data.mime_type } : null;
}
