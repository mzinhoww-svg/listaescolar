/**
 * Configuração da instrumentação de produto (ADR-007, `docs/tracking-plan.md`).
 * Sem `NEXT_PUBLIC_POSTHOG_KEY` o módulo inteiro fica desligado: nenhum `fetch`, nenhum nó no DOM.
 */

/**
 * Ruling da S28 (consentimento): nada sai do navegador antes do aceite. Eventos anteriores à escolha ficam só numa
 * fila em memória, descartável, e só são liberados se o aceite vier na mesma página. Mudar para `true` exige nova
 * decisão do humano sobre o ADR-007.
 */
export const SEND_BEFORE_CONSENT = false as const;

/**
 * Caminho do proxy (rewrite do Next). O cliente nunca conhece o host do PostHog. Os endpoints são chamados SEM barra
 * final (`/i/v0/e`, `/batch`): com barra, o Next redirecionaria (308) e desligar isso vale para o site inteiro.
 */
export const INGEST_PATH = "/ingest";

export type AppEnv = "production" | "preview" | "staging" | "local";
export type AnalyticsConfig =
  | { enabled: false }
  | { enabled: true; key: string; host: string; appEnv: AppEnv };

type Env = Record<string, string | undefined>;

const DEFAULT_HOST = "https://us.i.posthog.com";
const APP_ENVS: readonly AppEnv[] = ["production", "preview", "staging", "local"];

/** https sempre; http só em loopback (receptor local de E2E). */
export function isAllowedHost(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

function deriveAppEnv(env: Env): AppEnv {
  const raw = env.APP_ENV || env.NEXT_PUBLIC_APP_ENV || env.VERCEL_ENV;
  // Desconhecido (inclusive `development` da Vercel) cai em "local": `is_internal = true`, fora dos funis de produção.
  return (APP_ENVS as readonly string[]).includes(raw ?? "") ? (raw as AppEnv) : "local";
}

/** Lê só variáveis; sem chave (ou host inválido) devolve `{ enabled: false }`. */
export function getAnalyticsConfig(env: Env): AnalyticsConfig {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return { enabled: false };
  const host = (env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_HOST).replace(/\/+$/, "");
  if (!isAllowedHost(host)) return { enabled: false };
  return { enabled: true, key, host, appEnv: deriveAppEnv(env) };
}

/** Referências estáticas para o Next inlinar `NEXT_PUBLIC_*` no cliente. */
export function getAnalyticsConfigFromProcess(): AnalyticsConfig {
  return getAnalyticsConfig({
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    APP_ENV: process.env.APP_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}
