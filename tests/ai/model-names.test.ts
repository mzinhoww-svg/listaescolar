import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadModelsFromEnv, openRouterProviderFactory } from "@/supabase/functions/_shared/ai/openrouter.ts";

const ROOT = process.cwd();
const DIRS = ["lib", "features", "supabase/functions", "app", "components"];
const MODEL_WORDS =
  /(deepseek|\bglm|\bgpt|\bclaude|gemini|llama|mistral|qwen|anthropic|openai|sonnet|\bopus\b|haiku|grok|kimi|moonshot|x-ai|\bo[134]-?(mini|preview)?\b)/i;

function walk(dir: string, out: string[] = []): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    if (n === "node_modules" || n === ".next") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(n)) out.push(p);
  }
  return out;
}

describe("nomes de modelo nunca ficam no código", () => {
  it("o detector pega as famílias de modelo conhecidas (não é tautológico)", () => {
    for (const w of ["gpt4o", "gpt-4o-mini", "grok-4", "kimi-k2", "o3", "o3-mini", "moonshot/kimi", "x-ai/grok", "deepseek-chat", "gemini-2.5", "claude-sonnet", "llama-3", "mistral-large", "qwen3", "z-ai/glm-4.6"])
      expect(MODEL_WORDS.test(w), w).toBe(true);
    for (const w of ["Caderno", "provider", "modelo", "route", "items", "escalation"]) expect(MODEL_WORDS.test(w), w).toBe(false);
  });
  it("varredura de lib, features, supabase/functions, app e components", () => {
    const hits: string[] = [];
    for (const d of DIRS)
      for (const f of walk(join(ROOT, d)))
        readFileSync(f, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (MODEL_WORDS.test(line) && !line.includes("model-example:")) hits.push(`${f.replace(ROOT + "/", "")}:${i + 1}: ${line.trim()}`);
          });
    expect(hits).toEqual([]);
  });
  it("os modelos vêm só de AI_MODEL_*: loadModelsFromEnv ignora qualquer outra variável e a fábrica exige modelo", () => {
    const models = loadModelsFromEnv({
      AI_MODEL_CHEAP: " a ",
      AI_MODEL_STRONG: "b",
      AI_MODEL_VISION: "c",
      MODEL: "x",
      OPENROUTER_MODEL: "y",
      AI_MODEL: "z",
    });
    expect(models).toEqual({ cheap: "a", strong: "b", vision: "c" });
    expect(loadModelsFromEnv({ OPENROUTER_MODEL: "y", AI_MODEL: "z" })).toEqual({ cheap: undefined, strong: undefined, vision: undefined });
    const factory = openRouterProviderFactory({ apiKey: "k-x", models: loadModelsFromEnv({}) });
    for (const route of ["cheap", "strong", "vision"] as const) expect(() => factory(route)).toThrow();
    expect(readFileSync(join(ROOT, "supabase/functions/_shared/ai/openrouter.ts"), "utf8")).not.toMatch(/process\.env|Deno\.env/);
  });
});
