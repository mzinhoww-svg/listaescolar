// Contratos do núcleo de IA. TypeScript puro (só zod): roda no Deno (Edge Function) e no Node (app).
import { z } from "zod";

export const ROUTES = ["cheap", "strong", "vision"] as const;
export type Route = (typeof ROUTES)[number];
export const PROVIDER_NAMES = ["openrouter", "fake"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type Clock = {
  now(): number;
  /** Agenda `fn`; devolve a função que cancela. */
  setTimeout(fn: () => void, ms: number): () => void;
};
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

// ---- Requisição/resposta dos provedores -------------------------------------------------------
export type LlmPart =
  | { type: "text"; text: string }
  | { type: "image"; mime: string; bytes: Uint8Array }
  | { type: "file"; mime: string; fileName: string; bytes: Uint8Array };
export type LlmMessage = { role: "system" | "user" | "assistant"; content: string | LlmPart[] };
export type LlmRequest = {
  messages: LlmMessage[];
  responseFormat?: "json";
  temperature?: number;
  maxTokens?: number;
};
export type Usage = { promptTokens?: number; completionTokens?: number; totalTokens?: number };
export type LlmResponse = { text: string; model: string; usage?: Usage; latencyMs: number };
export type CallOptions = { signal?: AbortSignal };

export interface LlmProvider {
  /** Nome do modelo efetivo (vem do ambiente; gravado em ai_decisions como dado). */
  readonly model: string;
  complete(req: LlmRequest, opts: CallOptions): Promise<LlmResponse>;
}
export type OcrResponse = { text: string; model: string; latencyMs: number };
export interface OcrProvider {
  extractText(input: { bytes: Uint8Array; mime: string }, opts: CallOptions): Promise<OcrResponse>;
}
export type ProviderFactory = (route: Route) => LlmProvider;
export type ProviderFactories = Partial<Record<ProviderName, ProviderFactory>>;

// ---- Decisões ---------------------------------------------------------------------------------
export type DecisionRecord = {
  entityType: string;
  entityId: string;
  kind: "extraction";
  provider: ProviderName;
  model: string;
  promptKey: string;
  promptVersion: number;
  pipelineVersion: string;
  overallScore: number | null;
  itemScores: number[];
  alerts: string[];
  decision: "accepted" | "escalated" | "failed";
  /** Só código curto; nunca conteúdo do documento. */
  justification: string;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
};
export interface DecisionRecorder {
  record(decision: DecisionRecord): Promise<void>;
}

// ---- Configuração viva (banco) ------------------------------------------------------------------
const unit = z
  .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)])
  .pipe(z.number().finite().min(0).max(1));
const routeCfg = z
  .object({ provider: z.enum(PROVIDER_NAMES), timeout_ms: z.number().int().min(1000).max(120000) })
  .transform((r) => ({ provider: r.provider, timeoutMs: r.timeout_ms }));

/** Linha devolvida por `ai_get_settings()`, validada e em camelCase. */
export const aiSettingsRowSchema = z
  .object({
    confidence_threshold: unit,
    item_confidence_threshold: unit,
    critical_alerts: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).max(50),
    routes: z.object({ cheap: routeCfg, strong: routeCfg, vision: routeCfg }),
    max_escalations: z.number().int().min(0).max(3),
    pipeline_version: z.string().min(1).max(40),
  })
  .transform((r) => ({
    confidenceThreshold: r.confidence_threshold,
    itemConfidenceThreshold: r.item_confidence_threshold,
    criticalAlerts: r.critical_alerts,
    routes: r.routes,
    maxEscalations: r.max_escalations,
    pipelineVersion: r.pipeline_version,
  }));
export type AiSettings = z.output<typeof aiSettingsRowSchema>;

export const promptRowSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    version: z.number().int().min(1),
    text: z.string().min(1).max(50000),
    schema: z.unknown(),
  })
  .transform((p) => ({ key: p.key, version: p.version, text: p.text, schema: p.schema }));
export type Prompt = z.output<typeof promptRowSchema>;

export interface SettingsProvider {
  /** Falha fechada: lança AiError("ai_not_configured") se não houver configuração válida. */
  load(): Promise<AiSettings>;
}
export interface PromptRegistry {
  get(key: string): Promise<Prompt>;
}
