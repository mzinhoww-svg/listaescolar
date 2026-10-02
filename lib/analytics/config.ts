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
 * Caminho do proxy (Route Handler `app/ingest`). O cliente nunca conhece o host do PostHog. Os endpoints são chamados SEM barra
 * final (`/i/v0/e`, `/batch`): com barra, o Next redirecionaria (308) e desligar isso vale para o site inteiro.
 */
export const INGEST_PATH = "/ingest";

/**
 * Cookie de ESTADO do consentimento (revisão de segurança I3): `granted` e nada mais, sem identificador. O cliente o
 * grava ao aceitar e o apaga ao recusar/revogar; o servidor só emite eventos que nascem de ação do usuário
 * (`USER_ACTION_EVENTS`) se ele existir. Sem ele, esses eventos não saem, porque o navegador ainda não aceitou a medição.
 */
export const CONSENT_COOKIE = "lc_analytics_consent";
/** Eventos de servidor que nascem de uma ação da pessoa (não de um fato de negócio): exigem o consentimento. */
export const USER_ACTION_EVENTS: readonly string[] = ["login_completed", "purchase_clicked"];
/** Validade do cookie de estado (renovada a cada visita com aceite). */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type AppEnv = "production" | "preview" | "staging" | "local";
export type AnalyticsConfig =
  | { enabled: false }
  | { enabled: true; key: string; host: string; appEnv: AppEnv };

import { isAllowedHost } from "../../supabase/functions/_shared/analytics/host";

type Env = Record<string, string | undefined>;

const DEFAULT_HOST = "https://us.i.posthog.com";
const APP_ENVS: readonly AppEnv[] = ["production", "preview", "staging", "local"];

/** Regra única (compartilhada com o `ocr-worker`): https sempre; http só em loopback. */
export { isAllowedHost };

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
