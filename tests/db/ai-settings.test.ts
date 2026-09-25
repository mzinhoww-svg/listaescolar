import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, inTx, seedUsers, withClaims, type Identity } from "./helpers";

const ROUTES = `'{"cheap":{"provider":"openrouter","timeout_ms":20000},"strong":{"provider":"fake","timeout_ms":40000},"vision":{"provider":"openrouter","timeout_ms":40000}}'::jsonb`;

function insertSettings(scope: string, extra: Record<string, string> = {}): string {
  const v = {
    confidence_threshold: "0.8",
    item_confidence_threshold: "0.6",
    critical_alerts: "array['handwritten']",
    routes: ROUTES,
    max_escalations: "1",
    pipeline_version: "'t1'",
    ...extra,
  };
  return `insert into public.ai_settings (scope, confidence_threshold, item_confidence_threshold, critical_alerts, routes, max_escalations, pipeline_version)
          values ('${scope}', ${v.confidence_threshold}, ${v.item_confidence_threshold}, ${v.critical_alerts}, ${v.routes}, ${v.max_escalations}, ${v.pipeline_version})`;
}

describe("ai_settings", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("seed: default com limiares, críticos, rotas, timeouts e versão do pipeline; sem nome de modelo", async () => {
    await inTx(async (c) => {
      const r = await c.query("select * from public.ai_settings where scope = 'default'");
      expect(r.rows).toHaveLength(1);
      const s = r.rows[0];
      expect(Number(s.confidence_threshold)).toBe(0.8);
      expect(Number(s.item_confidence_threshold)).toBe(0.6);
      expect(s.critical_alerts).toEqual(["handwritten", "invalid_school_grade_year", "text_document_mismatch"]);
      expect(s.routes).toEqual({
        cheap: { provider: "openrouter", timeout_ms: 20000 },
        strong: { provider: "openrouter", timeout_ms: 40000 },
        vision: { provider: "openrouter", timeout_ms: 40000 },
      });
      expect(s.max_escalations).toBe(1);
      expect(s.pipeline_version).toBe("s08.1");
      expect(JSON.stringify(s).toLowerCase()).not.toMatch(/deepseek|glm|gpt|claude|gemini|llama|mistral|qwen|anthropic/);
    });
  });

  it("singleton por scope", async () => {
    await inTx(async (c) => {
      expect((await attempt(c, insertSettings("default"))).code).toBe("23505");
      expect((await attempt(c, insertSettings("outro"))).error).toBeNull();
    });
  });

  it("checks de domínio", async () => {
    await inTx(async (c) => {
      const bad: Record<string, string>[] = [
        { confidence_threshold: "-0.1" },
        { confidence_threshold: "1.5" },
        { item_confidence_threshold: "2" },
        { critical_alerts: "array['nao_existe']" },
        { max_escalations: "-1" },
        { max_escalations: "4" },
        { pipeline_version: "'  '" },
        { routes: `'{"cheap":{"provider":"openrouter","timeout_ms":20000}}'::jsonb` },
        { routes: ROUTES.replace('"provider":"fake"', '"provider":"outro"') },
        { routes: ROUTES.replace("timeout_ms\":40000},\"vision", "timeout_ms\":500},\"vision") },
        { routes: ROUTES.replace('"timeout_ms":20000', '"timeout_ms":120001') },
        { routes: ROUTES.replace('"timeout_ms":20000', '"timeout_ms":"20000"') },
        { routes: ROUTES.replace('"timeout_ms":20000', '"timeout_ms":1500.5') },
        { routes: ROUTES.replace('"timeout_ms":20000}', '"timeout_ms":20000,"model":"x"}') },
        { routes: `'[]'::jsonb` },
      ];
      for (const [i, extra] of bad.entries()) {
        const r = await attempt(c, insertSettings(`bad${i}`, extra));
        expect(r.code, JSON.stringify(extra)).toBe("23514");
      }
      // limites válidos
      const ok = await attempt(
        c,
        insertSettings("edge", {
          confidence_threshold: "0",
          item_confidence_threshold: "1",
          critical_alerts: "array[]::text[]",
          max_escalations: "0",
        }),
      );
      expect(ok.error).toBeNull();
    });
  });

  for (const who of ["admin", "system", "system_profile"] as const satisfies Identity[]) {
    it(`${who} lê e escreve ai_settings`, async () => {
      await withClaims(who, async (c) => {
        expect((await c.query("select id from public.ai_settings")).rowCount).toBe(1);
        const upd = await attempt(c, "update public.ai_settings set confidence_threshold = 0.9 where scope = 'default' returning id");
        expect(upd.error).toBeNull();
        expect(upd.rowCount).toBe(1);
        const ins = await attempt(c, insertSettings("novo"));
        expect(ins.error).toBeNull();
      });
    });
  }

  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan"] as const satisfies Identity[]) {
    it(`${who} não lê nem escreve ai_settings`, async () => {
      await withClaims(who, async (c) => {
        expect((await attempt(c, "select id from public.ai_settings")).rows).toEqual([]);
        const upd = await attempt(c, "update public.ai_settings set confidence_threshold = 0.1");
        expect(upd.error !== null || upd.rowCount === 0).toBe(true);
        expect((await attempt(c, insertSettings("x"))).error).not.toBeNull();
        expect((await attempt(c, "delete from public.ai_settings")).error !== null).toBe(true);
      });
    });
  }

  it("ninguém apaga ai_settings (nem admin)", async () => {
    await withClaims("admin", async (c) => {
      const r = await attempt(c, "delete from public.ai_settings");
      expect(r.error).not.toBeNull();
    });
  });

  it("mudança de ai_settings é auditada", async () => {
    await withClaims("admin", async (c) => {
      await c.query("update public.ai_settings set confidence_threshold = 0.9 where scope = 'default'");
      const r = await c.query(
        "select actor_role from public.audit_log where entity_table = 'ai_settings' order by created_at desc, id desc limit 1",
      );
      expect(r.rows[0].actor_role).toBe("admin");
    });
  });

  it("ai_get_settings: service_role lê o default; falha fechada sem linha; demais papéis negados", async () => {
    await withClaims("system", async (c) => {
      const r = await c.query("select (public.ai_get_settings()).pipeline_version as v");
      expect(r.rows[0].v).toBe("s08.1");
    });
    await inTx(async (c) => {
      await c.query("delete from public.ai_settings");
      const r = await attempt(c, "select public.ai_get_settings()");
      expect(r.error).not.toBeNull();
    });
    for (const who of ["anon", "parent", "admin", "system_profile"] as const) {
      await withClaims(who, async (c) => {
        expect((await attempt(c, "select public.ai_get_settings()")).code, who).toBe("42501");
      });
    }
  });
  it("id e scope são imutáveis (inclusive para admin e dono)", async () => {
    for (const who of ["admin", "system"] as const) {
      await withClaims(who, async (c) => {
        const scope = await attempt(c, "update public.ai_settings set scope = 'outro' where scope = 'default'");
        expect(scope.error, who).not.toBeNull();
        const id = await attempt(c, "update public.ai_settings set id = gen_random_uuid() where scope = 'default'");
        expect(id.error, who).not.toBeNull();
      });
    }
    await inTx(async (c) => {
      await c.query("set local session_replication_role = replica");
      expect((await attempt(c, "update public.ai_settings set scope = 'outro'")).error).not.toBeNull();
    });
  });
});
