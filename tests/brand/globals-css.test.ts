import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { stateColors, tokens } from "@/lib/brand/tokens";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const cssVar = (name: string) =>
  new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim().toLowerCase();

it("cores do globals.css batem com tokens.ts", () => {
  for (const [name, value] of Object.entries(tokens.color)) {
    expect(cssVar(name), name).toBe(value.toLowerCase());
  }
});

it("raios do globals.css batem com tokens.ts", () => {
  expect(cssVar("radius-card")).toBe(`${tokens.radius.card}px`);
  expect(cssVar("radius-botao")).toBe(`${tokens.radius.botao}px`);
  expect(cssVar("radius-campo")).toBe(`${tokens.radius.campo}px`);
});

it("cores de estado do globals.css batem com stateColors", () => {
  for (const [name, value] of Object.entries(stateColors)) {
    expect(cssVar(name), name).toBe(value.toLowerCase());
  }
});

it("componentes de escola não usam hex solto", () => {
  const dir = join(process.cwd(), "components/schools");
  for (const f of readdirSync(dir)) {
    expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  }
});
