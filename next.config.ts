import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { getAnalyticsConfig } from "./lib/analytics/config";
import { robotsHeaders } from "./lib/robots-header";

const dsn = process.env.SENTRY_DSN;
const analytics = getAnalyticsConfig(process.env);
// Ambiente que o navegador enxerga (marca `app_env` e `is_internal` nos eventos); APP_ENV não é público.
const publicAppEnv = process.env.APP_ENV || (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview" ? process.env.VERCEL_ENV : "local");

const baseConfig: NextConfig = {
  // Limite ÚNICO de corpo das Server Actions (padrão do Next: 1 MB): 4 MB, abaixo do teto de 4,5 MB da Vercel.
  // Vale para o envio de lista (S07), o CSV do INEP (S03) e a planilha de catálogo (S13, até 2 MB).
  // Maiores: `pnpm import:inep`.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Previews e qualquer ambiente fora da produção da Vercel nunca são indexados (X-Robots-Tag: noindex).
  async headers() {
    return robotsHeaders({ VERCEL_ENV: process.env.VERCEL_ENV, SITE_INDEXING: process.env.SITE_INDEXING });
  },
  // Proxy de medição (ADR-007): só existe com NEXT_PUBLIC_POSTHOG_KEY. É rewrite, então o cliente só conhece
  // `/ingest`; o cliente envia sem cookie (`credentials: "omit"`) e `proxy.ts` deixa `/ingest` fora da sessão.
  async rewrites() {
    return analytics.enabled ? [{ source: "/ingest/:path*", destination: `${analytics.host}/:path*` }] : [];
  },
  env: { NEXT_PUBLIC_APP_ENV: publicAppEnv, ...(dsn ? { NEXT_PUBLIC_SENTRY_DSN: dsn } : {}) },
};

// Sem DSN, Sentry fica totalmente fora do build (sem token, sem rede).
// Com DSN, upload de source maps só ocorre se SENTRY_AUTH_TOKEN existir.
const nextConfig: NextConfig = dsn
  ? withSentryConfig(baseConfig, {
      silent: true,
      telemetry: false,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    })
  : baseConfig;

export default nextConfig;
