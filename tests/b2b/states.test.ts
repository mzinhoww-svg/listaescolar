import { describe, expect, it } from "vitest";

import {
  canTransitionPartner,
  environmentAllowed,
  isTerminalPartnerStatus,
  keysRevokedOnTransition,
  PARTNER_STATUSES,
  requiresLiveLimits,
  requiresReason,
  requiresSandboxLimits,
} from "@/features/b2b/states";

const ALLOWED = new Set([
  "pending>sandbox", "pending>active", "pending>rejected",
  "sandbox>active", "sandbox>suspended",
  "active>sandbox", "active>suspended",
  "suspended>sandbox", "suspended>active",
]);

describe("canTransitionPartner", () => {
  for (const from of PARTNER_STATUSES) {
    for (const to of PARTNER_STATUSES) {
      const expected = ALLOWED.has(`${from}>${to}`);
      it(`${from} -> ${to} = ${expected}`, () => {
        expect(canTransitionPartner(from, to)).toBe(expected);
      });
    }
  }
});

describe("isTerminalPartnerStatus", () => {
  it("só rejected é terminal", () => {
    expect(isTerminalPartnerStatus("rejected")).toBe(true);
    for (const s of PARTNER_STATUSES.filter((x) => x !== "rejected")) expect(isTerminalPartnerStatus(s)).toBe(false);
  });
});

describe("requisitos por destino", () => {
  it("sandbox e active exigem limites de sandbox", () => {
    expect(requiresSandboxLimits("sandbox")).toBe(true);
    expect(requiresSandboxLimits("active")).toBe(true);
    expect(requiresSandboxLimits("pending")).toBe(false);
    expect(requiresSandboxLimits("suspended")).toBe(false);
    expect(requiresSandboxLimits("rejected")).toBe(false);
  });
  it("só active exige limites de produção", () => {
    expect(requiresLiveLimits("active")).toBe(true);
    for (const s of PARTNER_STATUSES.filter((x) => x !== "active")) expect(requiresLiveLimits(s)).toBe(false);
  });
  it("rejected e suspended exigem motivo", () => {
    expect(requiresReason("rejected")).toBe(true);
    expect(requiresReason("suspended")).toBe(true);
    for (const s of ["pending", "sandbox", "active"] as const) expect(requiresReason(s)).toBe(false);
  });
});

describe("environmentAllowed", () => {
  it("test: sandbox ou active", () => {
    expect(environmentAllowed("test", "sandbox")).toBe(true);
    expect(environmentAllowed("test", "active")).toBe(true);
    for (const s of ["pending", "rejected", "suspended"] as const) expect(environmentAllowed("test", s)).toBe(false);
  });
  it("live: só active", () => {
    expect(environmentAllowed("live", "active")).toBe(true);
    for (const s of ["pending", "sandbox", "rejected", "suspended"] as const) expect(environmentAllowed("live", s)).toBe(false);
  });
});

describe("keysRevokedOnTransition", () => {
  it("suspender ou rejeitar revoga todas", () => {
    expect(keysRevokedOnTransition("active", "suspended")).toBe("all");
    expect(keysRevokedOnTransition("sandbox", "suspended")).toBe("all");
    expect(keysRevokedOnTransition("pending", "rejected")).toBe("all");
  });
  it("active -> sandbox revoga só live", () => {
    expect(keysRevokedOnTransition("active", "sandbox")).toBe("live");
  });
  it("demais transições não revogam nada aqui", () => {
    expect(keysRevokedOnTransition("pending", "sandbox")).toBeNull();
    expect(keysRevokedOnTransition("suspended", "active")).toBeNull();
  });
});
