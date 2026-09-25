// Roteador barato-primeiro. Escala no máximo `max_escalations` (a cadeia tem só 2 rotas) e só por erro
// transitório (Zod inválido, confiança baixa, timeout, erro 5xx/429). Uma decisão por tentativa.
import type { ZodType } from "zod";
import { AiError } from "./errors.ts";
import { parseJsonLoose } from "./json.ts";
import type {
  AiSettings,
  Clock,
  DecisionRecord,
  DecisionRecorder,
  LlmProvider,
  LlmRequest,
  Prompt,
  PromptRegistry,
  ProviderFactories,
  ProviderName,
  Route,
  SettingsProvider,
  Usage,
} from "./types.ts";

export type Evaluation = { overall: number; items: number[]; alerts: string[] };

export type Task<T> = {
  entityType: string;
  entityId: string;
  promptKey: string;
  /** Entrada visual (imagem/PDF escaneado): começa pela rota `vision`. */
  needsVision?: boolean;
  buildRequest(prompt: Prompt): LlmRequest;
  schema: ZodType<T>;
  /** Confiança e alertas (só códigos) do resultado já validado. */
  evaluate(result: T): Evaluation;
};

export type RunOptions = { signal?: AbortSignal; budgetMs: number };
export type RunResult<T> = {
  result: T;
  evaluation: Evaluation;
  route: Route;
  provider: ProviderName;
  model: string;
  attempts: number;
  lowConfidence: boolean;
  pipelineVersion: string;
  /** Tokens somados de todas as tentativas que responderam (inclusive as escaladas: também foram pagas). */
  usage: Usage;
};
export type RouterDeps = {
  providers: ProviderFactories;
  settings: SettingsProvider;
  prompts: PromptRegistry;
  recorder: DecisionRecorder;
  clock: Clock;
  /**
   * O provedor `fake` só é usado se este flag for `true` E `env.NODE_ENV` não for "production".
   * Default false. Composição de produção NUNCA passa `allowFake` (e NODE_ENV=production recusa mesmo assim).
   */
  allowFake?: boolean;
  /** Só para teste: sobrescreve a leitura de NODE_ENV do processo. */
  env?: { NODE_ENV?: string };
};

// Códigos de alerta do SPEC (seção de alertas). Qualquer outro código é descartado antes de gravar.
export const ALERT_CODES: ReadonlySet<string> = new Set([
  "low_confidence_item",
  "ambiguous_item",
  "handwritten",
  "possible_collective_item",
  "restrictive_brand_or_spec",
  "text_document_mismatch",
  "invalid_school_grade_year",
]);

function nodeEnv(): string | undefined {
  try {
    return (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  } catch {
    return undefined;
  }
}
const unit = (n: number) => (Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : 0);

function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AiError("aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

type RouteCfg = AiSettings["routes"][Route];

async function closed<V>(fn: () => Promise<V>, detail: string): Promise<V> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("ai_not_configured", { detail });
  }
}

export function createRouter(deps: RouterDeps) {
  const { clock } = deps;
  const fakeAllowed = () => deps.allowFake === true && (deps.env ? deps.env.NODE_ENV : nodeEnv()) !== "production";

  /** Resolve o provedor da rota (falha fechada, sem rede). */
  function resolve(settings: AiSettings, route: Route): { provider: LlmProvider; cfg: RouteCfg } {
    const cfg = settings.routes[route];
    if (cfg.provider === "fake" && !fakeAllowed()) throw new AiError("ai_not_configured", { detail: "fake_not_allowed" });
    const factory = deps.providers[cfg.provider];
    if (!factory) throw new AiError("ai_not_configured", { detail: "provider_unregistered" });
    try {
      return { provider: factory(route), cfg };
    } catch (e) {
      if (e instanceof AiError) throw e;
      throw new AiError("ai_not_configured", { detail: "provider_unavailable" }); // nunca repassa e.message
    }
  }

  async function run<T>(task: Task<T>, opts: RunOptions): Promise<RunResult<T>> {
    const external = opts.signal;
    if (external?.aborted || !(opts.budgetMs > 0)) throw new AiError("aborted");
    const t0 = clock.now();
    const settings = await closed(() => deps.settings.load(), "settings_unavailable");
    const prompt = await closed(() => deps.prompts.get(task.promptKey), "prompt_unavailable");
    if (external?.aborted) throw new AiError("aborted");

    const chain: Route[] = task.needsVision ? ["vision", "strong"] : ["cheap", "strong"];
    const maxAttempts = 1 + Math.min(settings.maxEscalations, chain.length - 1);

    // Resolve TODA a cadeia antes da 1ª tentativa: se a rota de escalada não está configurada, falha fechado
    // sem rede e sem decisão (evita `escalated` órfão e resultado pago perdido).
    const resolved = chain.slice(0, maxAttempts).map((route) => resolve(settings, route));
    const usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};
    const addUsage = (u: Usage | undefined) => {
      if (!u) return;
      for (const k of ["promptTokens", "completionTokens", "totalTokens"] as const) {
        const v = u[k];
        if (typeof v === "number" && Number.isFinite(v)) usage[k] = (usage[k] ?? 0) + v;
      }
    };

    for (let i = 0; i < maxAttempts; i++) {
      const route = chain[i] as Route;
      const { provider, cfg } = resolved[i] as { provider: LlmProvider; cfg: RouteCfg };

      const startedAt = clock.now();
      const remaining = opts.budgetMs - (startedAt - t0);
      const controller = new AbortController();
      let timedOut = false;
      const onExternal = () => controller.abort();
      external?.addEventListener("abort", onExternal, { once: true });
      const cancelTimer = clock.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, Math.max(1, Math.min(cfg.timeoutMs, remaining)));

      let failure: AiError | null = null;
      let value: T | undefined;
      let evaluation: Evaluation | undefined;
      try {
        const resp = await raceAbort(
          Promise.resolve().then(() => provider.complete(task.buildRequest(prompt), { signal: controller.signal })),
          controller.signal,
        );
        if (external?.aborted) throw new AiError("aborted");
        addUsage(resp.usage);
        const parsed = task.schema.safeParse(parseJsonLoose(resp.text));
        if (!parsed.success) throw new AiError("invalid_output", { detail: "schema" });
        value = parsed.data;
        evaluation = task.evaluate(value);
      } catch (e) {
        if (external?.aborted) throw new AiError("aborted");
        if (timedOut) failure = new AiError("provider_timeout");
        else if (e instanceof AiError) failure = e;
        else failure = new AiError("provider_error", { transient: false, detail: "unexpected" }); // bug local: não escala
      } finally {
        cancelTimer();
        external?.removeEventListener("abort", onExternal);
      }
      if (external?.aborted) throw new AiError("aborted");

      const finishedAt = clock.now();
      const canEscalate = i < maxAttempts - 1 && opts.budgetMs - (finishedAt - t0) > 0;
      const base = { deps, task, settings, prompt, provider, route, cfgProvider: cfg.provider, attempt: i + 1, startedAt, finishedAt };

      if (!failure && evaluation && value !== undefined) {
        const low = !(evaluation.overall >= settings.confidenceThreshold);
        if (!low || !canEscalate) {
          await record(base, "accepted", low ? "low_confidence" : "accepted", evaluation);
          return {
            result: value,
            evaluation,
            route,
            provider: cfg.provider,
            model: provider.model,
            attempts: i + 1,
            lowConfidence: low,
            pipelineVersion: settings.pipelineVersion,
            usage,
          };
        }
        await record(base, "escalated", "low_confidence", evaluation);
        continue;
      }
      const err = failure ?? new AiError("provider_error");
      if (err.transient && canEscalate) {
        await record(base, "escalated", err.code);
        continue;
      }
      await record(base, "failed", err.code);
      throw err;
    }
    throw new AiError("provider_error", { detail: "no_attempt" });
  }

  return { run };
}

type RecordBase<T> = {
  deps: RouterDeps;
  task: Task<T>;
  settings: AiSettings;
  prompt: Prompt;
  provider: { model: string };
  route: Route;
  cfgProvider: ProviderName;
  attempt: number;
  startedAt: number;
  finishedAt: number;
};

async function record<T>(b: RecordBase<T>, decision: DecisionRecord["decision"], justification: string, ev?: Evaluation) {
  const iso = (ms: number) => new Date(ms).toISOString();
  await b.deps.recorder.record({
    entityType: b.task.entityType,
    entityId: b.task.entityId,
    kind: "extraction",
    provider: b.cfgProvider,
    model: b.provider.model,
    promptKey: b.prompt.key,
    promptVersion: b.prompt.version,
    pipelineVersion: b.settings.pipelineVersion,
    overallScore: ev ? unit(ev.overall) : null,
    itemScores: ev ? ev.items.slice(0, 2000).map(unit) : [],
    alerts: ev ? ev.alerts.filter((a) => ALERT_CODES.has(a)).slice(0, 200) : [],
    decision,
    justification,
    attempt: b.attempt,
    startedAt: iso(b.startedAt),
    finishedAt: iso(b.finishedAt),
    latencyMs: Math.max(0, Math.round(b.finishedAt - b.startedAt)),
  });
}
