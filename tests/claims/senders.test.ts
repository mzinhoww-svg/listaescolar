import { describe, expect, it, vi } from "vitest";

import { ConsoleClaimTokenSender, getClaimTokenSender } from "@/features/claims/senders";

const DEMO = { isDemo: true };

describe("getClaimTokenSender", () => {
  it("console só com a flag, APP_ENV local/development e escola demo", () => {
    for (const app of ["local", "development"]) {
      expect(getClaimTokenSender({ DEMO_CLAIM_DELIVERY: "1", APP_ENV: app }, DEMO)).toBeInstanceOf(ConsoleClaimTokenSender);
    }
  });
  it("VERCEL_ENV vazio ou development ainda vale", () => {
    for (const v of ["", "development"]) {
      expect(getClaimTokenSender({ DEMO_CLAIM_DELIVERY: "1", APP_ENV: "local", VERCEL_ENV: v }, DEMO)).toBeInstanceOf(ConsoleClaimTokenSender);
    }
  });
  it.each([
    ["sem flag", { APP_ENV: "local" }, DEMO],
    ["flag 0", { DEMO_CLAIM_DELIVERY: "0", APP_ENV: "local" }, DEMO],
    ["sem APP_ENV", { DEMO_CLAIM_DELIVERY: "1" }, DEMO],
    ["preview", { DEMO_CLAIM_DELIVERY: "1", APP_ENV: "preview" }, DEMO],
    ["staging", { DEMO_CLAIM_DELIVERY: "1", APP_ENV: "staging" }, DEMO],
    ["production", { DEMO_CLAIM_DELIVERY: "1", APP_ENV: "production" }, DEMO],
    ["VERCEL_ENV preview", { DEMO_CLAIM_DELIVERY: "1", APP_ENV: "local", VERCEL_ENV: "preview" }, DEMO],
    ["VERCEL_ENV production", { DEMO_CLAIM_DELIVERY: "1", APP_ENV: "local", VERCEL_ENV: "production" }, DEMO],
    ["escola real", { DEMO_CLAIM_DELIVERY: "1", APP_ENV: "local" }, { isDemo: false }],
  ])("sem provedor: %s", (_n, env, school) => expect(getClaimTokenSender(env, school)).toBeNull());

  it("o console imprime o link e o código só no log do servidor", async () => {
    const log = vi.fn();
    const s = new ConsoleClaimTokenSender(log);
    await s.sendEmailLink("x@y.invalid", "http://localhost/l?token=abc", { schoolName: "E", inep: "51999801" });
    await s.sendWhatsappCode("5565999990001", "123456", { schoolName: "E", inep: "51999801" });
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.map((c) => String(c[0])).join("\n")).not.toMatch(/x@y\.invalid|5565999990001/);
  });
});
