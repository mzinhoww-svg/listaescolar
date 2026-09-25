import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, inTx, seedUsers, withClaims, type Identity } from "./helpers";

describe("prompt_registry", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("seed: extract_list v1 ativo, em português, sem nome de modelo", async () => {
    await inTx(async (c) => {
      const r = await c.query("select version, is_active, text, schema from public.prompt_registry where key = 'extract_list'");
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].version).toBe(1);
      expect(r.rows[0].is_active).toBe(true);
      expect(r.rows[0].text).toMatch(/lista escolar/i);
      expect(JSON.stringify(r.rows[0]).toLowerCase()).not.toMatch(/deepseek|glm|gpt|claude|gemini|llama|mistral|qwen|openai|anthropic/);
    });
  });

  it("um só prompt ativo por key", async () => {
    await inTx(async (c) => {
      const dup = await attempt(
        c,
        "insert into public.prompt_registry (key, version, text, schema, is_active) values ('extract_list', 2, 't', '{}', true)",
      );
      expect(dup.code).toBe("23505");
      const ok = await attempt(
        c,
        "insert into public.prompt_registry (key, version, text, schema, is_active) values ('extract_list', 2, 't', '{}', false)",
      );
      expect(ok.error).toBeNull();
      const dupVersion = await attempt(
        c,
        "insert into public.prompt_registry (key, version, text, schema) values ('extract_list', 2, 't', '{}')",
      );
      expect(dupVersion.code).toBe("23505");
    });
  });

  it("promover nova versão: desativa a antiga e ativa a nova", async () => {
    await inTx(async (c) => {
      await c.query("insert into public.prompt_registry (key, version, text, schema) values ('extract_list', 2, 'novo', '{}')");
      await c.query("update public.prompt_registry set is_active = false where key = 'extract_list' and version = 1");
      await c.query("update public.prompt_registry set is_active = true where key = 'extract_list' and version = 2");
      const r = await c.query("select version from public.prompt_registry where key = 'extract_list' and is_active");
      expect(r.rows).toEqual([{ version: 2 }]);
    });
  });

  it("versão antiga é imutável (key, version, text, schema) e não se apaga", async () => {
    await inTx(async (c) => {
      for (const sql of [
        "update public.prompt_registry set text = 'alterado' where key = 'extract_list' and version = 1",
        "update public.prompt_registry set schema = '{\"x\":1}' where key = 'extract_list' and version = 1",
        "update public.prompt_registry set version = 9 where key = 'extract_list' and version = 1",
        "update public.prompt_registry set key = 'outra' where key = 'extract_list' and version = 1",
        "update public.prompt_registry set created_at = now() - interval '1 year' where key = 'extract_list' and version = 1",
        "update public.prompt_registry set id = gen_random_uuid() where key = 'extract_list' and version = 1",
        "delete from public.prompt_registry where key = 'extract_list'",
        "truncate public.prompt_registry",
      ]) {
        const r = await attempt(c, sql);
        expect(r.error, sql).not.toBeNull();
      }
      await c.query("set local session_replication_role = replica");
      const r = await attempt(c, "update public.prompt_registry set text = 'alterado' where key = 'extract_list'");
      expect(r.error).not.toBeNull();
      // DELETE e TRUNCATE também são bloqueados em modo replica (triggers enable always).
      expect((await attempt(c, "delete from public.prompt_registry")).error).not.toBeNull();
      expect((await attempt(c, "truncate public.prompt_registry")).error).not.toBeNull();
    });
  });

  it("auditoria do prompt_registry: insert e troca de ativo entram no audit_log sem text/schema", async () => {
    await inTx(async (c) => {
      await c.query("insert into public.prompt_registry (key, version, text, schema) values ('extract_list', 7, 'segredo-de-prompt', '{\"x\":1}')");
      await c.query("update public.prompt_registry set is_active = false where key = 'extract_list' and version = 1");
      const r = await c.query(
        "select action, before, after from public.audit_log where entity_table = 'prompt_registry' order by created_at, id",
      );
      expect(r.rows.map((x) => x.action).slice(-2)).toEqual(["INSERT", "UPDATE"]); // o seed da migration também é auditado
      const dump = JSON.stringify(r.rows);
      expect(dump).not.toContain("segredo-de-prompt");
      for (const row of r.rows) {
        for (const side of [row.before, row.after]) {
          if (side) {
            expect(side).not.toHaveProperty("text");
            expect(side).not.toHaveProperty("schema");
            expect(side).toHaveProperty("key", "extract_list");
          }
        }
      }
      const upd = r.rows[r.rows.length - 1];
      expect(upd.before.is_active).toBe(true);
      expect(upd.after.is_active).toBe(false);
    });
  });

  it("checks: key inválida, texto vazio, schema não objeto", async () => {
    await inTx(async (c) => {
      for (const sql of [
        "insert into public.prompt_registry (key, version, text, schema) values ('Chave Ruim', 1, 't', '{}')",
        "insert into public.prompt_registry (key, version, text, schema) values ('k', 0, 't', '{}')",
        "insert into public.prompt_registry (key, version, text, schema) values ('k', 1, '  ', '{}')",
        "insert into public.prompt_registry (key, version, text, schema) values ('k', 1, 't', '[]')",
      ]) {
        expect((await attempt(c, sql)).code, sql).toBe("23514");
      }
    });
  });

  for (const who of ["admin", "system", "system_profile"] as const satisfies Identity[]) {
    it(`${who} lê o prompt_registry`, async () => {
      await withClaims(who, async (c) => {
        const r = await c.query("select id from public.prompt_registry");
        expect(r.rowCount).toBeGreaterThan(0);
      });
    });
  }

  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan"] as const satisfies Identity[]) {
    it(`${who} não lê o prompt_registry`, async () => {
      await withClaims(who, async (c) => {
        const r = await attempt(c, "select id from public.prompt_registry");
        expect(r.rows).toEqual([]);
      });
    });
  }

  for (const who of ["anon", "parent", "admin", "system_profile"] as const satisfies Identity[]) {
    it(`${who} não escreve no prompt_registry`, async () => {
      await withClaims(who, async (c) => {
        const ins = await attempt(
          c,
          "insert into public.prompt_registry (key, version, text, schema) values ('k', 1, 't', '{}')",
        );
        expect(ins.error).not.toBeNull();
        const upd = await attempt(c, "update public.prompt_registry set is_active = false");
        expect(upd.error !== null || upd.rowCount === 0).toBe(true);
      });
    });
  }

  it("service_role escreve o prompt_registry", async () => {
    await withClaims("system", async (c) => {
      const ins = await attempt(
        c,
        "insert into public.prompt_registry (key, version, text, schema) values ('k', 1, 't', '{}')",
      );
      expect(ins.error).toBeNull();
    });
  });

  it("ai_get_active_prompt: service_role lê o ativo; chave inexistente falha fechada; demais papéis negados", async () => {
    await withClaims("system", async (c) => {
      const r = await c.query("select (public.ai_get_active_prompt('extract_list')).version as v");
      expect(r.rows[0].v).toBe(1);
      const none = await attempt(c, "select public.ai_get_active_prompt('nao_existe')");
      expect(none.error).not.toBeNull();
    });
    for (const who of ["anon", "parent", "admin", "system_profile"] as const) {
      await withClaims(who, async (c) => {
        const r = await attempt(c, "select public.ai_get_active_prompt('extract_list')");
        expect(r.code, who).toBe("42501");
      });
    }
  });
});
