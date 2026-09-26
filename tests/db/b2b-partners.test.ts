import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { callAsService, makeCnpj14, seedKey, seedPartner, type PartnerStatus } from "./b2b-fixtures";
import { attempt, attemptH, cleanupUsers, IDS, inTx, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";
import { switchTo } from "./list-fixtures";

const TABLES = ["b2b_partners", "b2b_partner_members", "b2b_partner_events", "b2b_api_keys", "b2b_rate_windows", "b2b_usage_daily"];

const apply = (c: Parameters<typeof callAsService>[0], actor: string | null, payload: Record<string, unknown>, terms: string | null = "b2b-api-terms-v1") =>
  callAsService<{ id: string }>(c, "select public.b2b_partner_apply($1, $2::jsonb, $3) as id", [actor, JSON.stringify(payload), terms]);

const APPLY = (over: Record<string, unknown> = {}) => ({
  trade_name: "Loja Teste",
  legal_name: "Loja Teste Comércio LTDA",
  cnpj: makeCnpj14(),
  contact_name: "Ana Contato",
  partner_type: "retailer",
  coverage_ufs: ["MT"],
  ...over,
});

const decide = (c: Parameters<typeof callAsService>[0], partnerId: string, actorId: string | null, to: string, payload: Record<string, unknown> = {}) =>
  attemptH(c, "select public.b2b_partner_decide($1, $2, $3, $4::jsonb) as s", [partnerId, actorId, to, JSON.stringify(payload)]);

const APPROVE = { plan: "regional", coverage_ufs: ["MT"], test_rate_per_minute: 10, test_rate_per_day: 100 };
const ACTIVATE = { ...APPROVE, live_rate_per_minute: 20, live_rate_per_day: 200 };

describe("S24 · 0501 schema: parceiros B2B", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("tabelas com id uuid, created_at, updated_at e RLS", async () => {
    await withSuperuser(async (c) => {
      for (const t of TABLES) {
        const cols = await c.query("select column_name, column_default from information_schema.columns where table_schema='public' and table_name=$1", [t]);
        const names = cols.rows.map((r) => r.column_name as string);
        expect(names, t).toEqual(expect.arrayContaining(["id", "created_at", "updated_at"]));
        expect(String(cols.rows.find((r) => r.column_name === "id")?.column_default), t).toMatch(/gen_random_uuid/);
        const rls = await c.query("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`]);
        expect(rls.rows[0]?.relrowsecurity, t).toBe(true);
      }
    });
  });

  it("FKs só para profiles, consents e tabelas da própria fatia (nenhuma para 04xx)", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select conrelid::regclass::text as t, confrelid::regclass::text as f from pg_constraint where contype = 'f'
           and conrelid = any(array['public.b2b_partners','public.b2b_partner_members','public.b2b_partner_events','public.b2b_api_keys','public.b2b_rate_windows','public.b2b_usage_daily']::regclass[])`,
      );
      const targets = new Set(r.rows.map((x) => String(x.f).replace(/^public\./, "")));
      for (const t of targets) expect(["profiles", "consents", "b2b_partners", "b2b_api_keys"], t).toContain(t);
      expect(targets.has("b2b_partners")).toBe(true);
    });
  });

  it("checks: CNPJ, tipo, estado, plano, UFs, limites, colunas da chave", async () => {
    await inTx(async (c) => {
      const bad = async (fn: () => Promise<unknown>, label: string) => {
        await c.query("savepoint s");
        try {
          await fn();
          await c.query("release savepoint s");
          throw new Error(`aceitou ${label}`);
        } catch (e) {
          await c.query("rollback to savepoint s");
          expect((e as Error).message, label).not.toMatch(/^aceitou/);
        }
      };
      await bad(() => seedPartner(c, { overrides: { cnpj: "1234567890123" } }), "cnpj 13");
      await bad(() => seedPartner(c, { overrides: { cnpj: "12.345.678/0001-95" } }), "cnpj com máscara");
      await bad(() => seedPartner(c, { overrides: { partner_type: "outro" } }), "tipo inválido");
      await bad(() => seedPartner(c, { overrides: { status: "foo" } }), "estado inválido");
      await bad(() => seedPartner(c, { status: "sandbox", plan: "gold" }), "plano inválido");
      await bad(() => seedPartner(c, { status: "sandbox", coverageUfs: ["mt"] }), "UF minúscula");
      await bad(() => seedPartner(c, { status: "sandbox", coverageUfs: ["XX"] }), "UF inexistente");
      await bad(() => seedPartner(c, { status: "sandbox", limits: { testMinute: 0 } }), "limite/min 0");
      await bad(() => seedPartner(c, { status: "sandbox", limits: { testDay: 10_000_001 } }), "limite/dia acima da faixa");
      await bad(() => seedPartner(c, { overrides: { trade_name: "  " } }), "nome vazio");
      const p = await seedPartner(c, { status: "sandbox" });
      await bad(() => seedKey(c, p, { overrides: { public_id: "abc" } }), "public_id curto");
      await bad(() => seedKey(c, p, { overrides: { public_id: "ILOU0123456U" } }), "public_id fora do Crockford (I, L, O, U)");
      await bad(() => seedKey(c, p, { overrides: { key_hash: "zz" } }), "hash não hex 64");
      await bad(() => seedKey(c, p, { overrides: { last4: "123" } }), "last4 com 3");
      await bad(() => seedKey(c, p, { scopes: ["schools:read", "admin:all"] }), "escopo fora do conjunto");
      await bad(() => seedKey(c, p, { overrides: { environment: "prod" } }), "ambiente inválido");
      await bad(() => seedKey(c, p, { overrides: { status: "paused" } }), "status de chave inválido");
      const k = await seedKey(c, p);
      await bad(() => seedKey(c, p, { publicId: k.publicId }), "public_id duplicado");
    });
  });

  it("CNPJ único entre parceiros não recusados (recusado pode cadastrar de novo)", async () => {
    await inTx(async (c) => {
      const cnpj = makeCnpj14();
      await seedPartner(c, { status: "rejected", ownerId: null, overrides: { cnpj } });
      await seedPartner(c, { status: "pending", ownerId: IDS.spare, overrides: { cnpj } });
      const dup = await attempt(
        c,
        `insert into public.b2b_partners (trade_name, legal_name, cnpj, contact_name, partner_type) values ('X', 'X LTDA', $1, 'C', 'brand')`,
        [cnpj],
      );
      expect(dup.code).toBe("23505");
    });
  });

  it("um perfil é dono de no máximo um parceiro; um parceiro tem um dono", async () => {
    await inTx(async (c) => {
      const a = await seedPartner(c, { ownerId: IDS.parent });
      const b = await seedPartner(c, { ownerId: null });
      const again = await attempt(c, "insert into public.b2b_partner_members (partner_id, profile_id, member_role) values ($1, $2, 'owner')", [b, IDS.parent]);
      expect(again.code).toBe("23505");
      const second = await attempt(c, "insert into public.b2b_partner_members (partner_id, profile_id, member_role) values ($1, $2, 'owner')", [a, IDS.spare]);
      expect(second.code).toBe("23505");
    });
  });
});

describe("S24 · RLS e grants", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  async function fixture(c: Parameters<typeof seedPartner>[0]) {
    const mine = await seedPartner(c, { status: "active", ownerId: IDS.parent });
    const other = await seedPartner(c, { status: "active", ownerId: IDS.school_member });
    const k = await seedKey(c, mine, { environment: "live" });
    const ko = await seedKey(c, other, { environment: "live" });
    await c.query("insert into public.b2b_partner_events (partner_id, event_type, actor_id, actor_role, from_status, to_status) values ($1, 'decided', $2, 'admin', 'pending', 'active')", [mine, IDS.admin]);
    await c.query("insert into public.b2b_partner_events (partner_id, event_type, actor_id, actor_role, from_status, to_status) values ($1, 'decided', $2, 'admin', 'pending', 'active')", [other, IDS.admin]);
    await c.query("insert into public.b2b_usage_daily (key_id, partner_id, day, endpoint, status_class, request_count) values ($1, $2, current_date, 'schools.list', '2xx', 3)", [k.id, mine]);
    await c.query("insert into public.b2b_usage_daily (key_id, partner_id, day, endpoint, status_class, request_count) values ($1, $2, current_date, 'schools.list', '2xx', 5)", [ko.id, other]);
    await c.query("insert into public.b2b_rate_windows (partner_id, environment, window_kind, window_start, count) values ($1, 'live', 'minute', now(), 1)", [mine]);
    return { mine, other, k, ko };
  }

  it("dono lê só o próprio parceiro, membros, chaves (sem key_hash), uso e eventos (sem actor_id)", async () => {
    await withClaims("parent", async (c) => {
      const f = await fixture(c);
      await switchTo(c, "parent");
      const partners = await c.query("select id from public.b2b_partners");
      expect(partners.rows.map((r) => r.id)).toEqual([f.mine]);
      const members = await c.query("select partner_id from public.b2b_partner_members");
      expect(members.rows.map((r) => r.partner_id)).toEqual([f.mine]);
      const keys = await c.query("select id, public_id, last4, environment, status, scopes from public.b2b_api_keys");
      expect(keys.rows.map((r) => r.id)).toEqual([f.k.id]);
      const hash = await attempt(c, "select key_hash from public.b2b_api_keys");
      expect(hash.code).toBe("42501");
      const hv = await attempt(c, "select hash_version from public.b2b_api_keys");
      expect(hv.code).toBe("42501");
      const usage = await c.query("select request_count from public.b2b_usage_daily");
      expect(usage.rows.map((r) => r.request_count)).toEqual([3]);
      const events = await c.query("select partner_id, event_type from public.b2b_partner_events");
      expect(events.rows.map((r) => r.partner_id)).toEqual([f.mine]);
      const actor = await attempt(c, "select actor_id from public.b2b_partner_events");
      expect(actor.code).toBe("42501");
      const windows = await attempt(c, "select count from public.b2b_rate_windows");
      expect(windows.code).toBe("42501");
    });
  });

  it("anon e perfil sem vínculo não leem nada; admin lê tudo", async () => {
    for (const who of ["anon", "stationery_member"] as Identity[]) {
      await withClaims(who, async (c) => {
        const f = await fixture(c);
        await switchTo(c, who);
        for (const t of ["b2b_partners", "b2b_partner_members", "b2b_api_keys", "b2b_usage_daily", "b2b_partner_events"]) {
          const r = await attempt(c, `select id from public.${t}`);
          expect(r.rowCount, `${who} ${t}`).toBe(0);
        }
        expect(f.mine).toBeTruthy();
      });
    }
    await withClaims("admin", async (c) => {
      const f = await fixture(c);
      await switchTo(c, "admin");
      const partners = await c.query("select id from public.b2b_partners where id = any($1::uuid[])", [[f.mine, f.other]]);
      expect(partners.rowCount).toBe(2);
      const keys = await c.query("select id, public_id from public.b2b_api_keys where id = any($1::uuid[])", [[f.k.id, f.ko.id]]);
      expect(keys.rowCount).toBe(2);
      const hash = await attempt(c, "select key_hash from public.b2b_api_keys");
      expect(hash.code).toBe("42501");
    });
  });

  it("nenhuma escrita direta por authenticated nem service_role", async () => {
    for (const who of ["parent", "admin", "system"] as Identity[]) {
      await withClaims(who, async (c) => {
        const p = await seedPartner(c, { status: "active", ownerId: IDS.parent });
        await switchTo(c, who);
        const ins = await attempt(c, "insert into public.b2b_partners (trade_name, legal_name, cnpj, contact_name, partner_type) values ('X', 'X', $1, 'C', 'brand')", [makeCnpj14()]);
        expect(ins.code, `${who} insert`).toBe("42501");
        const upd = await attempt(c, "update public.b2b_partners set trade_name = 'Y' where id = $1", [p]);
        expect(upd.code, `${who} update`).toBe("42501");
        const key = await attempt(c, "insert into public.b2b_api_keys (partner_id, environment, public_id, key_hash, hash_version, last4, scopes) values ($1, 'test', 'ABCDEFGH2345', repeat('a', 64), 1, 'abcd', '{schools:read}')", [p]);
        expect(key.code, `${who} key`).toBe("42501");
        const del = await attempt(c, "delete from public.b2b_partners where id = $1", [p]);
        expect(del.code, `${who} delete`).toBe("42501");
      });
    }
  });

  it("EXECUTE das funções b2b_* negado a anon e authenticated; service_role só nas públicas do servidor", async () => {
    await withSuperuser(async (c) => {
      const fns = await c.query<{ sig: string }>(
        `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname like 'b2b\\_%'`,
      );
      expect(fns.rows.length).toBeGreaterThanOrEqual(16);
      for (const { sig } of fns.rows) {
        for (const role of ["anon", "authenticated"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, sig]);
          expect(r.rows[0]?.ok, `${role} ${sig}`).toBe(false);
        }
      }
      const svc = await c.query<{ ok: boolean }>("select has_function_privilege('service_role', 'public.b2b_key_lookup(text)', 'execute') as ok");
      expect(svc.rows[0]?.ok).toBe(true);
      const internal = await c.query<{ ok: boolean }>("select has_function_privilege('service_role', 'public.b2b_partner_events_block_mutation()', 'execute') as ok");
      expect(internal.rows[0]?.ok).toBe(false);
      const defs = await c.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
        `select proname, prosecdef, proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and proname like 'b2b\\_v1\\_%' or proname in ('b2b_partner_apply','b2b_partner_decide','b2b_key_create','b2b_key_rotate','b2b_key_revoke','b2b_key_lookup','b2b_rate_consume','b2b_usage_record','b2b_prune_rate_windows','b2b_partner_overview')`,
      );
      for (const d of defs.rows) {
        expect(d.prosecdef, d.proname).toBe(true);
        expect(d.proconfig?.some((x) => x === "search_path="), d.proname).toBe(true);
      }
    });
  });
});

describe("S24 · cadastro (b2b_partner_apply)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("nasce pending, com dono, consentimento b2b_api_terms e evento applied na mesma transação", async () => {
    await inTx(async (c) => {
      const [{ id }] = await apply(c, IDS.parent, APPLY());
      const p = await c.query("select status, partner_type, coverage_ufs, terms_consent_id, terms_text_version, plan from public.b2b_partners where id = $1", [id]);
      expect(p.rows[0]).toMatchObject({ status: "pending", partner_type: "retailer", coverage_ufs: ["MT"], terms_text_version: "b2b-api-terms-v1", plan: null });
      const consent = await c.query("select profile_id, purpose, text_version from public.consents where id = $1", [p.rows[0].terms_consent_id]);
      expect(consent.rows[0]).toEqual({ profile_id: IDS.parent, purpose: "b2b_api_terms", text_version: "b2b-api-terms-v1" });
      const m = await c.query("select member_role from public.b2b_partner_members where partner_id = $1 and profile_id = $2", [id, IDS.parent]);
      expect(m.rows[0]?.member_role).toBe("owner");
      const ev = await c.query("select event_type, actor_role, actor_id, to_status from public.b2b_partner_events where partner_id = $1", [id]);
      expect(ev.rows).toEqual([{ event_type: "applied", actor_role: "owner", actor_id: IDS.parent, to_status: "pending" }]);
    });
  });

  it("recusas: sem consentimento, sem login, CNPJ duplicado entre não recusados, perfil já membro, payload inválido", async () => {
    await inTx(async (c) => {
      const noConsent = await attemptH(c, "select public.b2b_partner_apply($1, $2::jsonb, null)", [IDS.parent, JSON.stringify(APPLY())]);
      expect(noConsent.hint).toBe("consent_required");
      const noActor = await attemptH(c, "select public.b2b_partner_apply(null, $1::jsonb, 'v1')", [JSON.stringify(APPLY())]);
      expect(noActor.hint).toBe("forbidden");
      const orphan = await attemptH(c, "select public.b2b_partner_apply($1, $2::jsonb, 'v1')", [IDS.orphan, JSON.stringify(APPLY())]);
      expect(orphan.hint).toBe("forbidden");
      const cnpj = makeCnpj14();
      await apply(c, IDS.parent, APPLY({ cnpj }));
      const dup = await attemptH(c, "select public.b2b_partner_apply($1, $2::jsonb, 'v1')", [IDS.spare, JSON.stringify(APPLY({ cnpj }))]);
      expect(dup.hint).toBe("duplicate_cnpj");
      const again = await attemptH(c, "select public.b2b_partner_apply($1, $2::jsonb, 'v1')", [IDS.parent, JSON.stringify(APPLY())]);
      expect(again.hint).toBe("already_member");
      const badType = await attemptH(c, "select public.b2b_partner_apply($1, $2::jsonb, 'v1')", [IDS.school_member, JSON.stringify(APPLY({ partner_type: "x" }))]);
      expect(badType.hint).toBe("invalid_input");
      const badUf = await attemptH(c, "select public.b2b_partner_apply($1, $2::jsonb, 'v1')", [IDS.school_member, JSON.stringify(APPLY({ coverage_ufs: ["ZZ"] }))]);
      expect(badUf.hint).toBe("invalid_input");
      expect((await c.query("select count(*)::int as n from public.consents where profile_id = $1 and purpose = 'b2b_api_terms'", [IDS.school_member])).rows[0]?.n).toBe(0);
    });
  });

  it("CNPJ de parceiro recusado pode ser cadastrado de novo", async () => {
    await inTx(async (c) => {
      const cnpj = makeCnpj14();
      await seedPartner(c, { status: "rejected", ownerId: null, overrides: { cnpj } });
      const [{ id }] = await apply(c, IDS.parent, APPLY({ cnpj }));
      expect(id).toBeTruthy();
    });
  });
});

describe("S24 · decisões (b2b_partner_decide)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  const MATRIX: Record<PartnerStatus, PartnerStatus[]> = {
    pending: ["sandbox", "active", "rejected"],
    sandbox: ["active", "suspended"],
    active: ["sandbox", "suspended"],
    suspended: ["sandbox", "active"],
    rejected: [],
  };
  const ALL: PartnerStatus[] = ["pending", "sandbox", "active", "rejected", "suspended"];

  it("matriz completa de estados x destino", async () => {
    await inTx(async (c) => {
      for (const from of ALL) {
        for (const to of ALL) {
          const p = await seedPartner(c, { status: from, ownerId: null });
          const payload = to === "rejected" || to === "suspended" ? { ...ACTIVATE, reason: "motivo" } : ACTIVATE;
          const r = await decide(c, p, IDS.admin, to, payload);
          const allowed = MATRIX[from].includes(to);
          if (allowed) {
            expect(r.error, `${from} -> ${to}`).toBeNull();
            expect(r.rows[0]?.s).toBe(to);
          } else {
            expect(r.hint, `${from} -> ${to}`).toBe("transition_not_allowed");
          }
        }
      }
    });
  });

  it("só admin decide; com claim sub, o ator precisa ser o mesmo usuário", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { ownerId: null });
      expect((await decide(c, p, IDS.parent, "sandbox", APPROVE)).hint).toBe("forbidden");
      expect((await decide(c, p, null, "sandbox", APPROVE)).hint).toBe("forbidden");
    });
    await withClaims("parent", async (c) => {
      const p = await seedPartner(c, { ownerId: null });
      await c.query("reset role");
      await c.query("set local role service_role");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub: IDS.parent })]);
      const r = await decide(c, p, IDS.admin, "sandbox", APPROVE);
      expect(r.code).toBe("42501");
    });
  });

  it("aprovação exige plano, cobertura e limites test; active exige limites live; recusa e suspensão exigem motivo", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { ownerId: null });
      expect((await decide(c, p, IDS.admin, "sandbox", {})).hint).toBe("invalid_input");
      expect((await decide(c, p, IDS.admin, "sandbox", { ...APPROVE, plan: null })).hint).toBe("invalid_input");
      expect((await decide(c, p, IDS.admin, "sandbox", { ...APPROVE, test_rate_per_minute: 0 })).hint).toBe("invalid_input");
      expect((await decide(c, p, IDS.admin, "sandbox", { ...APPROVE, coverage_ufs: ["mt"] })).hint).toBe("invalid_input");
      expect((await decide(c, p, IDS.admin, "active", APPROVE)).hint).toBe("invalid_input");
      expect((await decide(c, p, IDS.admin, "rejected", {})).hint).toBe("invalid_input");
      const ok = await decide(c, p, IDS.admin, "active", { ...ACTIVATE, coverage_ufs: null });
      expect(ok.error).toBeNull();
      const row = await c.query("select plan, coverage_ufs, live_rate_per_day, decided_by, decided_at from public.b2b_partners where id = $1", [p]);
      expect(row.rows[0]).toMatchObject({ plan: "regional", coverage_ufs: null, live_rate_per_day: 200, decided_by: IDS.admin });
      expect(row.rows[0].decided_at).not.toBeNull();
      expect((await decide(c, p, IDS.admin, "suspended", {})).hint).toBe("invalid_input");
      const s = await decide(c, p, IDS.admin, "suspended", { reason: "fraude" });
      expect(s.error).toBeNull();
      expect((await c.query("select status_reason from public.b2b_partners where id = $1", [p])).rows[0]?.status_reason).toBe("fraude");
    });
  });

  it("suspensão revoga todas as chaves na mesma transação; active -> sandbox revoga só as live; reativar não ressuscita", async () => {
    await inTx(async (c) => {
      const p = await seedPartner(c, { status: "active", ownerId: null });
      const t = await seedKey(c, p, { environment: "test" });
      const l = await seedKey(c, p, { environment: "live" });
      expect((await decide(c, p, IDS.admin, "sandbox", ACTIVATE)).error).toBeNull();
      const after1 = await c.query("select id, status, revoke_reason from public.b2b_api_keys where partner_id = $1 order by environment", [p]);
      expect(after1.rows.find((r) => r.id === l.id)).toMatchObject({ status: "revoked", revoke_reason: "partner_downgraded" });
      expect(after1.rows.find((r) => r.id === t.id)).toMatchObject({ status: "active" });
      expect((await decide(c, p, IDS.admin, "suspended", { reason: "x" })).error).toBeNull();
      const after2 = await c.query("select status, revoke_reason, revoked_at from public.b2b_api_keys where id = $1", [t.id]);
      expect(after2.rows[0]).toMatchObject({ status: "revoked", revoke_reason: "partner_suspended" });
      expect(after2.rows[0].revoked_at).not.toBeNull();
      expect((await decide(c, p, IDS.admin, "active", ACTIVATE)).error).toBeNull();
      const after3 = await c.query("select count(*)::int as n from public.b2b_api_keys where partner_id = $1 and status = 'active'", [p]);
      expect(after3.rows[0]?.n).toBe(0);
      const ev = await c.query("select event_type, from_status, to_status, actor_role from public.b2b_partner_events where partner_id = $1 order by created_at", [p]);
      expect(ev.rows.map((r) => `${r.from_status}>${r.to_status}`)).toEqual(["active>sandbox", "sandbox>suspended", "suspended>active"]);
      expect(ev.rows.every((r) => r.event_type === "decided" && r.actor_role === "admin")).toBe(true);
    });
  });

  it("eventos são imutáveis (UPDATE/DELETE/TRUNCATE), inclusive com replica; auditoria sem contact_name nem key_hash", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        const p = await seedPartner(c, { ownerId: null, overrides: { contact_name: "Nome Sensivel Xyz" } });
        await c.query("insert into public.b2b_partner_events (partner_id, event_type, actor_role, to_status) values ($1, 'applied', 'owner', 'pending')", [p]);
        expect((await attempt(c, "update public.b2b_partner_events set reason = 'x' where partner_id = $1", [p])).code).toBe("42501");
        expect((await attempt(c, "delete from public.b2b_partner_events where partner_id = $1", [p])).code).toBe("42501");
        expect((await attempt(c, "truncate public.b2b_partner_events")).code).toBe("42501");
        await c.query("set local session_replication_role = replica");
        expect((await attempt(c, "delete from public.b2b_partner_events where partner_id = $1", [p])).code).toBe("42501");
        await c.query("set local session_replication_role = origin");
        const k = await seedKey(c, p);
        const audit = await c.query("select entity_table, after from public.audit_log where entity_id = any($1::uuid[]) order by created_at", [[p, k.id]]);
        expect(audit.rows.length).toBeGreaterThanOrEqual(2);
        for (const row of audit.rows) {
          const text = JSON.stringify(row.after);
          expect(text).not.toContain("Nome Sensivel Xyz");
          expect(text).not.toContain("key_hash");
          expect(text).not.toContain(k.secret);
        }
      } finally {
        await c.query("rollback");
      }
    });
  });
});
