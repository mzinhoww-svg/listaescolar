import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { tokens } from "@/lib/brand/tokens";

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
