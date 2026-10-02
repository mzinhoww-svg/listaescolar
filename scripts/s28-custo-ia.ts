// S28 · Custo de IA por lista (M02). Local e sem gasto: NÃO chama provedor real (regra do repositório: só o humano roda
// `scripts/ai-smoke.ts`, que custa dinheiro). Duas partes:
//  1) PROVA DO CÁLCULO: passa N listas pelo roteador de produção (com provedor falso e custos SINTÉTICOS rotulados, que
//     não são preço de nenhum modelo), grava pelo gravador e pelo RPC reais no banco local, lê a view `ai_cost_per_entity`
//     e confere o resultado contra a conta independente. Tudo numa transação que sofre rollback (o banco fica limpo).
//  2) CUSTO REAL: só de decisões de provedor real já gravadas (`provider <> 'fake'`). Sem elas, "indisponível".
// Uso: pnpm exec tsx --conditions=react-server scripts/s28-custo-ia.ts [--lists 20]
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Client } from "pg";
import { z } from "zod";

import { costPanelStats, usdMicrosToBrlCents, type CostPanelStats } from "../features/ai-settings/cost";
import { FakeProvider, type FakeStep } from "../supabase/functions/_shared/ai/fake";
import { createRpcRecorder } from "../supabase/functions/_shared/ai/recorder";
import { createRouter } from "../supabase/functions/_shared/ai/router";
import type { AiSettings, Prompt } from "../supabase/functions/_shared/ai/types";
import { systemClock } from "../supabase/functions/_shared/ai/types";
import { DATABASE_URL } from "../tests/db/helpers";

const OUT = "docs/superpowers/evidencias/S28/depois/custo-ia.md";
const SYNTHETIC_RATE = 5; // BRL por USD, rótulo de teste: não é câmbio de mercado
const GOAL_CENTS = 50;

const settings: AiSettings = {
  confidenceThreshold: 0.8,
  itemConfidenceThreshold: 0.6,
  criticalAlerts: [],
  routes: { cheap: { provider: "fake", timeoutMs: 20_000 }, strong: { provider: "fake", timeoutMs: 40_000 }, vision: { provider: "fake", timeoutMs: 40_000 } },
  maxEscalations: 1,
  pipelineVersion: "s28-prova",
};
const prompt: Prompt = { key: "extract_list", version: 1, text: "prova", schema: {} };
const resultSchema = z.object({ items: z.array(z.object({ name: z.string().min(1), confidence: z.number().min(0).max(1) })) });

const argN = process.argv.indexOf("--lists");
const N = argN > 0 ? Math.max(1, Math.min(200, Number(process.argv[argN + 1]) || 20)) : 20;

/** Passos sintéticos de uma lista: 1 tentativa (barata, aceita) ou 2 (escalada), com ou sem custo informado. */
function stepsFor(i: number): { cheap: FakeStep[]; strong: FakeStep[]; expectedMicros: number | null } {
  const ok = (c: number) => ({ json: { items: [{ name: "Caderno", confidence: c }] } });
  const cost = (n: number) => ({ promptTokens: 1000, completionTokens: 200, totalTokens: 1200, costUsdMicros: n });
  const first = 40_000 + (i % 5) * 10_000;
  if (i % 7 === 6) return { cheap: [{ ...ok(0.95), usage: { promptTokens: 900, completionTokens: 100, totalTokens: 1000 } }], strong: [], expectedMicros: null }; // sem custo informado
  if (i % 3 === 2) {
    const second = 90_000 + (i % 4) * 5_000;
    return { cheap: [{ ...ok(0.2), usage: cost(first) }], strong: [{ ...ok(0.95), usage: cost(second) }], expectedMicros: first + second };
  }
  return { cheap: [{ ...ok(0.95), usage: cost(first) }], strong: [], expectedMicros: first };
}

async function proof(client: Client) {
  await client.query("begin");
  try {
    await client.query("set local role service_role");
    const rpc = {
      async rpc(fn: string, args?: Record<string, unknown>) {
        if (fn !== "ai_record_decision") return { data: null, error: { message: "rpc_not_allowed" } };
        const r = await client.query("select public.ai_record_decision($1::jsonb) as id", [JSON.stringify(args?.p_decision)]);
        return { data: r.rows[0]?.id as string, error: null };
      },
    };
    const recorder = createRpcRecorder(rpc);
    const expected = new Map<string, number | null>();
    for (let i = 0; i < N; i++) {
      const s = stepsFor(i);
      const id = randomUUID();
      expected.set(id, s.expectedMicros);
      const router = createRouter({
        allowFake: true,
        env: { APP_ENV: "local" },
        providers: { fake: (route) => new FakeProvider(route === "strong" ? s.strong : s.cheap, { model: `sintetico-${route}` }) },
        settings: { load: async () => settings },
        prompts: { get: async () => prompt },
        recorder,
        clock: systemClock,
      });
      await router.run(
        {
          entityType: "list_submission",
          entityId: id,
          promptKey: "extract_list",
          buildRequest: (p) => ({ messages: [{ role: "system", content: p.text }, { role: "user", content: "documento sintetico" }], responseFormat: "json" }),
          schema: resultSchema,
          evaluate: (r) => ({ overall: Math.min(...r.items.map((x) => x.confidence)), items: r.items.map((x) => x.confidence), alerts: [] }),
        },
        { budgetMs: 30_000 },
      );
    }
    const ids = [...expected.keys()];
    const view = await client.query<{ entity_id: string; provider_cost_usd_micros: string; unknown_cost_rows: number }>(
      "select entity_id, provider_cost_usd_micros, unknown_cost_rows from public.ai_cost_per_entity where entity_id = any($1::uuid[])",
      [ids],
    );
    const mismatches: string[] = [];
    for (const r of view.rows) {
      const exp = expected.get(r.entity_id);
      if (exp === null) {
        if (r.unknown_cost_rows === 0) mismatches.push(`${r.entity_id}: lista sem custo informado apareceu completa`);
      } else if (r.unknown_cost_rows !== 0 || Number(r.provider_cost_usd_micros) !== exp) {
        mismatches.push(`${r.entity_id}: view ${r.provider_cost_usd_micros}/${r.unknown_cost_rows} != esperado ${exp}`);
      }
    }
    if (view.rowCount !== ids.length) mismatches.push(`view devolveu ${view.rowCount} listas, esperado ${ids.length}`);
    const stats = costPanelStats(
      view.rows.map((r) => ({ providerCostUsdMicros: Number(r.provider_cost_usd_micros), unknownCostRows: r.unknown_cost_rows })),
      SYNTHETIC_RATE,
    );
    const completeExpected = [...expected.values()].filter((v): v is number => v !== null);
    const meanExpected = Math.round(completeExpected.reduce((a, b) => a + b, 0) / completeExpected.length);
    if (stats.usdMicros?.mean !== meanExpected) mismatches.push(`média ${stats.usdMicros?.mean} != esperada ${meanExpected}`);
    return { stats, mismatches };
  } finally {
    await client.query("rollback");
  }
}

async function real(client: Client): Promise<{ stats: CostPanelStats; rows: number }> {
  const rate = (await client.query<{ usd_brl_rate: string | null }>("select usd_brl_rate from public.ai_settings where scope = 'default'")).rows[0]?.usd_brl_rate ?? null;
  const r = await client.query<{ cost: string; unknown: number }>(
    `select coalesce(sum(provider_cost_usd_micros), 0)::text as cost, (count(*) filter (where provider_cost_usd_micros is null))::int as unknown
       from public.ai_decisions where provider <> 'fake' and entity_type = 'list_submission' group by entity_id`,
  );
  return {
    rows: r.rowCount ?? 0,
    stats: costPanelStats(r.rows.map((x) => ({ providerCostUsdMicros: Number(x.cost), unknownCostRows: x.unknown })), rate === null ? null : Number(rate)),
  };
}

const usd = (m: number) => `US$ ${(m / 1_000_000).toFixed(4)}`;
const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const p = await proof(client);
    const r = await real(client);
    const lines: string[] = [
      "# S28 · Custo de IA por lista (M02)",
      "",
      `Gerado por \`scripts/s28-custo-ia.ts\` em ${new Date().toISOString().slice(0, 10)}, banco local da trilha 2, sem chamar provedor real.`,
      "",
      "## 1. Prova do cálculo (dados SINTÉTICOS)",
      "",
      `${N} listas passaram pelo roteador de produção, pelo gravador e pelo RPC \`ai_record_decision\` reais, com o provedor falso e custos sintéticos (rótulos de teste: **não são preço de nenhum modelo**) e taxa sintética de ${SYNTHETIC_RATE.toFixed(2)} BRL por USD (**não é câmbio de mercado**). A view \`ai_cost_per_entity\` foi conferida lista a lista contra a conta independente; tudo sofreu rollback.`,
      "",
      `- Resultado da conferência: ${p.mismatches.length === 0 ? "**sem divergência**" : `**DIVERGÊNCIAS: ${p.mismatches.join("; ")}**`}.`,
      `- Listas: ${p.stats.lists}; com custo completo: ${p.stats.completeLists}; parciais (uma leitura sem custo, fora das médias): ${p.stats.partialLists}.`,
      p.stats.usdMicros
        ? `- Sintético: média ${usd(p.stats.usdMicros.mean)}, p95 ${usd(p.stats.usdMicros.p95)}, máximo ${usd(p.stats.usdMicros.max)}; em reais (taxa sintética) média ${brl(usdMicrosToBrlCents(p.stats.usdMicros.mean, SYNTHETIC_RATE) ?? 0)}.`
        : "- Sem lista completa.",
      "",
      "## 2. Custo real por lista",
      "",
    ];
    if (r.stats.usdMicros === null) {
      lines.push(
        "**Indisponível.** O banco apontado não tem nenhuma lista lida por provedor real com custo informado pelo provedor" + (r.rows > 0 ? ` (${r.rows} listas de provedor real, todas com alguma leitura sem custo)` : " (nenhuma decisão de provedor real registrada)") + ".",
        "",
        "O motivo é a regra do repositório: só o humano roda a IA real (custa dinheiro; `scripts/ai-smoke.ts`), e a chave do OpenRouter não é usada por agentes. Nada foi estimado nem multiplicado por preço de modelo.",
        "",
        `**Meta < R$ ${(GOAL_CENTS / 100).toFixed(2).replace(".", ",")} por lista: NÃO verificada.** A verificação fica para o E2E no staging (S20): cadastrar a taxa em \`/admin/ia\`, enviar listas reais e ler o bloco "Custo por lista".`,
      );
    } else {
      lines.push(
        `Listas com custo completo: ${r.stats.completeLists}; parciais: ${r.stats.partialLists}.`,
        `Média ${usd(r.stats.usdMicros.mean)}, p95 ${usd(r.stats.usdMicros.p95)}, máximo ${usd(r.stats.usdMicros.max)}.`,
        r.stats.brlCents ? `Em reais: média ${brl(r.stats.brlCents.mean)}, p95 ${brl(r.stats.brlCents.p95)}, máximo ${brl(r.stats.brlCents.max)} (taxa ${r.stats.rate} BRL por USD, do operador).` : "Reais: **BRL indisponível** (taxa não cadastrada em `/admin/ia`).",
      );
    }
    lines.push("", "## Origem dos números", "", "- Tokens e custo em dólar: devolvidos pelo OpenRouter em `usage` (`usage: { include: true }`), gravados por decisão em `ai_decisions` (migration `0800`).", "- Taxa BRL por USD: `ai_settings.usd_brl_rate`, cadastrada pelo operador em `/admin/ia`; sem ela, reais ficam indisponíveis.", "- Lista com qualquer leitura sem custo é parcial e nunca entra como total.", "");
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, lines.join("\n"));
    console.log(lines.join("\n"));
    if (p.mismatches.length > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
