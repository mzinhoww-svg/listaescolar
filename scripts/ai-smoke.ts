// Smoke MANUAL do adapter OpenRouter (só para o humano; custa dinheiro; não roda no CI nem pelos agentes).
// Uso: OPENROUTER_KEY=... AI_MODEL_CHEAP=... [AI_MODEL_VISION=...] pnpm tsx scripts/ai-smoke.ts [arquivo.pdf|.png|.jpg]
// Confirma: (1) chat/completions com JSON, (2) imagem como data URL, (3) PDF como parte `file` (formato vigente do OpenRouter).
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { OpenRouterAdapter, loadModelsFromEnv } from "../supabase/functions/_shared/ai/openrouter";

const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function main() {
  const apiKey = process.env.OPENROUTER_KEY;
  const models = loadModelsFromEnv(process.env);
  if (!apiKey || !models.cheap) throw new Error("Defina OPENROUTER_KEY e AI_MODEL_CHEAP.");
  const cheap = new OpenRouterAdapter({ apiKey, model: models.cheap });
  const r = await cheap.complete(
    { messages: [{ role: "user", content: 'Responda somente com o JSON {"ok": true}.' }], responseFormat: "json", maxTokens: 50 },
    {},
  );
  console.log("texto: ok, modelo:", r.model, "latência(ms):", r.latencyMs, "tokens:", r.usage?.totalTokens ?? "n/d");

  const file = process.argv[2];
  if (!file) return;
  if (!models.vision) throw new Error("Defina AI_MODEL_VISION para testar imagem/PDF.");
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error("Extensão não suportada.");
  const vision = new OpenRouterAdapter({ apiKey, model: models.vision });
  const o = await vision.extractText({ bytes: new Uint8Array(readFileSync(file)), mime }, {});
  console.log("visão: ok, modelo:", o.model, "caracteres:", o.text.length, "latência(ms):", o.latencyMs); // não imprime o conteúdo
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : "erro");
  process.exit(1);
});
