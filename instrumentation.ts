import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Falha cedo: demonstração pedida em ambiente que não a permite derruba o boot.
    const { assertPipelineEnv } = await import("./lib/pipeline-env");
    assertPipelineEnv();
  }
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
