// Composição do pipeline de IA a partir do ambiente. Único lugar que decide `allowFake`.
// Produção NUNCA passa `allowFake`: o `fake` exige FAKE_AI_SCRIPT + APP_ENV explícito não produtivo + não-produção.
import { z } from "zod";
import { AiError, type AiErrorCode } from "./errors.ts";
import { type EnvLike, explicitNonProduction } from "./env.ts";
import { FakeProvider, type FakeStep } from "./fake.ts";
import { loadModelsFromEnv, openRouterProviderFactory, type FetchLike } from "./openrouter.ts";
import { createPromptRegistry } from "./prompts.ts";
import { createRpcRecorder } from "./recorder.ts";
import { createRouter } from "./router.ts";
import { createSettingsProvider, type RpcClient } from "./settings.ts";
import { ROUTES, type Clock, type ProviderFactories, systemClock } from "./types.ts";
import { RealExtractionPipeline } from "./extraction-pipeline.ts";

export type AiEnv = EnvLike & {
  OPENROUTER_KEY?: string;
  AI_MODEL_CHEAP?: string;
  AI_MODEL_STRONG?: string;
  AI_MODEL_VISION?: string;
  FAKE_AI_SCRIPT?: string;
};

const ERROR_CODES = [
  "ai_not_configured",
  "vision_model_missing",
  "provider_timeout",
  "provider_error",
  "invalid_output",
  "low_confidence",
  "aborted",
] as const satisfies readonly AiErrorCode[];
const stepSchema = z.object({
  json: z.unknown().optional(),
  text: z.string().max(2_000_000).optional(),
  delayMs: z.number().int().min(0).max(120_000).optional(),
  usage: z
    .object({
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    })
    .optional(),
  hang: z.boolean().optional(),
  fail: z
    .object({
      code: z.enum(ERROR_CODES),
      transient: z.boolean().optional(),
      status: z.number().int().optional(),
    })
    .optional(),
});
const scriptSchema = z.object({
  cheap: z.array(stepSchema).optional(),
  strong: z.array(stepSchema).optional(),
  vision: z.array(stepSchema).optional(),
});

/** FAKE_AI_SCRIPT = JSON `{ "cheap": [passos], "strong": [passos], "vision": [passos] }`; inválido = ausente. */
export function parseFakeScript(
  raw: string | undefined,
): Partial<Record<(typeof ROUTES)[number], FakeStep[]>> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = scriptSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? (parsed.data as Partial<Record<(typeof ROUTES)[number], FakeStep[]>>)
      : null;
  } catch {
    return null;
  }
}

/** O `fake` só existe com script válido, APP_ENV explícito não produtivo e fora de produção. */
export function fakeAllowedByEnv(env: AiEnv): boolean {
  return parseFakeScript(env.FAKE_AI_SCRIPT) !== null && explicitNonProduction(env);
}

/**
 * Há como chamar algum provedor? (chave + modelos barato e forte, ou fake permitido). Sem isso o envio não usa
 * pipeline ("leitura automática indisponível"). Não toca no banco.
 */
export function aiPipelineAvailable(env: AiEnv): boolean {
  const m = loadModelsFromEnv(env);
  const openrouter = !!env.OPENROUTER_KEY?.trim() && !!m.cheap && !!m.strong;
  return openrouter || fakeAllowedByEnv(env);
}

export function createAiPipeline(o: {
  env: AiEnv;
  rpc: RpcClient;
  /** Orçamento padrão de uma extração (o chamador pode sobrescrever por chamada). */
  budgetMs: number;
  clock?: Clock;
  fetchImpl?: FetchLike;
}): RealExtractionPipeline {
  const clock = o.clock ?? systemClock;
  const providers: ProviderFactories = {
    openrouter: openRouterProviderFactory({
      apiKey: o.env.OPENROUTER_KEY,
      models: loadModelsFromEnv(o.env),
      fetchImpl: o.fetchImpl,
    }),
  };
  const allowFake = fakeAllowedByEnv(o.env);
  if (allowFake) {
    const script = parseFakeScript(o.env.FAKE_AI_SCRIPT) ?? {};
    providers.fake = (route) => {
      const steps = script[route];
      if (!steps) throw new AiError("ai_not_configured", { detail: "fake_route_missing" });
      return new FakeProvider(steps, { model: `fake-${route}`, clock });
    };
  }
  const settings = createSettingsProvider({ rpc: o.rpc, clock });
  const router = createRouter({
    providers,
    settings,
    prompts: createPromptRegistry({ rpc: o.rpc, clock }),
    recorder: createRpcRecorder(o.rpc),
    clock,
    allowFake,
    env: { NODE_ENV: o.env.NODE_ENV, APP_ENV: o.env.APP_ENV, VERCEL_ENV: o.env.VERCEL_ENV },
  });
  return new RealExtractionPipeline({ router, settings, budgetMs: o.budgetMs });
}
