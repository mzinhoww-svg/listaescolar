import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";

import { purgePartners, seedKey, seedPartner } from "./b2b-fixtures";
import { asServiceCommitted, cleanupUsers, IDS, inTx, seedUsers, withSuperuser } from "./helpers";

type Consume = { allowed: boolean; key_valid: boolean; window_kind: string | null; limit_value: number | null; remaining: number | null; reset_at: string | null };

async function consume(c: Client, keyId: string): Promise<Consume> {
  const r = await c.query("select * from public.b2b_rate_consume($1)", [keyId]);
  return r.rows[0] as Consume;
}

describe("S24 · rate limit por chave (b2b_rate_consume)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("limite por minuto: K permitidas, a seguinte negada com reset no fim do minuto; negada não consome", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: null, limits: { liveMinute: 3, liveDay: 100 } });
      const k = await seedKey(c, p, { environment: "live" });
      const seen: Consume[] = [];
      for (let i = 0; i < 5; i++) seen.push(await consume(c, k.id));
      expect(seen.map((s) => s.allowed)).toEqual([true, true, true, false, false]);
      expect(seen.slice(0, 3).map((s) => s.remaining)).toEqual([2, 1, 0]);
      expect(seen[3]).toMatchObject({ key_valid: true, window_kind: "minute", limit_value: 3, remaining: 0 });
      const reset = new Date(seen[3]!.reset_at as string).getTime();
      expect(reset).toBeGreaterThan(Date.now());
      expect(reset).toBeLessThanOrEqual(Date.now() + 60_000);
      const w = await c.query("select window_kind, count from public.b2b_rate_windows where partner_id = $1 order by window_kind", [p]);
      expect(w.rows).toEqual([{ window_kind: "day", count: 3 }, { window_kind: "minute", count: 3 }]);
    });
  });

  it("limite por dia (America/Cuiaba) é a janela mais restritiva quando sobra menos", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: null, limits: { liveMinute: 100, liveDay: 2 } });
      const k = await seedKey(c, p, { environment: "live" });
      const first = await consume(c, k.id);
      expect(first).toMatchObject({ allowed: true, window_kind: "day", limit_value: 2, remaining: 1 });
      await consume(c, k.id);
      const denied = await consume(c, k.id);
      expect(denied).toMatchObject({ allowed: false, window_kind: "day", remaining: 0 });
      const day = await c.query(
        "select window_start = date_trunc('day', now() at time zone 'America/Cuiaba') at time zone 'America/Cuiaba' as ok from public.b2b_rate_windows where partner_id = $1 and window_kind = 'day'",
        [p],
      );
      expect(day.rows[0]?.ok).toBe(true);
      const resetLocal = (await c.query("select (($1::timestamptz) at time zone 'America/Cuiaba')::text as t", [denied.reset_at])).rows[0]?.t as string;
      expect(resetLocal).toMatch(/ 00:00:00$/);
    });
  });

  it("balde compartilhado pelas duas chaves da rotação (parceiro, ambiente); ambientes separados", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: null, limits: { liveMinute: 2, liveDay: 100, testMinute: 1, testDay: 10 } });
      const a = await seedKey(c, p, { environment: "live" });
      const b = await seedKey(c, p, { environment: "live" });
      const t = await seedKey(c, p, { environment: "test" });
      expect((await consume(c, a.id)).allowed).toBe(true);
      expect((await consume(c, b.id)).allowed).toBe(true);
      expect((await consume(c, a.id)).allowed).toBe(false);
      expect((await consume(c, t.id)).allowed).toBe(true);
      expect((await consume(c, t.id)).allowed).toBe(false);
    });
  });

  it("revalida a chave: revogada, expirada ou parceiro suspenso -> key_valid=false sem consumir", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: null, limits: { liveMinute: 5, liveDay: 5 } });
      const k = await seedKey(c, p, { environment: "live" });
      expect((await consume(c, k.id)).key_valid).toBe(true);
      await c.query("update public.b2b_api_keys set status = 'revoked', revoked_at = now() where id = $1", [k.id]);
      const r = await consume(c, k.id);
      expect(r).toMatchObject({ allowed: false, key_valid: false });
      const w = await c.query("select count from public.b2b_rate_windows where partner_id = $1 and window_kind = 'minute'", [p]);
      expect(w.rows[0]?.count).toBe(1);
      const k2 = await seedKey(c, p, { environment: "live", expiresAt: "-1 minute" });
      expect((await consume(c, k2.id)).key_valid).toBe(false);
      const k3 = await seedKey(c, p, { environment: "live" });
      await c.query("update public.b2b_partners set status = 'suspended' where id = $1", [p]);
      expect((await consume(c, k3.id)).key_valid).toBe(false);
      expect((await consume(c, "00000000-0000-4000-8000-0000000000ff")).key_valid).toBe(false);
    });
  });

  it("concorrência: 3K chamadas paralelas com limite K -> exatamente K permitidas, sem deadlock", async () => {
    const K = 4;
    const ids = await asServiceCommitted(async (c) => {
      await c.query("reset role");
      const p = await seedPartner(c, { status: "active", ownerId: null, limits: { liveMinute: K, liveDay: 1000 } });
      const k = await seedKey(c, p, { environment: "live" });
      return { p, k: k.id };
    });
    try {
      const results = await Promise.all(
        Array.from({ length: 3 * K }, () =>
          asServiceCommitted(async (c) => consume(c, ids.k)),
        ),
      );
      expect(results.filter((r) => r.allowed)).toHaveLength(K);
      expect(results.filter((r) => !r.allowed)).toHaveLength(2 * K);
      const w = await withSuperuser(async (c) => (await c.query("select count from public.b2b_rate_windows where partner_id = $1 and window_kind = 'minute'", [ids.p])).rows[0]?.count as number);
      expect(w).toBe(K);
    } finally {
      await purgePartners([ids.p]);
    }
  });

  it("prune apaga janelas antigas e é idempotente; uso diário faz upsert e recusa classe inválida", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: null });
      const k = await seedKey(c, p, { environment: "live" });
      await c.query("insert into public.b2b_rate_windows (partner_id, environment, window_kind, window_start, count) values ($1, 'live', 'minute', now() - interval '3 days', 1), ($1, 'live', 'day', now() - interval '3 days', 1), ($1, 'live', 'minute', now(), 1)", [p]);
      const n1 = (await c.query("select public.b2b_prune_rate_windows('2 days') as n")).rows[0]?.n as number;
      expect(n1).toBe(2);
      const n2 = (await c.query("select public.b2b_prune_rate_windows('2 days') as n")).rows[0]?.n as number;
      expect(n2).toBe(0);
      expect((await c.query("select count(*)::int as n from public.b2b_rate_windows where partner_id = $1", [p])).rows[0]?.n).toBe(1);

      await c.query("select public.b2b_usage_record($1, 'lists.items', '2xx', 0, 0)", [k.id]);
      await c.query("select public.b2b_usage_record($1, 'lists.items', '2xx', 0, 0)", [k.id]);
      await c.query("select public.b2b_usage_record($1, 'carts.match', '2xx', 10, 7)", [k.id]);
      await c.query("select public.b2b_usage_record($1, 'carts.match', '2xx', 4, 1)", [k.id]);
      await c.query("select public.b2b_usage_record($1, 'carts.match', '429', 0, 0)", [k.id]);
      const rows = await c.query("select endpoint, status_class, request_count, match_items_total, match_items_matched from public.b2b_usage_daily where key_id = $1 order by endpoint, status_class", [k.id]);
      expect(rows.rows).toEqual([
        { endpoint: "carts.match", status_class: "2xx", request_count: 2, match_items_total: 14, match_items_matched: 8 },
        { endpoint: "carts.match", status_class: "429", request_count: 1, match_items_total: 0, match_items_matched: 0 },
        { endpoint: "lists.items", status_class: "2xx", request_count: 2, match_items_total: 0, match_items_matched: 0 },
      ]);
      const cols = (await c.query("select column_name from information_schema.columns where table_schema='public' and table_name='b2b_usage_daily'")).rows.map((r) => r.column_name as string);
      for (const forbidden of ["ip", "ip_hash", "user_agent", "body", "query", "sku"]) expect(cols).not.toContain(forbidden);
      const bad = await c.query("select 1").then(async () => {
        await c.query("savepoint s");
        try {
          await c.query("select public.b2b_usage_record($1, 'x', '3xx', 0, 0)", [k.id]);
          return "aceitou";
        } catch (e) {
          return (e as { hint?: string }).hint ?? "erro";
        } finally {
          await c.query("rollback to savepoint s");
        }
      });
      expect(bad).toBe("invalid_input");
      expect(IDS.parent).toBeTruthy();
    });
  });
});
