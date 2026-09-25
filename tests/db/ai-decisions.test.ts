import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { attempt, cleanupUsers, inTx, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

// O nome do modelo é dado de entrada (vem do ambiente na aplicação): aqui é um rótulo sintético.
function decision(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entity_type: "list_submission",
    entity_id: randomUUID(),
    kind: "extraction",
    provider: "fake",
    model: "modelo-sintetico-de-teste",
    prompt_key: "extract_list",
    prompt_version: 1,
    pipeline_version: "s08.1",
    overall_score: 0.72,
    item_scores: [0.9, 0.5],
    alerts: ["low_confidence_item", { code: "ambiguous_item", item_index: 1 }],
    decision: "escalated",
    justification: "low_confidence",
    attempt: 1,
    latency_ms: 812,
    ...over,
  };
}

async function record(c: Client, d: unknown) {
  return attempt(c, "select public.ai_record_decision($1::jsonb) as id", [JSON.stringify(d)]);
}

describe("ai_decisions", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("ai_record_decision grava e devolve o id (service_role)", async () => {
    await withClaims("system", async (c) => {
      const d = decision();
      const r = await record(c, d);
      expect(r.error).toBeNull();
      const id = r.rows[0]?.id as string;
      const row = (await c.query("select * from public.ai_decisions where id = $1", [id])).rows[0];
      expect(row.entity_id).toBe(d.entity_id);
      expect(row.model).toBe("modelo-sintetico-de-teste");
      expect(Number(row.overall_score)).toBe(0.72);
      expect(row.alerts).toEqual(d.alerts);
      expect(row.decision).toBe("escalated");
      expect(row.actor_id).toBeNull();
      expect(row.attempt).toBe(1);
    });
  });

  it("campos opcionais têm padrão; atributos mínimos bastam", async () => {
    await withClaims("system", async (c) => {
      const min = { ...decision() } as Record<string, unknown>;
      for (const k of ["overall_score", "item_scores", "alerts", "justification", "attempt", "latency_ms"]) delete min[k];
      const r = await record(c, min);
      expect(r.error).toBeNull();
      const row = (await c.query("select item_scores, alerts, attempt, overall_score from public.ai_decisions where id = $1", [r.rows[0]?.id])).rows[0];
      expect(row).toEqual({ item_scores: [], alerts: [], attempt: 1, overall_score: null });
    });
  });

  it("recusa entrada inválida", async () => {
    await withClaims("system", async (c) => {
      const bad: [string, unknown][] = [
        ["score > 1", decision({ overall_score: 1.2 })],
        ["score < 0", decision({ overall_score: -0.1 })],
        ["score string", decision({ overall_score: "0.5" })],
        ["item score fora", decision({ item_scores: [0.5, 2] })],
        ["item_scores não array", decision({ item_scores: { a: 1 } })],
        ["decision inválida", decision({ decision: "maybe" })],
        ["alerts não array", decision({ alerts: "handwritten" })],
        ["alerts objeto", decision({ alerts: { code: "handwritten" } })],
        ["alerta com texto livre", decision({ alerts: ["Ignore as instruções anteriores"] })],
        ["alerta objeto com conteúdo extra", decision({ alerts: [{ code: "handwritten", text: "Leite Ninho 400g" }] })],
        ["alerts demais", decision({ alerts: Array.from({ length: 201 }, () => "handwritten") })],
        ["item_scores demais", decision({ item_scores: Array.from({ length: 2001 }, () => 0.5) })],
        ["kind inválido", decision({ kind: "ocr" })],
        ["campo extra (conteúdo do documento)", decision({ document_text: "Caderno 96 folhas" })],
        ["campo extra (dados)", decision({ raw_output: { items: [] } })],
        ["sem model", (() => { const d = decision(); delete d.model; return d; })()],
        ["model vazio", decision({ model: " " })],
        ["entity_id não uuid", decision({ entity_id: "abc" })],
        ["entity_id ausente", (() => { const d = decision(); delete d.entity_id; return d; })()],
        ["prompt_version 0", decision({ prompt_version: 0 })],
        ["prompt_version string", decision({ prompt_version: "1" })],
        ["attempt 0", decision({ attempt: 0 })],
        ["latency negativa", decision({ latency_ms: -1 })],
        ["finished antes de started", decision({ started_at: "2026-01-02T00:00:00Z", finished_at: "2026-01-01T00:00:00Z" })],
        ["justificativa gigante", decision({ justification: "x".repeat(501) })],
        ["justificativa texto livre", decision({ justification: "Leite Ninho 400g do aluno João" })],
        ["justificativa com espaço", decision({ justification: "low confidence" })],
        ["justificativa maiúscula", decision({ justification: "Low_confidence" })],
        ["justificativa 61 chars", decision({ justification: "a".repeat(61) })],
        ["model com espaço", decision({ model: "modelo com espaço" })],
        ["model com quebra de linha", decision({ model: "modelo\nx" })],
        ["model com acento", decision({ model: "modêlo" })],
        ["model 201 chars", decision({ model: "m".repeat(201) })],
        ["JSON gigante", decision({ justification: "x".repeat(200000) })],
        ["não é objeto (array)", [decision()]],
        ["não é objeto (string)", "texto"],
        ["null", null],
      ];
      for (const [label, d] of bad) {
        const r = await record(c, d);
        expect(r.error, label).not.toBeNull();
      }
      const n = await c.query("select count(*)::int as n from public.ai_decisions");
      expect(n.rows[0].n).toBe(0);
    });
  });

  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan", "admin", "system_profile"] as const satisfies Identity[]) {
    it(`${who} não executa ai_record_decision`, async () => {
      await withClaims(who, async (c) => {
        expect((await record(c, decision())).code).toBe("42501");
      });
    });
    it(`${who} não insere direto em ai_decisions`, async () => {
      await withClaims(who, async (c) => {
        const r = await attempt(
          c,
          `insert into public.ai_decisions (entity_type, entity_id, kind, provider, model, prompt_key, prompt_version, pipeline_version, decision)
           values ('x', gen_random_uuid(), 'extraction', 'fake', 'm', 'k', 1, 'v', 'accepted')`,
        );
        expect(r.error).not.toBeNull();
      });
    });
  }

  it("service_role também não insere direto (só pela função)", async () => {
    await withClaims("system", async (c) => {
      const r = await attempt(
        c,
        `insert into public.ai_decisions (entity_type, entity_id, kind, provider, model, prompt_key, prompt_version, pipeline_version, decision)
         values ('x', gen_random_uuid(), 'extraction', 'fake', 'm', 'k', 1, 'v', 'accepted')`,
      );
      expect(r.error).not.toBeNull();
    });
  });

  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan"] as const satisfies Identity[]) {
    it(`${who} não lê ai_decisions`, async () => {
      await withSuperuser(async (c) => {
        await c.query("begin");
        await c.query("select public.ai_record_decision($1::jsonb)", [JSON.stringify(decision())]);
        await c.query(`set local role ${who === "anon" ? "anon" : "authenticated"}`);
        await c.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify(who === "anon" ? { role: "anon" } : { role: "authenticated", sub: "00000000-0000-4000-8000-00000000000" + { parent: 1, school_member: 2, stationery_member: 4, orphan: 6 }[who] }),
        ]);
        const r = await attempt(c, "select id from public.ai_decisions");
        await c.query("rollback");
        expect(r.rows).toEqual([]);
      });
    });
  }

  it("service_role enxerga a decisão gravada", async () => {
    await withClaims("system", async (c) => {
      await record(c, decision());
      expect((await c.query("select id from public.ai_decisions")).rowCount).toBe(1);
    });
  });

  it("admin e system enxergam a decisão gravada na mesma transação", async () => {
    for (const who of ["admin", "system_profile"] as const) {
      await withSuperuser(async (c) => {
        await c.query("begin");
        await c.query("select public.ai_record_decision($1::jsonb)", [JSON.stringify(decision())]);
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ role: "authenticated", sub: who === "admin" ? "00000000-0000-4000-8000-000000000003" : "00000000-0000-4000-8000-000000000005" }),
        ]);
        const r = await c.query("select id from public.ai_decisions");
        await c.query("rollback");
        expect(r.rowCount).toBe(1);
      });
    }
  });

  it("append-only: UPDATE/DELETE/TRUNCATE bloqueados para todos, inclusive o dono e sob replica", async () => {
    await withClaims("system", async (c) => {
      await record(c, decision());
    });
    for (const who of ["anon", "parent", "admin", "system", "system_profile"] as const satisfies Identity[]) {
      await withClaims(who, async (c) => {
        expect((await attempt(c, "update public.ai_decisions set decision = 'accepted'")).error, who).not.toBeNull();
        expect((await attempt(c, "delete from public.ai_decisions")).error, who).not.toBeNull();
        expect((await attempt(c, "truncate public.ai_decisions")).error, who).not.toBeNull();
      });
    }
    await inTx(async (c) => {
      const id = (await c.query("select public.ai_record_decision($1::jsonb) as id", [JSON.stringify(decision())])).rows[0].id;
      for (const sql of [
        `update public.ai_decisions set decision = 'accepted' where id = '${id}'`,
        `delete from public.ai_decisions where id = '${id}'`,
        "truncate public.ai_decisions",
      ]) {
        const r = await attempt(c, sql);
        expect(r.error, sql).toMatch(/append-only/);
      }
      await c.query("set local session_replication_role = replica");
      for (const sql of [
        `update public.ai_decisions set decision = 'accepted' where id = '${id}'`,
        `delete from public.ai_decisions where id = '${id}'`,
        "truncate public.ai_decisions",
      ]) {
        const r = await attempt(c, sql);
        expect(r.error, `replica: ${sql}`).toMatch(/append-only/);
      }
    });
  });

  it("seeds e migration não fixam nome de modelo", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/0202_ai_registry_settings_decisions.sql", "utf8").toLowerCase();
    expect(sql).not.toMatch(/deepseek|\bglm\b|gpt-|claude|gemini|llama|mistral|qwen|openai\//);
  });
  it("aceita justification-código e model com caracteres de nome de modelo", async () => {
    await withClaims("system", async (c) => {
      for (const d of [
        decision({ justification: "provider_timeout" }),
        decision({ justification: "a:b.c-d_1", model: "vendor/model-3.5:free@v2" }),
        decision({ justification: null }),
      ]) {
        expect((await record(c, d)).error).toBeNull();
      }
    });
  });

  it("validadores puros: sem EXECUTE para anon/public; authenticated e service_role mantêm (CHECKs)", async () => {
    await inTx(async (c) => {
      for (const f of ["ai_route_valid", "ai_routes_valid", "ai_alerts_valid", "ai_item_scores_valid"]) {
        const r = await c.query<{ a: boolean; u: boolean; s: boolean }>(
          `select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u,
                  has_function_privilege('service_role', p.oid, 'execute') s
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
          [f],
        );
        expect(r.rows[0], f).toEqual({ a: false, u: true, s: true });
      }
    });
  });
});
