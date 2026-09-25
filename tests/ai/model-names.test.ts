import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRS = ["lib", "features", "supabase/functions", "app", "components"];
const MODEL_WORDS = /\b(deepseek|glm|gpt|gpt-\d\w*|claude|gemini|llama|mistral|qwen|anthropic|openai|sonnet|opus|haiku)\b/i;

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
  it("os modelos vêm só de AI_MODEL_* (o adapter não referencia outra variável de modelo)", () => {
    const src = readFileSync(join(ROOT, "supabase/functions/_shared/ai/openrouter.ts"), "utf8");
    expect(src).toContain("AI_MODEL_CHEAP");
    expect(src).not.toMatch(/process\.env|Deno\.env/);
  });
});
