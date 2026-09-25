import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const dsn = process.env.SENTRY_DSN;

const baseConfig: NextConfig = {
  // Padrão do Next é 1 MB: o upload de CSV do INEP (S03) e a planilha de catálogo (S13, até 2 MB) cabem em 4 MB.
  // Maiores: `pnpm import:inep`.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
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
