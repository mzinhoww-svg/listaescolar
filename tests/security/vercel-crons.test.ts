import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

describe("vercel.json (revisão S19, I2)", () => {
  const crons = (JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] }).crons;
  it("todo route handler em app/api/cron/* está agendado", () => {
    const dirs = readdirSync(resolve(ROOT, "app/api/cron"), { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const d of dirs) expect(crons.map((c) => c.path), d.name).toContain(`/api/cron/${d.name}`);
  });
  it("health-check roda pelo menos diariamente (plano Hobby só agenda diário)", () => {
    expect(crons.find((c) => c.path === "/api/cron/health-check")?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});
