// Roteador barato-primeiro. Escala no máximo `max_escalations` (a cadeia tem só 2 rotas) e só por erro
// transitório (Zod inválido, confiança baixa, timeout, erro 5xx/429). Uma decisão por tentativa.
//
// D-057 (S18): este arquivo tinha 261 linhas. `record()` (gravação da decisão) foi extraído para
// `router-record.ts`; `raceAbort`/`closed`/a resolução de rota foram extraídos para `router-helpers.ts` —
// comportamento idêntico ao original.
import type { ZodType } from "zod";
import { AiError } from "./errors.ts";
import { type EnvLike, isProductionEnv, readProcessEnv } from "./env.ts";
import { parseJsonLoose } from "./json.ts";
import { ALERT_CODES, record } from "./router-record.ts";
import { closed, raceAbort, resolveRoute, type RouteCfg } from "./router-helpers.ts";
import type {
  AiSettings,
  Clock,
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

export { ALERT_CODES };

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
   * O provedor `fake` só é usado se este flag for `true` E o ambiente não for produção (ver env.ts).
   * Default false. Composição de produção NUNCA passa `allowFake` (e NODE_ENV=production recusa mesmo assim).
   */
  allowFake?: boolean;
  /** Só para teste: sobrescreve a leitura de NODE_ENV do processo. */
  env?: EnvLike;
};

export function createRouter(deps: RouterDeps) {
  const { clock } = deps;
  const fakeAllowed = () => deps.allowFake === true && !isProductionEnv(deps.env ?? readProcessEnv());
  const resolve = (settings: AiSettings, route: Route) => resolveRoute(deps.providers, fakeAllowed, settings, route);

  async function run<T>(task: Task<T>, opts: RunOptions): Promise<RunResult<T>> {
    const external = opts.signal;
    if (external?.aborted || !(opts.budgetMs > 0)) throw new AiError("aborted");
    const t0 = clock.now();
    const settings = await closed(() => deps.settings.load(), "settings_unavailable");
    const prompt = await closed(() => deps.prompts.get(task.promptKey), "prompt_unavailable");
    if (external?.aborted) throw new AiError("aborted");

    // Foto NÃO escala para `strong`: o modelo forte pode não aceitar imagem (o padrão do .env.example é só texto), e
    // não existe rota forte de visão em `ai_settings`. Baixa confiança na visão = aceita com `lowConfidence` + revisão.
    const chain: Route[] = task.needsVision ? ["vision"] : ["cheap", "strong"];
    const maxAttempts = 1 + Math.min(settings.maxEscalations, chain.length - 1);

    // Resolve TODA a cadeia antes da 1ª tentativa: se a rota de escalada não está configurada, falha fechado
    // sem rede e sem decisão (evita `escalated` órfão e resultado pago perdido).
    const resolved = chain.slice(0, maxAttempts).map((route) => resolve(settings, route));
    const usage: Usage = {};
    const addUsage = (u: Usage | undefined) => {
      if (!u) return;
      for (const k of ["promptTokens", "completionTokens", "totalTokens", "costUsdMicros"] as const) {
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
      let attemptUsage: Usage | undefined;
      let value: T | undefined;
      let evaluation: Evaluation | undefined;
      try {
        const resp = await raceAbort(
          Promise.resolve().then(() => provider.complete(task.buildRequest(prompt), { signal: controller.signal })),
          controller.signal,
        );
        if (external?.aborted) throw new AiError("aborted");
        addUsage(resp.usage);
        attemptUsage = resp.usage;
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
      const base = { deps, task, settings, prompt, provider, route, cfgProvider: cfg.provider, attempt: i + 1, startedAt, finishedAt, usage: attemptUsage };

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
