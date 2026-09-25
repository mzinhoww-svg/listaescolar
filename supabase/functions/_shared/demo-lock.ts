// Trava do pipeline de demonstração. Sem imports (Deno e Node). O demo só liga com DEMO_PIPELINE=1 E um
// APP_ENV explícito de ambiente não produtivo; APP_ENV ausente ou desconhecido = desligado.
export const DEMO_ALLOWED_ENVS = ["local", "development", "preview", "staging"] as const;

// VERCEL_ENV=production (Node) trava o demo mesmo com APP_ENV errado. Os valores são aparados aqui, para o Deno e o
// Node decidirem igual.
export type DemoEnv = { DEMO_PIPELINE?: string; APP_ENV?: string; VERCEL_ENV?: string };

const t = (v: string | undefined) => (v ?? "").trim();

export function demoEnabled(env: DemoEnv): boolean {
  return (
    t(env.DEMO_PIPELINE) === "1" &&
    t(env.VERCEL_ENV) !== "production" &&
    (DEMO_ALLOWED_ENVS as readonly string[]).includes(t(env.APP_ENV))
  );
}

/** Mensagem de configuração inválida (DEMO_PIPELINE=1 pedido, mas o ambiente não permite), ou `null`. */
export function demoConfigError(env: DemoEnv): string | null {
  if (t(env.DEMO_PIPELINE) !== "1" || demoEnabled(env)) return null;
  return `DEMO_PIPELINE=1 exige APP_ENV explícito em {${DEMO_ALLOWED_ENVS.join(", ")}} e VERCEL_ENV diferente de production`;
}

/** DEMO_SLOW_MS: número finito >= 0 (teto 120 s); qualquer outra coisa cai no padrão. */
export function parseSlowMs(raw: string | undefined, fallback = 15_000): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 120_000) : fallback;
}
