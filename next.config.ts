import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const dsn = process.env.SENTRY_DSN;

const baseConfig: NextConfig = {
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
