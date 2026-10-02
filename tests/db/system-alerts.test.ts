// Alerta de fila morta e de taxa de erro de IA (S19, migration 0606). Depende de 0602 (notifications).
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, inTx, seedUsers } from "./helpers";
import { asService, asSuper, tx } from "./review-fixtures";

beforeAll(seedUsers);
afterAll(cleanupUsers);

describe("notification_params_valid: alert_kind/alert_count", () => {
  const ok = async (c: Client, p: unknown) => (await c.query("select public.notification_params_valid($1::jsonb) as v", [JSON.stringify(p)])).rows[0].v as boolean;

  it("aceita os dois campos com valores válidos", async () => {
    await inTx(async (c) => {
      expect(await ok(c, { alert_kind: "dead_jobs", alert_count: 3 })).toBe(true);
      expect(await ok(c, { alert_kind: "ai_error_rate", alert_count: 0 })).toBe(true);
    });
  });

  it("recusa alert_kind fora do catálogo e alert_count não numérico", async () => {
    await inTx(async (c) => {
      expect(await ok(c, { alert_kind: "outro" })).toBe(false);
      expect(await ok(c, { alert_count: "3" })).toBe(false);
      expect(await ok(c, { alert_count: -1 })).toBe(false);
    });
  });
});

describe("system_alert_notify", () => {
  it("notifica cada admin (inclusive o de dev do seed global), dedup por dia, link /admin, sem dado pessoal nos params", async () => {
    await tx(async (c) => {
      await asService(c);
      await c.query("select public.system_alert_notify($1, $2)", ["dead_jobs", 4]);
      const rows = (
        await c.query(
          "select recipient_id, event_type, params, link_path from public.notifications where event_type = 'system_alert'",
        )
      ).rows;
      // Ao menos o admin dos testes (IDS.admin) recebe; pode haver outros admins (ex.: o de dev do seed global).
      const mine = rows.find((r) => r.recipient_id === IDS.admin);
      expect(mine).toBeDefined();
      expect(mine.link_path).toBe("/admin");
      expect(mine.params).toEqual({ alert_kind: "dead_jobs", alert_count: 4 });
      expect(rows.every((r) => r.event_type === "system_alert")).toBe(true);
      // sem nenhum campo além dos dois esperados (nenhum dado pessoal)
      expect(rows.every((r) => Object.keys(r.params).sort().join(",") === "alert_count,alert_kind")).toBe(true);

      // segunda chamada no mesmo dia: dedup (mesmo conjunto de linhas, nenhuma nova)
      const before = rows.length;
      await c.query("select public.system_alert_notify($1, $2)", ["dead_jobs", 9]);
      const after = (await c.query("select count(*)::int as n from public.notifications where event_type = 'system_alert'")).rows[0].n;
      expect(after).toBe(before);
    });
  });

  it("kind inválido levanta exceção", async () => {
    await tx(async (c) => {
      await asService(c);
      const r = await attempt(c, "select public.system_alert_notify($1, $2)", ["outro", 1]);
      expect(r.error).not.toBeNull();
    });
  });

  it("EXECUTE: só service_role; anon e authenticated recusados", async () => {
    await inTx(async (c) => {
      await asSuper(c);
      const sig = "public.system_alert_notify(text, integer)";
      for (const role of ["anon", "authenticated"]) {
        const r = await c.query("select has_function_privilege($1, $2, 'execute') as ok", [role, sig]);
        expect(r.rows[0].ok, role).toBe(false);
      }
      const svc = await c.query("select has_function_privilege('service_role', $1, 'execute') as ok", [sig]);
      expect(svc.rows[0].ok).toBe(true);
    });
  });
});
