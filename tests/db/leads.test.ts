import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  attempt,
  cleanupUsers,
  IDS,
  purgeLeads,
  purgeStationeries,
  seedLead,
  seedStationery,
  seedUsers,
  withClaims,
  withSuperuser,
  type Identity,
} from "./helpers";

type Fx = { a: string; b: string; leadA: { id: string; code: string }; leadB: { id: string; code: string } };

/** Papelaria A (dono stationery_member) e B (dono school_member), um lead do parent em cada uma. */
async function fixture(c: Client): Promise<Fx> {
  const a = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
  const b = await seedStationery(c, { status: "active", ownerId: IDS.school_member });
  const leadA = await seedLead(c, { stationeryId: a, requesterId: IDS.parent });
  const leadB = await seedLead(c, { stationeryId: b, requesterId: IDS.parent });
  return { a, b, leadA, leadB };
}
async function ids(c: Client, table: string): Promise<string[]> {
  return (await c.query(`select id from public.${table}`)).rows.map((r) => r.id as string);
}
const SAFE_LEAD_COLS =
  "id, code, cart_id, list_id, stationery_id, status, school_name, grade_label, school_year, municipality_id, neighborhood, item_count, expires_at, quoted_total_cents, quoted_at, declared_sale_cents, declared_at, close_reason, is_demo, created_at, updated_at";

describe("S14 leads · colunas e checks", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("tabelas existem com RLS habilitada e chaves padrão", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select c.relname, c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace
          and c.relname in ('leads', 'lead_items', 'lead_events') order by 1`,
      );
      expect(r.rows).toEqual([
        { relname: "lead_events", relrowsecurity: true },
        { relname: "lead_items", relrowsecurity: true },
        { relname: "leads", relrowsecurity: true },
      ]);
      const cols = await c.query(
        `select table_name, column_name, column_default from information_schema.columns
          where table_schema = 'public' and table_name in ('leads', 'lead_items', 'lead_events') and column_name in ('id', 'created_at', 'updated_at')`,
      );
      expect(cols.rows).toHaveLength(9);
      expect(cols.rows.filter((x) => x.column_name === "id").every((x) => /gen_random_uuid/.test(x.column_default))).toBe(true);
    });
  });

  it("não há FK para tabelas de outras trilhas (só profiles, municipalities, carts, stationeries e o próprio lead)", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select distinct cl.relname as referenced from pg_constraint k
           join pg_class t on t.oid = k.conrelid join pg_class cl on cl.oid = k.confrelid
          where k.contype = 'f' and t.relnamespace = 'public'::regnamespace and t.relname in ('leads', 'lead_items', 'lead_events')`,
      );
      expect(r.rows.map((x) => x.referenced).sort()).toEqual(["carts", "leads", "municipalities", "profiles", "stationeries"]);
    });
  });

  it("checks: código, itens, valores, close_reason, ano e status", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const bad = async (overrides: Record<string, unknown>, label: string) => {
        await c.query("reset role");
        await c.query("savepoint chk");
        let failed = false;
        try {
          await seedLead(c, { stationeryId: st, overrides });
        } catch (e) {
          failed = (e as { code?: string }).code === "23514" || (e as { code?: string }).code === "23505";
        }
        await c.query("rollback to savepoint chk");
        expect(failed, label).toBe(true);
      };
      for (const code of ["LC-", "LC-ABC", "LC-ABCDEFG", "lc-ABCD", "LC-ABCI", "LC-ABCL", "LC-ABCO", "LC-ABCU", "XX-ABCD", "LC-AB CD"]) {
        await bad({ code }, `code ${code}`);
      }
      await bad({ item_count: 0 }, "item_count 0");
      await bad({ item_count: 301 }, "item_count 301");
      await bad({ school_year: 1999 }, "year");
      await bad({ school_year: 2101 }, "year");
      await bad({ quoted_total_cents: 0 }, "quote 0");
      await bad({ quoted_total_cents: 10_000_001 }, "quote max");
      await bad({ declared_sale_cents: -5 }, "sale neg");
      await bad({ close_reason: "outro qualquer" }, "close_reason");
      await bad({ neighborhood: "Centro" }, "bairro não normalizado");
      await bad({ school_name: "" }, "school_name");
      await bad({ consent_text_version: " " }, "consent version");
      // válidos
      for (const code of ["LC-0123", "LC-ABCDE", "LC-ZZZZZZ"]) {
        await c.query("savepoint ok");
        await seedLead(c, { stationeryId: st, code });
        await c.query("release savepoint ok");
      }
      for (const reason of ["price", "stock", "no_reply", "bought_elsewhere", "other"]) {
        await seedLead(c, { stationeryId: st, overrides: { close_reason: reason } });
      }
      // código único
      await c.query("savepoint dup");
      await expect(seedLead(c, { stationeryId: st, code: "LC-0123" })).rejects.toMatchObject({ code: "23505" });
      await c.query("rollback to savepoint dup");
    });
  });

  it("um lead aberto por (solicitante, papelaria, lista); terminal libera", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const list = randomUUID();
      await seedLead(c, { stationeryId: st, listId: list });
      await c.query("savepoint dup");
      await expect(seedLead(c, { stationeryId: st, listId: list, status: "viewed" })).rejects.toMatchObject({ code: "23505" });
      await c.query("rollback to savepoint dup");
      await seedLead(c, { stationeryId: st, listId: list, status: "cancelled" });
      await seedLead(c, { stationeryId: st, listId: list, status: "expired" });
    });
  });

  it("itens: quantidade 1..999, nome 1..200, posição única; sem coluna de estudante", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const { id } = await seedLead(c, { stationeryId: st });
      await c.query("reset role");
      const ins = (pos: number, name: string, q: number) =>
        attempt(c, "insert into public.lead_items (lead_id, position, name, item_key, quantity) values ($1, $2, $3, 'k', $4)", [id, pos, name, q]);
      expect((await ins(2, "Lápis", 0)).code).toBe("23514");
      expect((await ins(2, "Lápis", 1000)).code).toBe("23514");
      expect((await ins(2, "", 1)).code).toBe("23514");
      expect((await ins(2, "x".repeat(201), 1)).code).toBe("23514");
      expect((await ins(1, "Lápis", 1)).code).toBe("23505"); // posição 1 já existe
      expect((await ins(2, "Lápis", 999)).error).toBeNull();
      const cols = (await c.query("select column_name from information_schema.columns where table_name = 'lead_items' and table_schema = 'public'")).rows.map((r) => r.column_name);
      expect(cols.sort()).toEqual(["created_at", "id", "item_key", "lead_id", "name", "position", "quantity", "updated_at"]);
    });
  });

  it("eventos: tipos e papéis válidos", async () => {
    await withClaims("system", async (c) => {
      const st = await seedStationery(c, { status: "active" });
      const { id } = await seedLead(c, { stationeryId: st });
      await c.query("reset role");
      const ins = (t: string, role: string) => attempt(c, "insert into public.lead_events (lead_id, event_type, actor_role) values ($1, $2, $3)", [id, t, role]);
      expect((await ins("invented", "parent")).code).toBe("23514");
      expect((await ins("viewed", "owner")).code).toBe("23514");
      for (const t of ["created", "viewed", "status_changed", "quote_registered", "sale_declared", "closed_lost", "cancelled", "expired", "whatsapp_opened"]) {
        expect((await ins(t, "system")).error, t).toBeNull();
      }
    });
  });
});

describe("S14 leads · RLS e grants por coluna", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("solicitante lê o próprio lead; outro parent, membro da outra papelaria e anon não", async () => {
    await withClaims("parent", async (c) => {
      const fx = await fixture(c);
      const seen = (await c.query(`select ${SAFE_LEAD_COLS} from public.leads`)).rows.map((r) => r.id);
      expect(seen).toEqual(expect.arrayContaining([fx.leadA.id, fx.leadB.id]));
      expect((await c.query("select id from public.lead_items where lead_id = any($1::uuid[])", [[fx.leadA.id, fx.leadB.id]])).rowCount).toBe(2);
      expect((await c.query("select id from public.lead_events where lead_id = any($1::uuid[])", [[fx.leadA.id, fx.leadB.id]])).rowCount).toBe(2);
    });
    await withClaims("system", async (c) => {
      const fx = await fixture(c);
      // perfil parent alheio (spare ganha profile parent só nesta transação)
      await c.query("reset role");
      await c.query("insert into public.profiles (id, role, display_name) values ($1, 'parent', 'Outro') on conflict (id) do update set role = 'parent'", [IDS.spare]);
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.spare })]);
      for (const t of ["leads", "lead_items", "lead_events"]) expect((await ids(c, t)).length, t).toBe(0);
      void fx;
    });
    await withClaims("anon", async (c) => {
      for (const t of ["leads", "lead_items", "lead_events"]) {
        expect((await attempt(c, `select id from public.${t}`)).code, t).toBe("42501");
      }
    });
  });

  it("membro da papelaria vê só os leads, itens e eventos da própria papelaria (sem vazamento entre papelarias)", async () => {
    for (const [who, mine, theirs] of [
      ["stationery_member", "leadA", "leadB"],
      ["school_member", "leadB", "leadA"],
    ] as const) {
      await withClaims(who as Identity, async (c) => {
        const fx = await fixture(c);
        const m = fx[mine], t = fx[theirs];
        const leads = (await c.query("select id from public.leads")).rows.map((r) => r.id);
        expect(leads, who).toContain(m.id);
        expect(leads, who).not.toContain(t.id);
        expect((await c.query("select 1 from public.lead_items where lead_id = $1", [m.id])).rowCount).toBe(1);
        expect((await c.query("select 1 from public.lead_items where lead_id = $1", [t.id])).rowCount).toBe(0);
        expect((await c.query("select 1 from public.lead_events where lead_id = $1", [m.id])).rowCount).toBe(1);
        expect((await c.query("select 1 from public.lead_events where lead_id = $1", [t.id])).rowCount).toBe(0);
        expect((await c.query("select 1 from public.leads where code = $1", [t.code])).rowCount).toBe(0);
      });
    }
  });

  it("admin lê todos", async () => {
    await withClaims("admin", async (c) => {
      const fx = await fixture(c);
      const leads = (await c.query("select id from public.leads")).rows.map((r) => r.id);
      expect(leads).toEqual(expect.arrayContaining([fx.leadA.id, fx.leadB.id]));
      expect((await c.query("select 1 from public.lead_events where lead_id = $1", [fx.leadA.id])).rowCount).toBe(1);
    });
  });

  it("grants por coluna: nada que identifique o responsável (requester_id, consent_*, idempotency_key, actor_id)", async () => {
    await withClaims("stationery_member", async (c) => {
      const fx = await fixture(c);
      for (const col of ["requester_id", "consent_id", "consent_text_version", "consented_at", "idempotency_key"]) {
        const r = await attempt(c, `select ${col} from public.leads where id = $1`, [fx.leadA.id]);
        expect(r.code, col).toBe("42501");
      }
      expect((await attempt(c, "select * from public.leads")).code).toBe("42501");
      expect((await attempt(c, "select actor_id from public.lead_events")).code).toBe("42501");
      expect((await attempt(c, "select * from public.lead_events")).code).toBe("42501");
      const ok = await attempt(c, `select ${SAFE_LEAD_COLS} from public.leads where id = $1`, [fx.leadA.id]);
      expect(ok.error).toBeNull();
      expect(ok.rows[0]).not.toHaveProperty("requester_id");
      expect((await attempt(c, "select id, lead_id, event_type, from_status, to_status, actor_role, amount_cents, reason, item_count, created_at from public.lead_events")).error).toBeNull();
      expect((await attempt(c, "select * from public.lead_items")).error).toBeNull();
    });
    await withClaims("parent", async (c) => {
      const fx = await fixture(c);
      for (const col of ["requester_id", "consent_id", "idempotency_key"]) {
        expect((await attempt(c, `select ${col} from public.leads where id = $1`, [fx.leadA.id])).code, col).toBe("42501");
      }
      expect((await attempt(c, "select actor_id from public.lead_events")).code).toBe("42501");
    });
  });

  it("ninguém escreve direto: authenticated e service_role sem INSERT/UPDATE/DELETE/TRUNCATE", async () => {
    for (const who of ["parent", "stationery_member", "admin", "system"] as Identity[]) {
      await withClaims(who, async (c) => {
        const fx = await fixture(c);
        await c.query(`set local role ${who === "system" ? "service_role" : "authenticated"}`);
        const map = who === "system" ? "service_role" : "authenticated";
        const stmts: [string, unknown[]][] = [
          ["update public.leads set status = 'converted' where id = $1", [fx.leadA.id]],
          ["update public.leads set expires_at = now() + interval '90 days' where id = $1", [fx.leadA.id]],
          ["delete from public.leads where id = $1", [fx.leadA.id]],
          ["insert into public.leads (code) values ('LC-ZZZZ')", []],
          ["insert into public.lead_items (lead_id, position, name, item_key, quantity) values ($1, 9, 'x', 'x', 1)", [fx.leadA.id]],
          ["update public.lead_items set quantity = 99 where lead_id = $1", [fx.leadA.id]],
          ["delete from public.lead_items where lead_id = $1", [fx.leadA.id]],
          ["insert into public.lead_events (lead_id, event_type, actor_role) values ($1, 'viewed', 'parent')", [fx.leadA.id]],
          ["update public.lead_events set reason = 'x' where lead_id = $1", [fx.leadA.id]],
          ["delete from public.lead_events where lead_id = $1", [fx.leadA.id]],
          ["truncate public.lead_events", []],
          ["truncate public.leads cascade", []],
        ];
        for (const [sql, params] of stmts) {
          const r = await attempt(c, sql, params);
          expect(r.code, `${map}: ${sql}`).toBe("42501");
        }
        await c.query("reset role");
        expect((await c.query("select status::text from public.leads where id = $1", [fx.leadA.id])).rows[0].status).toBe("received");
      });
    }
  });

  it("service_role lê tudo (inclusive requester_id) para o servidor", async () => {
    await withClaims("system", async (c) => {
      const fx = await fixture(c);
      const r = await c.query("select requester_id, consent_text_version, idempotency_key from public.leads where id = $1", [fx.leadA.id]);
      expect(r.rows[0].requester_id).toBe(IDS.parent);
    });
  });
});

describe("S14 leads · imutabilidade, vínculo e auditoria", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("eventos e itens são imutáveis até para o dono do banco (UPDATE, DELETE, TRUNCATE)", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        const st = await seedStationery(c, { status: "active" });
        const { id } = await seedLead(c, { stationeryId: st });
        for (const sql of [
          "update public.lead_events set reason = 'x' where lead_id = $1",
          "delete from public.lead_events where lead_id = $1",
          "truncate public.lead_events",
          "update public.lead_items set quantity = 5 where lead_id = $1",
          "delete from public.lead_items where lead_id = $1",
          "truncate public.lead_items",
        ]) {
          const r = await attempt(c, sql, sql.includes("truncate") ? [] : [id]);
          expect(r.code, sql).toBe("42501");
          expect(r.error, sql).toMatch(/imutável/);
        }
        // a papelaria com lead não some (FK restrict)
        expect((await attempt(c, "delete from public.stationeries where id = $1", [st])).code).toBe("23503");
        // apagar o lead esbarra na imutabilidade dos eventos/itens (cascade dispara o bloqueio)
        expect((await attempt(c, "delete from public.leads where id = $1", [id])).code).toBe("42501");
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("excluir o perfil do solicitante anula requester_id e preserva lead, itens e eventos", async () => {
    const stationeryIds: string[] = [];
    const leadIds: string[] = [];
    try {
      const lead = await withSuperuser(async (c) => {
        await c.query("begin");
        const st = await seedStationery(c, { status: "active" });
        stationeryIds.push(st);
        const l = await seedLead(c, { stationeryId: st, requesterId: IDS.spare });
        leadIds.push(l.id);
        await c.query("commit");
        return l.id;
      }).catch(async (e: unknown) => {
        throw e;
      });
      void lead;
    } catch {
      // IDS.spare não tem profile: cria e usa dentro da própria transação abaixo
    }
    await withSuperuser(async (c) => {
      await c.query("begin");
      let leadId = "";
      let st = "";
      try {
        await c.query("insert into public.profiles (id, role, display_name) values ($1, 'parent', 'Temporário')", [IDS.spare]);
        st = await seedStationery(c, { status: "active" });
        leadId = (await seedLead(c, { stationeryId: st, requesterId: IDS.spare })).id;
        await c.query("delete from public.profiles where id = $1", [IDS.spare]);
        const l = (await c.query("select requester_id, status::text from public.leads where id = $1", [leadId])).rows[0];
        expect(l).toEqual({ requester_id: null, status: "received" });
        expect((await c.query("select 1 from public.lead_items where lead_id = $1", [leadId])).rowCount).toBe(1);
        expect((await c.query("select 1 from public.lead_events where lead_id = $1", [leadId])).rowCount).toBe(1);
      } finally {
        await c.query("rollback");
      }
    });
    await purgeLeads({ leadIds });
    await purgeStationeries(stationeryIds);
  });

  it("carrinho apagado zera cart_id sem apagar o lead", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        const st = await seedStationery(c, { status: "active" });
        const cart = (await c.query("insert into public.carts (owner_id, is_demo) values ($1, true) returning id", [IDS.parent])).rows[0].id as string;
        const { id } = await seedLead(c, { stationeryId: st, cartId: cart });
        await c.query("delete from public.carts where id = $1", [cart]);
        expect((await c.query("select cart_id from public.leads where id = $1", [id])).rows[0].cart_id).toBeNull();
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("audit_log registra leads sem idempotency_key nem consent_*", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        const st = await seedStationery(c, { status: "active" });
        const { id } = await seedLead(c, { stationeryId: st });
        const r = await c.query("select after from public.audit_log where entity_table = 'leads' and entity_id = $1 and action = 'INSERT'", [id]);
        expect(r.rows).toHaveLength(1);
        const after = r.rows[0].after as Record<string, unknown>;
        expect(after.code).toBeDefined();
        for (const k of ["idempotency_key", "consent_id", "consent_text_version", "consented_at"]) expect(after, k).not.toHaveProperty(k);
        // função de transição também audita a mudança
        await c.query("set local role service_role");
        await c.query("select public.lead_transition($1::uuid, 'cancelled', $2::uuid, 'parent', null, null)", [id, IDS.parent]);
        await c.query("reset role");
        const u = await c.query("select before, after from public.audit_log where entity_table = 'leads' and entity_id = $1 and action = 'UPDATE'", [id]);
        expect(u.rows).toHaveLength(1);
        expect(u.rows[0].before).not.toHaveProperty("idempotency_key");
        expect(u.rows[0].after.status).toBe("cancelled");
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("updated_at acompanha a mudança do lead", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        const st = await seedStationery(c, { status: "active" });
        const { id } = await seedLead(c, { stationeryId: st });
        await c.query("update public.leads set updated_at = now() - interval '1 day' where id = $1", [id]);
        await c.query("update public.leads set item_count = 2 where id = $1", [id]);
        const r = await c.query("select updated_at > now() - interval '1 minute' as fresh from public.leads where id = $1", [id]);
        expect(r.rows[0].fresh).toBe(true);
      } finally {
        await c.query("rollback");
      }
    });
  });
});
