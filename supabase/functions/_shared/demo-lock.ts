// Trava do pipeline de demonstração. Sem imports (Deno e Node). O demo só liga com DEMO_PIPELINE=1 E um
// APP_ENV explícito de ambiente não produtivo; APP_ENV ausente ou desconhecido = desligado.
export const DEMO_ALLOWED_ENVS = ["local", "development", "preview", "staging"] as const;

export type DemoEnv = { DEMO_PIPELINE?: string; APP_ENV?: string };

export function demoEnabled(env: DemoEnv): boolean {
  return env.DEMO_PIPELINE === "1" && (DEMO_ALLOWED_ENVS as readonly string[]).includes(env.APP_ENV ?? "");
}

/** Mensagem de configuração inválida (DEMO_PIPELINE=1 pedido, mas o ambiente não permite), ou `null`. */
export function demoConfigError(env: DemoEnv): string | null {
  if (env.DEMO_PIPELINE !== "1" || demoEnabled(env)) return null;
  return `DEMO_PIPELINE=1 exige APP_ENV explícito em {${DEMO_ALLOWED_ENVS.join(", ")}}`;
}

/** DEMO_SLOW_MS: número finito >= 0 (teto 120 s); qualquer outra coisa cai no padrão. */
export function parseSlowMs(raw: string | undefined, fallback = 15_000): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 120_000) : fallback;
}
