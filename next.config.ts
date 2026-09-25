import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const dsn = process.env.SENTRY_DSN;

const baseConfig: NextConfig = {
  // Limite de corpo das Server Actions (padrão do Next: 1 MB): envio de lista (S07) aceita PDF/foto de até 10 MB
  // (11 MB cobre o multipart); o CSV do INEP (S03) fica em 4 MB na própria action. Maiores: `pnpm import:inep`.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  ...(dsn ? { env: { NEXT_PUBLIC_SENTRY_DSN: dsn } } : {}),
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
