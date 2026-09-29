import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { attempt, cleanupUsers, IDS, inTx, seedUsers, withClaims, withSuperuser } from "./helpers";

// S28 (M02): uso e custo reais de IA por decisão. Rótulos sintéticos; nenhum preço de modelo entra aqui.
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
    decision: "accepted",
    ...over,
  };
}
const record = (c: Client, d: unknown) => attempt(c, "select public.ai_record_decision($1::jsonb) as id", [JSON.stringify(d)]);

describe("ai_decisions: uso e custo (0800)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("as quatro colunas existem, são anuláveis e têm o tipo esperado", async () => {
    await inTx(async (c) => {
      const r = await c.query<{ column_name: string; data_type: string; is_nullable: string }>(
        `select column_name, data_type, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'ai_decisions'
           and column_name in ('prompt_tokens', 'completion_tokens', 'total_tokens', 'provider_cost_usd_micros') order by 1`,
      );
      expect(r.rows).toEqual([
        { column_name: "completion_tokens", data_type: "integer", is_nullable: "YES" },
        { column_name: "prompt_tokens", data_type: "integer", is_nullable: "YES" },
        { column_name: "provider_cost_usd_micros", data_type: "bigint", is_nullable: "YES" },
        { column_name: "total_tokens", data_type: "integer", is_nullable: "YES" },
      ]);
      const s = await c.query<{ data_type: string; numeric_precision: number; numeric_scale: number; is_nullable: string }>(
        `select data_type, numeric_precision, numeric_scale, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'ai_settings' and column_name = 'usd_brl_rate'`,
      );
      expect(s.rows).toEqual([{ data_type: "numeric", numeric_precision: 8, numeric_scale: 4, is_nullable: "YES" }]);
    });
  });

  it("inserção sem uso continua válida e grava nulo (assinatura antiga compatível)", async () => {
    await withClaims("system", async (c) => {
      const r = await record(c, decision());
      expect(r.error).toBeNull();
      const row = (await c.query("select prompt_tokens, completion_tokens, total_tokens, provider_cost_usd_micros from public.ai_decisions where id = $1", [r.rows[0]?.id])).rows[0];
      expect(row).toEqual({ prompt_tokens: null, completion_tokens: null, total_tokens: null, provider_cost_usd_micros: null });
    });
  });

  it("grava o uso informado pelo provedor", async () => {
    await withClaims("system", async (c) => {
      const r = await record(c, decision({ prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, provider_cost_usd_micros: 4200 }));
      expect(r.error).toBeNull();
      const row = (await c.query("select prompt_tokens, completion_tokens, total_tokens, provider_cost_usd_micros::text as cost from public.ai_decisions where id = $1", [r.rows[0]?.id])).rows[0];
      expect(row).toEqual({ prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, cost: "4200" });
    });
  });

  it("aceita nulo explícito e zero real (custo zero informado é diferente de custo desconhecido)", async () => {
    await withClaims("system", async (c) => {
      expect((await record(c, decision({ prompt_tokens: null, provider_cost_usd_micros: null }))).error).toBeNull();
      const r = await record(c, decision({ provider_cost_usd_micros: 0 }));
      expect(r.error).toBeNull();
      const row = (await c.query("select provider_cost_usd_micros::text as cost from public.ai_decisions where id = $1", [r.rows[0]?.id])).rows[0];
      expect(row?.cost).toBe("0");
    });
  });

  it("recusa uso inválido (negativo, texto, fracionário, objeto)", async () => {
    await withClaims("system", async (c) => {
      const bad: [string, Record<string, unknown>][] = [
        ["tokens negativos", { prompt_tokens: -1 }],
        ["total negativo", { total_tokens: -5 }],
        ["custo negativo", { provider_cost_usd_micros: -1 }],
        ["tokens texto", { prompt_tokens: "12" }],
        ["custo texto", { provider_cost_usd_micros: "10" }],
        ["tokens fracionário", { completion_tokens: 1.5 }],
        ["custo fracionário", { provider_cost_usd_micros: 0.5 }],
        ["objeto", { total_tokens: { a: 1 } }],
        ["tokens gigantes", { prompt_tokens: 99999999999 }],
      ];
      for (const [label, extra] of bad) {
        expect((await record(c, decision(extra))).error, label).not.toBeNull();
      }
      // campos fora da lista continuam recusados
      expect((await record(c, decision({ cost_brl: 1 }))).error).not.toBeNull();
    });
  });

  it("update e delete continuam bloqueados (append-only) nas colunas novas", async () => {
    await inTx(async (c) => {
      const id = (await c.query("select public.ai_record_decision($1::jsonb) as id", [JSON.stringify(decision({ total_tokens: 10 }))])).rows[0].id;
      for (const sql of [
        `update public.ai_decisions set total_tokens = 999 where id = '${id}'`,
        `update public.ai_decisions set provider_cost_usd_micros = 1 where id = '${id}'`,
        `delete from public.ai_decisions where id = '${id}'`,
      ]) {
        expect((await attempt(c, sql)).error, sql).toMatch(/append-only/);
      }
    });
  });

  it("função: SECURITY DEFINER, search_path vazio, EXECUTE só do service_role", async () => {
    await inTx(async (c) => {
      const r = await c.query<{ secdef: boolean; cfg: string[] | null; a: boolean; u: boolean; s: boolean; p: boolean }>(
        `select p.prosecdef as secdef, p.proconfig as cfg,
                has_function_privilege('anon', p.oid, 'execute') as a,
                has_function_privilege('authenticated', p.oid, 'execute') as u,
                has_function_privilege('service_role', p.oid, 'execute') as s,
                has_function_privilege('public', p.oid, 'execute') as p
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_record_decision'`,
      );
      expect(r.rows).toHaveLength(1); // uma só assinatura: sem sobrecarga
      const f = r.rows[0]!;
      expect(f.secdef).toBe(true);
      expect(f.cfg).toContain('search_path=""');
      expect({ a: f.a, u: f.u, s: f.s, p: f.p }).toEqual({ a: false, u: false, s: true, p: false });
    });
  });

  it("a migration não fixa nome nem preço de modelo", () => {
    const sql = readFileSync("supabase/migrations/0800_s28_ai_usage.sql", "utf8").toLowerCase();
    expect(sql).not.toMatch(/deepseek|\bglm\b|gpt-|claude|gemini|llama|mistral|qwen|openai\//);
  });
});

describe("ai_settings.usd_brl_rate (0800)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("nasce nula na linha default (nunca uma taxa inventada)", async () => {
    await inTx(async (c) => {
      const r = await c.query("select usd_brl_rate from public.ai_settings where scope = 'default'");
      expect(r.rows).toEqual([{ usd_brl_rate: null }]);
    });
  });

  it("recusa zero e negativo; aceita positivo e nulo", async () => {
    await inTx(async (c) => {
      expect((await attempt(c, "update public.ai_settings set usd_brl_rate = 0 where scope = 'default'")).error).toMatch(/usd_brl_rate|check/i);
      expect((await attempt(c, "update public.ai_settings set usd_brl_rate = -1 where scope = 'default'")).error).toMatch(/usd_brl_rate|check/i);
      expect((await attempt(c, "update public.ai_settings set usd_brl_rate = 5.4321 where scope = 'default'")).error).toBeNull();
      expect((await attempt(c, "update public.ai_settings set usd_brl_rate = null where scope = 'default'")).error).toBeNull();
    });
  });

  it("admin atualiza; responsável não", async () => {
    await withClaims("admin", async (c) => {
      const r = await attempt(c, "update public.ai_settings set usd_brl_rate = 5.5 where scope = 'default' returning usd_brl_rate");
      expect(r.error).toBeNull();
      expect(r.rowCount).toBe(1);
    });
    await withClaims("parent", async (c) => {
      const r = await attempt(c, "update public.ai_settings set usd_brl_rate = 9 where scope = 'default'");
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("view ai_cost_per_entity (0800)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  async function seedTwoRows(c: Client, entity: string) {
    await c.query("select public.ai_record_decision($1::jsonb)", [JSON.stringify(decision({ entity_id: entity, prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, provider_cost_usd_micros: 1000 }))]);
    await c.query("select public.ai_record_decision($1::jsonb)", [JSON.stringify(decision({ entity_id: entity, attempt: 2 }))]);
  }

  it("soma por entidade e conta as linhas sem custo (custo parcial é visível, nunca total)", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      const entity = randomUUID();
      await seedTwoRows(c, entity);
      const r = await c.query("select * from public.ai_cost_per_entity where entity_id = $1", [entity]);
      await c.query("rollback");
      expect(r.rows).toHaveLength(1);
      const row = r.rows[0];
      expect(row.entity_type).toBe("list_submission");
      expect(Number(row.decisions)).toBe(2);
      expect(Number(row.provider_cost_usd_micros)).toBe(1000);
      expect(Number(row.total_tokens)).toBe(120);
      expect(Number(row.unknown_cost_rows)).toBe(1);
    });
  });

  it("security_invoker: admin lê; responsável autenticado não vê linhas; anon sem permissão", async () => {
    for (const [who, sub, expected] of [["admin", IDS.admin, 1], ["authenticated", IDS.parent, 0]] as const) {
      await withSuperuser(async (c) => {
        await c.query("begin");
        const entity = randomUUID();
        await seedTwoRows(c, entity);
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub })]);
        const r = await attempt(c, "select entity_id from public.ai_cost_per_entity where entity_id = $1", [entity]);
        await c.query("rollback");
        expect(r.error, who).toBeNull();
        expect(r.rows.length, who).toBe(expected);
      });
    }
    await withClaims("anon", async (c) => {
      expect((await attempt(c, "select * from public.ai_cost_per_entity")).error).toMatch(/permission denied/i);
    });
  });

  it("a view é security_invoker e ninguém escreve nela", async () => {
    await inTx(async (c) => {
      const r = await c.query<{ opts: string[] | null }>("select reloptions as opts from pg_class where oid = 'public.ai_cost_per_entity'::regclass");
      expect(r.rows[0]?.opts).toContain("security_invoker=true");
      for (const who of ["anon", "authenticated", "service_role"]) {
        const p = await c.query<{ ok: boolean }>("select has_table_privilege($1, 'public.ai_cost_per_entity', 'insert, update, delete') as ok", [who]);
        expect(p.rows[0]?.ok, who).toBe(false);
      }
    });
  });
});
