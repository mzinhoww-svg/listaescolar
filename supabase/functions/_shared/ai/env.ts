// Detecção de produção para o provedor `fake`. TypeScript puro (Deno e Node).
export type EnvLike = { NODE_ENV?: string; APP_ENV?: string; VERCEL_ENV?: string };

/** Mesma lista do demo (`demo-lock.ts`): ambientes onde dados e provedores de demonstração podem existir. */
export const NON_PRODUCTION_ENVS = ["local", "development", "preview", "staging"] as const;

const t = (v: string | undefined) => (v ?? "").trim();

/**
 * Produção = APP_ENV/VERCEL_ENV `production`, ou NODE_ENV `production` sem um APP_ENV explícito não produtivo.
 * (`next build && next start` local tem NODE_ENV=production; só APP_ENV=local|... explícito o distingue da produção.)
 */
export function isProductionEnv(env: EnvLike): boolean {
  if (t(env.APP_ENV) === "production" || t(env.VERCEL_ENV) === "production") return true;
  if (t(env.NODE_ENV) === "production")
    return !(NON_PRODUCTION_ENVS as readonly string[]).includes(t(env.APP_ENV));
  return false;
}

export function explicitNonProduction(env: EnvLike): boolean {
  return (
    (NON_PRODUCTION_ENVS as readonly string[]).includes(t(env.APP_ENV)) && !isProductionEnv(env)
  );
}

export function readProcessEnv(): EnvLike {
  try {
    const e = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env;
    return { NODE_ENV: e?.NODE_ENV, APP_ENV: e?.APP_ENV, VERCEL_ENV: e?.VERCEL_ENV };
  } catch {
    return {};
  }
}
