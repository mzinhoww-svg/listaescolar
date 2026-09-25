import { describe, expect, it } from "vitest";

import {
  DEMO_CLAIM_PLANS,
  assertExistingClaimMatches,
  assertTestAccount,
  parseSeedArgs,
} from "@/scripts/seed-demo-claims-lib";

describe("seed-demo-claims-lib", () => {
  it("nunca planeja aprovação e cobre pendente e recusada com motivo", () => {
    expect(DEMO_CLAIM_PLANS.map((p) => p.expected).sort()).toEqual(["awaiting_verification", "rejected"]);
    for (const p of DEMO_CLAIM_PLANS) {
      expect((p.expected as string) === "approved").toBe(false);
      expect(p.inep).toMatch(/^9900100\d$/);
      if (p.expected === "rejected") expect(p.rejectionReason?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it("não aceita opções (não há flag de produção)", () => {
    expect(parseSeedArgs([])).toEqual({ allowProduction: false });
    expect(() => parseSeedArgs(["--i-know-this-is-production"])).toThrow(/Opção desconhecida/);
  });

  it("estado existente que bate com o plano passa; divergente falha com instrução", () => {
    const [pending, rejected] = DEMO_CLAIM_PLANS;
    expect(() => assertExistingClaimMatches(pending!, { status: "awaiting_verification", evidenceCount: 1, decisionReason: null })).not.toThrow();
    expect(() => assertExistingClaimMatches(rejected!, { status: "rejected", evidenceCount: 1, decisionReason: rejected!.rejectionReason ?? null })).not.toThrow();
    expect(() => assertExistingClaimMatches(pending!, { status: "approved", evidenceCount: 1, decisionReason: null })).toThrow(/divergente.*db:reset/);
    expect(() => assertExistingClaimMatches(pending!, { status: "awaiting_verification", evidenceCount: 0, decisionReason: null })).toThrow(/0 arquivos/);
    expect(() => assertExistingClaimMatches(rejected!, { status: "rejected", evidenceCount: 1, decisionReason: "outro" })).toThrow(/motivo/);
  });

  it("só conta de teste", () => {
    expect(() => assertTestAccount("parent@listacerta.test")).not.toThrow();
    expect(() => assertTestAccount("pessoa@gmail.com")).toThrow(/não é de teste/);
  });
});
