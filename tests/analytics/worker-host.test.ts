// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isAllowedHost as appRule } from "@/lib/analytics/config";
import { isAllowedHost, workerCaptureConfig } from "../../supabase/functions/_shared/analytics/host";

describe("ocr-worker: POSTHOG_HOST (revisão M5)", () => {
  it("app e worker usam exatamente a mesma regra", () => {
    expect(appRule).toBe(isAllowedHost);
  });

  it("host https ou loopback http vale; o resto desliga a medição", () => {
    expect(workerCaptureConfig({ key: "phc_x", host: "https://eu.i.posthog.com/" })).toMatchObject({ host: "https://eu.i.posthog.com" });
    expect(workerCaptureConfig({ key: "phc_x", host: "http://127.0.0.1:54999" })).not.toBeNull();
    for (const host of ["http://evil.example", "ftp://x", "javascript:alert(1)", "eu.i.posthog.com", "http://localhost.evil.example"]) {
      expect(workerCaptureConfig({ key: "phc_x", host }), host).toBeNull();
    }
  });

  it("sem chave não envia; sem host usa o padrão; ambiente desconhecido vira local", () => {
    expect(workerCaptureConfig({ host: "https://eu.i.posthog.com" })).toBeNull();
    expect(workerCaptureConfig({ key: "  " })).toBeNull();
    expect(workerCaptureConfig({ key: "phc_x" })).toMatchObject({ host: "https://us.i.posthog.com", appEnv: "local" });
    expect(workerCaptureConfig({ key: "phc_x", appEnv: "production" })?.appEnv).toBe("production");
    expect(workerCaptureConfig({ key: "phc_x", appEnv: "development" })?.appEnv).toBe("local");
  });
});
