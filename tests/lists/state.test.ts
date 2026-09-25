import { describe, expect, it } from "vitest";

import {
  InvalidListTransitionError,
  LIST_STATES,
  LIST_TRANSITIONS,
  PUBLISH_ONLY_TARGET,
  assertTransition,
  canTransition,
  type ListState,
} from "@/features/lists/state";

// Oráculo independente, escrito à mão (o mesmo do SQL em tests/db/list-fixtures.ts).
const VALID: [ListState, ListState][] = [
  ["draft", "submitted"],
  ["submitted", "processing"],
  ["processing", "processing_async"],
  ["processing", "review_needed"],
  ["processing", "human_review"],
  ["processing", "approved"],
  ["processing", "rejected"],
  ["processing_async", "processing"],
  ["processing_async", "review_needed"],
  ["processing_async", "human_review"],
  ["processing_async", "approved"],
  ["processing_async", "rejected"],
  ["review_needed", "human_review"],
  ["review_needed", "approved"],
  ["review_needed", "rejected"],
  ["human_review", "approved"],
  ["human_review", "rejected"],
  ["approved", "published"],
  ["published", "archived"],
  ["rejected", "draft"],
];
const key = (f: string, t: string) => `${f}->${t}`;
const validKeys = new Set(VALID.map(([f, t]) => key(f, t)));

const ALL_PAIRS = LIST_STATES.flatMap((from) => LIST_STATES.map((to) => [from, to] as const));

describe("matriz de transições da lista", () => {
  it("tem 10 estados e 20 pares válidos", () => {
    expect(LIST_STATES).toHaveLength(10);
    expect(ALL_PAIRS).toHaveLength(100);
    expect(VALID).toHaveLength(20);
    expect(Object.values(LIST_TRANSITIONS).flat()).toHaveLength(20);
  });

  it.each(ALL_PAIRS)("assertTransition(%s, %s)", (from, to) => {
    if (validKeys.has(key(from, to))) {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    } else {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(InvalidListTransitionError);
      expect(() => assertTransition(from, to)).toThrow(`Transição de lista inválida: ${from} -> ${to}`);
    }
  });

  it("o erro carrega from e to", () => {
    try {
      assertTransition("archived", "draft");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidListTransitionError);
      expect((e as InvalidListTransitionError).from).toBe("archived");
      expect((e as InvalidListTransitionError).to).toBe("draft");
    }
  });

  it("archived é terminal; published só vai a archived; rejected volta a draft", () => {
    expect(LIST_TRANSITIONS.archived).toEqual([]);
    expect(LIST_TRANSITIONS.published).toEqual(["archived"]);
    expect(LIST_TRANSITIONS.rejected).toEqual(["draft"]);
  });

  it("approved -> published é válido na matriz, mas só pela função de publicação", () => {
    expect(canTransition("approved", "published")).toBe(true);
    expect(PUBLISH_ONLY_TARGET).toBe("published");
  });
});
