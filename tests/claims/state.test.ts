import { describe, expect, it } from "vitest";

import { CLAIM_ORACLE } from "../db/claim-fixtures";
import {
  CLAIM_ACTORS,
  CLAIM_STATUSES,
  CLAIM_TRANSITIONS,
  InvalidClaimTransitionError,
  OPEN_CLAIM_STATUSES,
  assertTransition,
  canTransition,
} from "@/features/claims/state";

const triples = CLAIM_ACTORS.flatMap((a) => CLAIM_STATUSES.flatMap((f) => CLAIM_STATUSES.map((t) => [a, f, t] as const)));

describe("matriz de reivindicação (108 triplas)", () => {
  it("tem 6 x 6 x 3 triplas", () => expect(triples).toHaveLength(108));

  it.each(triples)("%s: %s -> %s", (actor, from, to) => {
    const allowed = CLAIM_ORACLE[actor].some(([f, t]) => f === from && t === to);
    expect(canTransition(actor, from, to)).toBe(allowed);
    if (allowed) expect(() => assertTransition(actor, from, to)).not.toThrow();
    else {
      expect(() => assertTransition(actor, from, to)).toThrow(InvalidClaimTransitionError);
      expect(() => assertTransition(actor, from, to)).toThrow(`Transição de reivindicação inválida: ${from} -> ${to} (${actor})`);
    }
  });

  it("a tabela TS tem exatamente as entradas do oráculo (sem duplicata)", () => {
    for (const actor of CLAIM_ACTORS) {
      expect([...CLAIM_TRANSITIONS[actor]].map((p) => p.join(">")).sort()).toEqual(
        CLAIM_ORACLE[actor].map((p) => p.join(">")).sort(),
      );
    }
  });

  it("approved e rejected são terminais para todos os atores", () => {
    for (const actor of CLAIM_ACTORS)
      for (const from of ["approved", "rejected"] as const)
        for (const to of CLAIM_STATUSES) expect(canTransition(actor, from, to)).toBe(false);
  });

  it("estados abertos são os quatro não terminais", () => {
    expect([...OPEN_CLAIM_STATUSES].sort()).toEqual(["awaiting_verification", "insufficient_evidence", "submitted", "token_expired"]);
  });
});
