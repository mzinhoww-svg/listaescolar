import { describe, expect, it } from "vitest";

import {
  canTransition,
  isTerminal,
  LEAD_ACTORS,
  LEAD_STATUSES,
  leadTransitionTable,
  OPEN_LEAD_STATUSES,
  type LeadActor,
  type LeadStatus,
} from "@/features/leads/state";

const OPEN = ["received", "viewed", "in_progress", "quote_sent", "awaiting_customer"] as const;
const TERMINAL = ["converted", "declined", "expired", "cancelled"] as const;

// Oráculo escrito à mão a partir do PLAN (independente da implementação).
const ALLOWED: Record<LeadActor, Set<string>> = {
  stationery: new Set([
    "received>viewed",
    ...OPEN.flatMap((f) =>
      (["in_progress", "quote_sent", "awaiting_customer", "converted", "declined"] as const)
        .filter((t) => t !== f)
        .map((t) => `${f}>${t}`),
    ),
  ]),
  parent: new Set(OPEN.map((f) => `${f}>cancelled`)),
  admin: new Set(OPEN.map((f) => `${f}>cancelled`)),
  system: new Set(OPEN.map((f) => `${f}>expired`)),
};

describe("estados do lead", () => {
  it("tem os 9 estados e 4 atores", () => {
    expect([...LEAD_STATUSES].sort()).toEqual([...OPEN, ...TERMINAL].sort());
    expect([...LEAD_ACTORS].sort()).toEqual(["admin", "parent", "stationery", "system"]);
    expect([...OPEN_LEAD_STATUSES]).toEqual([...OPEN]);
  });

  it("isTerminal", () => {
    for (const s of LEAD_STATUSES) expect(isTerminal(s)).toBe((TERMINAL as readonly string[]).includes(s));
  });

  for (const actor of LEAD_ACTORS) {
    it(`matriz 9x9 do ator ${actor} bate com o oráculo`, () => {
      const diffs: string[] = [];
      for (const from of LEAD_STATUSES) {
        for (const to of LEAD_STATUSES) {
          const expected = ALLOWED[actor].has(`${from}>${to}`);
          if (canTransition(actor, from, to) !== expected) diffs.push(`${from}>${to}`);
        }
      }
      expect(diffs).toEqual([]);
    });
  }

  it("nunca sai de estado terminal nem vai ao mesmo estado", () => {
    for (const actor of LEAD_ACTORS) {
      for (const s of LEAD_STATUSES as readonly LeadStatus[]) {
        expect(canTransition(actor, s, s)).toBe(false);
        if (isTerminal(s)) for (const t of LEAD_STATUSES) expect(canTransition(actor, s, t)).toBe(false);
      }
    }
  });

  it("papelaria nunca cancela nem expira; pai só cancela", () => {
    for (const from of LEAD_STATUSES) {
      expect(canTransition("stationery", from, "cancelled")).toBe(false);
      expect(canTransition("stationery", from, "expired")).toBe(false);
      for (const to of LEAD_STATUSES) if (to !== "cancelled") expect(canTransition("parent", from, to)).toBe(false);
    }
  });

  it("a tabela exportada tem o mesmo número de arestas que o oráculo", () => {
    for (const actor of LEAD_ACTORS) expect(leadTransitionTable[actor].length).toBe(ALLOWED[actor].size);
  });
});
