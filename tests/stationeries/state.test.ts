import { describe, expect, it } from "vitest";

import {
  canTransition,
  REASON_REQUIRED_STATUSES,
  STATIONERY_STATUSES,
  TRANSITION_ACTORS,
  transitionTable,
  type StationeryStatus,
} from "@/features/stationeries/state";

const STAFF: [StationeryStatus, StationeryStatus][] = [
  ["under_review", "approved"],
  ["under_review", "rejected"],
  ["active", "paused"],
  ["approved", "paused"],
  ["paused", "active"],
  ["suspended", "paused"],
  ["signup", "suspended"],
  ["accreditation", "suspended"],
  ["under_review", "suspended"],
  ["approved", "suspended"],
  ["active", "suspended"],
  ["paused", "suspended"],
];
const OWNER: [StationeryStatus, StationeryStatus][] = [
  ["signup", "accreditation"],
  ["accreditation", "under_review"],
  ["approved", "active"],
  ["active", "paused"],
  ["paused", "active"],
  ["rejected", "accreditation"],
];

describe("matriz de transições (8x8 por ator)", () => {
  const cases = TRANSITION_ACTORS.flatMap((actor) =>
    STATIONERY_STATUSES.flatMap((from) =>
      STATIONERY_STATUSES.map((to) => {
        const list = actor === "owner" ? OWNER : STAFF;
        const expected = list.some(([f, t]) => f === from && t === to);
        return { actor, from, to, expected };
      }),
    ),
  );
  it.each(cases)("$actor: $from -> $to = $expected", ({ actor, from, to, expected }) => {
    expect(canTransition(actor, from, to)).toBe(expected);
  });

  it("admin e system têm a mesma matriz", () => {
    expect(transitionTable.admin).toEqual(transitionTable.system);
  });
  it("estados terminais para a equipe: rejected não vai a suspended nem volta", () => {
    expect(canTransition("admin", "rejected", "suspended")).toBe(false);
    expect(canTransition("admin", "rejected", "accreditation")).toBe(false);
  });
  it("motivo obrigatório em rejected e suspended", () => {
    expect([...REASON_REQUIRED_STATUSES].sort()).toEqual(["rejected", "suspended"]);
  });
});
