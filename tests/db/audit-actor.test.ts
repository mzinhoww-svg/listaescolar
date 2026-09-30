import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asOwner, attempt, cleanupUsers, IDS, seedStationery, seedUsers, withClaims, withSuperuser } from "./helpers";

// S29 · UX-108: a trilha de auditoria registra QUEM da equipe decidiu (0804_s29_audit_actor).
const CALL = "select public.stationery_transition($1::uuid, $2::public.stationery_status, $3::uuid, $4::text, $5::text)::text as s";

const lastAudit = async (c: Client, id: string) =>
  (
    await c.query(
      `select actor_id, actor_role from public.audit_log
        where entity_table = 'stationeries' and entity_id = $1 and action = 'UPDATE' order by created_at desc, id desc limit 1`,
      [id],
    )
  ).rows[0] as { actor_id: string | null; actor_role: string | null };

describe("S29 audit_log: ator da decisão da equipe", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("aprovação de papelaria por admin grava o actor_id do admin (role admin)", async () => {
    await withClaims("system", async (c) => {
      const id = await seedStationery(c, { status: "under_review" });
      expect((await attempt(c, CALL, [id, "approved", IDS.admin, "admin", null])).error).toBeNull();
      expect(await lastAudit(c, id)).toEqual({ actor_id: IDS.admin, actor_role: "admin" });
    });
  });

  it("o ator não vaza para escritas seguintes na mesma transação", async () => {
    await withClaims("system", async (c) => {
      const id = await seedStationery(c, { status: "under_review" });
      await attempt(c, CALL, [id, "approved", IDS.admin, "admin", null]);
      expect((await c.query("select current_setting('app.actor_id', true) as v")).rows[0].v ?? "").toBe("");
      await c.query("update public.stationeries set trade_name = 'Outro nome' where id = $1", [id]);
      expect(await lastAudit(c, id)).toEqual({ actor_id: null, actor_role: "system" });
    });
  });

  it("id de quem não é admin/system não é atribuído: segue 'system'", async () => {
    await withClaims("system", async (c) => {
      const id = await seedStationery(c, { status: "under_review" });
      const r = (await c.query("select public.audit_set_actor($1) as ok", [IDS.parent])).rows[0];
      expect(r.ok).toBe(false);
      await c.query("update public.stationeries set trade_name = 'X1' where id = $1", [id]);
      expect(await lastAudit(c, id)).toEqual({ actor_id: null, actor_role: "system" });
      expect((await c.query("select public.audit_set_actor($1) as ok", [IDS.admin])).rows[0].ok).toBe(true);
      expect((await c.query("select public.audit_set_actor($1) as ok", [IDS.orphan])).rows[0].ok).toBe(false);
      expect((await c.query("select public.audit_set_actor(null) as ok")).rows[0].ok).toBe(false);
    });
  });

  it.each([
    ["claims anon", { role: "anon" }],
    ["claims authenticated de um pai", { role: "authenticated" }],
    ["claim service_role sem o role de banco (claim sozinho não basta)", { role: "service_role" }],
  ])("ajuste forjado com %s é ignorado", async (_label, claims) => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        const id = await seedStationery(c, { status: "under_review" });
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        expect((await c.query("select public.audit_set_actor($1) as ok", [IDS.admin])).rows[0].ok).toBe(false);
        await c.query("select set_config('app.actor_id', $1, true)", [IDS.admin]);
        await c.query("update public.stationeries set trade_name = 'Forjado' where id = $1", [id]);
        expect((await lastAudit(c, id)).actor_id).toBeNull();
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("sessão anon/authenticated não executa audit_set_actor nem as funções de decisão", async () => {
    for (const who of ["anon", "parent", "admin"] as const) {
      await withClaims(who, async (c) => {
        expect((await attempt(c, "select public.audit_set_actor($1)", [IDS.admin])).code).toBe("42501");
        expect((await attempt(c, "select public.audit_trusted_context()")).code).toBe("42501");
      });
    }
  });

  it("ator que deixou de ser admin/system não é aceito nem com o ajuste já gravado", async () => {
    await withClaims("system", async (c) => {
      const id = await seedStationery(c, { status: "under_review" });
      await c.query("reset role");
      await c.query("select set_config('app.actor_id', $1, true)", [IDS.parent]);
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await c.query("set local role service_role");
      await c.query("update public.stationeries set trade_name = 'P1' where id = $1", [id]);
      expect(await lastAudit(c, id)).toEqual({ actor_id: null, actor_role: "system" });
    });
  });

  it("escrita só com service_role (sem função de decisão) segue 'system'", async () => {
    await withClaims("system", async (c) => {
      const id = await seedStationery(c, { status: "under_review" });
      await c.query("update public.stationeries set trade_name = 'S2' where id = $1", [id]);
      expect(await lastAudit(c, id)).toEqual({ actor_id: null, actor_role: "system" });
    });
  });

  it("as 17 funções de decisão: invólucro é definer, search_path vazio, EXECUTE só service_role; núcleo sem EXECUTE", async () => {
    const names = [
      "stationery_transition", "lead_dispute_resolve", "claim_decide", "review_approve", "review_reject", "list_transition",
      "list_publish_version", "list_approve_version", "b2b_partner_decide", "b2b_campaign_transition", "billing_plan_publish",
      "payout_settings_publish", "billing_reverse_entry", "payout_reverse_entry", "payout_batch_create", "payout_batch_mark_executed",
      "payout_admin_validate_sale",
    ];
    await withSuperuser(async (c) => {
      for (const n of names) {
        const r = await c.query(
          `select p.proname, p.prosecdef, p.proconfig,
                  has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
                  has_function_privilege('service_role', p.oid, 'execute') as svc, has_function_privilege('public', p.oid, 'execute') as pub
             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ($1, $2) order by p.proname`,
          [n, `${n}__core`],
        );
        expect(r.rows.map((x) => x.proname)).toEqual([n, `${n}__core`]);
        const [wrap, core] = r.rows;
        expect(wrap).toMatchObject({ prosecdef: true, anon: false, auth: false, svc: true, pub: false });
        expect(wrap.proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/^search_path=("")?$/)]));
        expect(core).toMatchObject({ anon: false, auth: false, svc: false, pub: false });
      }
      for (const f of ["audit_set_actor(uuid)", "audit_trusted_context()"]) {
        const r = await c.query(
          `select has_function_privilege('anon', $1::regprocedure, 'execute') as anon, has_function_privilege('authenticated', $1::regprocedure, 'execute') as auth,
                  has_function_privilege('service_role', $1::regprocedure, 'execute') as svc, has_function_privilege('public', $1::regprocedure, 'execute') as pub`,
          [`public.${f}`],
        );
        expect(r.rows[0]).toMatchObject({ anon: false, auth: false, pub: false, svc: f.startsWith("audit_set_actor") });
      }
    });
  });

  it("chamada encadeada: o invólucro interno restaura o ator da função externa (escritas seguintes seguem atribuídas)", async () => {
    await withClaims("system", async (c) => {
      const id = await seedStationery(c, { status: "under_review" });
      await asOwner(c, async () => {
        await c.query(
          `create function public.zz_chain_probe(p uuid, a uuid) returns void language plpgsql security definer set search_path = '' as $$
           begin
             perform public.audit_set_actor(a);
             perform public.stationery_transition(p, 'approved', a, 'admin', null);
             update public.stationeries set trade_name = 'Encadeado' where id = p;
           end; $$`,
        );
        await c.query("grant execute on function public.zz_chain_probe(uuid, uuid) to service_role");
      });
      await c.query("select public.zz_chain_probe($1, $2)", [id, IDS.admin]);
      expect(await lastAudit(c, id)).toEqual({ actor_id: IDS.admin, actor_role: "admin" });
    });
  });

  it("wrappers têm comentário de função e os núcleos são marcados como internos", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select p.proname, obj_description(p.oid, 'pg_proc') as d from pg_proc p
          where p.pronamespace = 'public'::regnamespace and (p.proname like '%\\_\\_core' or p.proname in ('stationery_transition', 'payout_batch_create', 'billing_reverse_entry'))`,
      );
      expect(r.rows.length).toBe(20);
      const cores = r.rows.filter((x) => String(x.proname).endsWith("__core"));
      expect(cores).toHaveLength(17);
      for (const x of r.rows) expect(x.d, x.proname).toBeTruthy();
      for (const x of cores) expect(x.d, x.proname).toMatch(/interno|Interno/i);
    });
  });

  it("audit_log continua append-only para o service_role", async () => {
    await withClaims("system", async (c) => {
      const r = await attempt(c, "update public.audit_log set actor_id = $1", [IDS.admin]);
      expect(r.error !== null || r.rowCount === 0).toBe(true);
    });
  });
});

