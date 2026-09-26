import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";

import { hashSecret, publicId, secret, seedKey, seedPartner } from "./b2b-fixtures";
import { attempt, attemptH, cleanupUsers, IDS, inTx, seedUsers } from "./helpers";

type Created = { id: string };

function create(c: Client, actor: string | null, partner: string, env: string, scopes: string[] = ["schools:read", "lists:read"]) {
  const s = secret();
  return attemptH(c, "select public.b2b_key_create($1, $2, $3, $4, $5, 1, $6, $7::text[]) as id", [actor, partner, env, publicId(), hashSecret(s), s.slice(-4), scopes]);
}
function rotate(c: Client, actor: string | null, oldId: string, grace = "7 days") {
  const s = secret();
  return attemptH(c, "select public.b2b_key_rotate($1, $2, $3, $4, 1, $5, $6::interval) as id", [actor, oldId, publicId(), hashSecret(s), s.slice(-4), grace]);
}
function revoke(c: Client, actor: string | null, role: string, keyId: string, reason: string | null = "teste") {
  return attemptH(c, "select public.b2b_key_revoke($1, $2, $3, $4)", [actor, role, keyId, reason]);
}
async function lookup(c: Client, pid: string) {
  const r = await c.query("select * from public.b2b_key_lookup($1)", [pid]);
  return r.rows[0] as { key_id: string; partner_id: string; environment: string; key_hash: string; hash_version: number; scopes: string[]; usable: boolean; coverage_ufs: string[] | null } | undefined;
}
async function keyRow(c: Client, id: string) {
  return (await c.query("select * from public.b2b_api_keys where id = $1", [id])).rows[0] as Record<string, unknown>;
}

describe("S24 · chaves (create, rotate, revoke, lookup)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("só o dono cria; live só com parceiro active; test em sandbox e active; escopo fora do tipo recusado", async () => {
    await inTx(async (c) => {
      const sandbox = await seedPartner(c, { status: "sandbox", ownerId: IDS.parent });
      expect((await create(c, IDS.school_member, sandbox, "test")).hint).toBe("forbidden");
      expect((await create(c, null, sandbox, "test")).hint).toBe("forbidden");
      expect((await create(c, IDS.parent, sandbox, "live")).hint).toBe("environment_not_allowed");
      expect((await create(c, IDS.parent, sandbox, "prod")).hint).toBe("invalid_input");
      const ok = await create(c, IDS.parent, sandbox, "test", ["schools:read", "lists:read", "carts:match"]);
      expect(ok.error).toBeNull();
      const row = await keyRow(c, (ok.rows[0] as Created).id);
      expect(row).toMatchObject({ environment: "test", status: "active", created_by: IDS.parent, expires_at: null, rotated_from_id: null });
      expect((row.scopes as string[]).sort()).toEqual(["carts:match", "lists:read", "schools:read"]);
      const pending = await seedPartner(c, { status: "pending", ownerId: IDS.spare });
      expect((await create(c, IDS.spare, pending, "test")).hint).toBe("environment_not_allowed");
      const brand = await seedPartner(c, { status: "active", type: "brand", ownerId: IDS.school_member });
      expect((await create(c, IDS.school_member, brand, "live", ["carts:match"])).hint).toBe("scope_not_allowed");
      expect((await create(c, IDS.school_member, brand, "live", [])).hint).toBe("invalid_input");
      expect((await create(c, IDS.school_member, brand, "live", ["schools:read", "lists:read"])).error).toBeNull();
      const ev = await c.query("select event_type, actor_role, payload from public.b2b_partner_events where partner_id = $1", [brand]);
      expect(ev.rows[0]?.event_type).toBe("key_created");
      expect(JSON.stringify(ev.rows[0]?.payload)).not.toMatch(/[0-9a-f]{64}/);
    });
  });

  it("escopos permitidos por tipo (b2b_allowed_scopes)", async () => {
    await inTx(async (c) => {
      const get = async (t: string) => (await c.query("select public.b2b_allowed_scopes($1) as s", [t])).rows[0]?.s as string[];
      expect((await get("retailer")).sort()).toEqual(["carts:match", "lists:read", "schools:read"]);
      expect((await get("brand")).sort()).toEqual(["lists:read", "schools:read"]);
      expect((await get("edtech")).sort()).toEqual(["lists:read", "schools:read"]);
      expect(await get("outro")).toEqual([]);
    });
  });

  it("no máximo duas chaves utilizáveis por (parceiro, ambiente): terceira -> too_many_keys; revogada/expirada libera vaga", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const a = await create(c, IDS.parent, p, "live");
      const b = await create(c, IDS.parent, p, "live");
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect((await create(c, IDS.parent, p, "live")).hint).toBe("too_many_keys");
      // outro ambiente não conta
      expect((await create(c, IDS.parent, p, "test")).error).toBeNull();
      expect((await revoke(c, IDS.parent, "owner", (a.rows[0] as Created).id)).error).toBeNull();
      expect((await create(c, IDS.parent, p, "live")).error).toBeNull();
      await c.query("update public.b2b_api_keys set expires_at = now() - interval '1 second' where id = $1", [(b.rows[0] as Created).id]);
      expect((await create(c, IDS.parent, p, "live")).error).toBeNull();
      expect((await create(c, IDS.parent, p, "live")).hint).toBe("too_many_keys");
    });
  });

  it("rotação: cria a nova (mesmo ambiente e escopos), expira a antiga na carência, recusa se já há duas", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const old = await seedKey(c, p, { environment: "live", scopes: ["schools:read"] });
      const r = await rotate(c, IDS.parent, old.id, "7 days");
      expect(r.error).toBeNull();
      const newId = (r.rows[0] as Created).id;
      const n = await keyRow(c, newId);
      expect(n).toMatchObject({ environment: "live", scopes: ["schools:read"], rotated_from_id: old.id, status: "active", expires_at: null });
      const o = await keyRow(c, old.id);
      expect(o.status).toBe("active");
      const exp = (await c.query("select extract(epoch from (expires_at - now()))::int as s from public.b2b_api_keys where id = $1", [old.id])).rows[0]?.s as number;
      expect(exp).toBeGreaterThan(7 * 86400 - 60);
      expect(exp).toBeLessThanOrEqual(7 * 86400);
      // a antiga ainda é utilizável na carência, a nova também
      expect((await lookup(c, old.publicId))?.usable).toBe(true);
      expect((await lookup(c, n.public_id as string))?.usable).toBe(true);
      // com duas utilizáveis, rotacionar de novo é too_many_keys
      expect((await rotate(c, IDS.parent, newId)).hint).toBe("too_many_keys");
      // carência fora da faixa
      const other = await seedKey(c, p, { environment: "test" });
      expect((await rotate(c, IDS.parent, other.id, "0 days")).hint).toBe("invalid_input");
      expect((await rotate(c, IDS.parent, other.id, "31 days")).hint).toBe("invalid_input");
      // só o dono; chave revogada não rotaciona
      expect((await rotate(c, IDS.school_member, other.id)).hint).toBe("forbidden");
      await revoke(c, IDS.parent, "owner", other.id);
      expect((await rotate(c, IDS.parent, other.id)).hint).toBe("key_not_active");
      const ev = await c.query("select event_type from public.b2b_partner_events where partner_id = $1 order by created_at", [p]);
      expect(ev.rows.map((x) => x.event_type)).toContain("key_rotated");
    });
  });

  it("revogação: dono ou admin, irreversível, idempotente; public_id e key_hash imutáveis", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: IDS.parent });
      const k = await seedKey(c, p, { environment: "live" });
      expect((await revoke(c, IDS.school_member, "owner", k.id)).hint).toBe("forbidden");
      expect((await revoke(c, IDS.parent, "admin", k.id)).hint).toBe("forbidden");
      expect((await revoke(c, IDS.parent, "owner", k.id, "troca")).error).toBeNull();
      const row = await keyRow(c, k.id);
      expect(row).toMatchObject({ status: "revoked", revoked_by: IDS.parent, revoke_reason: "troca" });
      expect(row.revoked_at).not.toBeNull();
      const again = await revoke(c, IDS.admin, "admin", k.id, "outro");
      expect(again.error).toBeNull();
      expect((await keyRow(c, k.id)).revoke_reason).toBe("troca");
      expect((await lookup(c, k.publicId))?.usable).toBe(false);
      expect((await attempt(c, "update public.b2b_api_keys set status = 'active' where id = $1", [k.id])).code).toBe("42501");
      expect((await attempt(c, "update public.b2b_api_keys set public_id = 'ABCDEFGH2345' where id = $1", [k.id])).code).toBe("42501");
      expect((await attempt(c, "update public.b2b_api_keys set key_hash = repeat('b', 64) where id = $1", [k.id])).code).toBe("42501");
      const k2 = await seedKey(c, p, { environment: "test" });
      expect((await revoke(c, IDS.admin, "admin", k2.id, "admin")).error).toBeNull();
      expect((await keyRow(c, k2.id)).revoked_by).toBe(IDS.admin);
      expect((await revoke(c, IDS.parent, "owner", "00000000-0000-4000-8000-0000000000ff")).hint).toBe("not_found");
    });
  });

  it("lookup: usable=false para revogada, expirada, parceiro pending/rejected/suspended e live com sandbox; inexistente = vazio", async () => {
    await inTx(async (c) => {
      expect(await lookup(c, "ZZZZZZZZZZZZ")).toBeUndefined();
      const active = await seedPartner(c, { status: "active", ownerId: IDS.parent, coverageUfs: ["MT", "GO"] });
      const ok = await seedKey(c, active, { environment: "live" });
      const l = await lookup(c, ok.publicId);
      expect(l).toMatchObject({ key_id: ok.id, partner_id: active, environment: "live", key_hash: hashSecret(ok.secret), hash_version: 1, usable: true, coverage_ufs: ["MT", "GO"] });
      const revoked = await seedKey(c, active, { status: "revoked" });
      expect((await lookup(c, revoked.publicId))?.usable).toBe(false);
      const expired = await seedKey(c, active, { expiresAt: "-1 second" });
      expect((await lookup(c, expired.publicId))?.usable).toBe(false);
      const graced = await seedKey(c, active, { expiresAt: "+1 hour" });
      expect((await lookup(c, graced.publicId))?.usable).toBe(true);
      for (const status of ["pending", "rejected", "suspended"] as const) {
        const p = await seedPartner(c, { status, ownerId: null });
        const k = await seedKey(c, p, { environment: "test" });
        expect((await lookup(c, k.publicId))?.usable, status).toBe(false);
      }
      const sandbox = await seedPartner(c, { status: "sandbox", ownerId: null });
      const live = await seedKey(c, sandbox, { environment: "live" });
      expect((await lookup(c, live.publicId))?.usable).toBe(false);
      const test = await seedKey(c, sandbox, { environment: "test" });
      expect((await lookup(c, test.publicId))?.usable).toBe(true);
    });
  });
});
