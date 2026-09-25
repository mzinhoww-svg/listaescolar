import { describe, expect, it } from "vitest";

import { isFinalPhase, phaseOf, pollDelayMs } from "@/features/submissions/status-model";

const p = (status: string, jobStatus: string | null = null, pipelineAvailable = true) => ({ status, jobStatus, pipelineAvailable });

describe("pollDelayMs", () => {
  it("cresce e respeita o teto de 15 s", () => {
    const d = [0, 1, 2, 3, 4, 5, 6, 7, 8, 20].map(pollDelayMs);
    expect(d[0]).toBe(1500);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]!);
    expect(d.at(-1)).toBe(15_000);
  });
});

describe("phaseOf", () => {
  it.each([
    ["processing", "running", true, "reading"],
    ["processing_async", "queued", true, "reading"],
    ["processing_async", "retrying", true, "reading"],
    ["processing_async", "queued", false, "unavailable"],
    ["review_needed", "succeeded", true, "ready"],
    ["review_needed", null, false, "ready"],
    ["rejected", null, true, "failed"],
    ["processing_async", "dead", true, "failed"],
  ] as const)("%s/%s (pipeline %s) -> %s", (status, job, avail, expected) => {
    expect(phaseOf(p(status, job, avail))).toBe(expected);
  });
  it("só `reading` continua consultando", () => {
    expect(isFinalPhase("reading")).toBe(false);
    for (const f of ["ready", "failed", "unavailable"] as const) expect(isFinalPhase(f)).toBe(true);
  });
});
