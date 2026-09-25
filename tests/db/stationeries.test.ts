import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  attempt,
  cleanupUsers,
  IDS,
  inTx,
  purgeStationeries,
  seedStationery,
  seedUsers,
  withClaims,
  withSuperuser,
  type Identity,
} from "./helpers";

const PUBLIC_VIEW_COLUMNS = [
  "id",
  "is_demo",
  "municipality_id",
  "neighborhood",
  "offers_delivery",
  "offers_pickup",
  "opening_hours",
  "payment_methods",
  "service_radius_km",
  "slug",
  "trade_name",
  "updated_at",
  "whatsapp",
];
const SENSITIVE = ["legal_name", "cnpj", "email", "phone", "status_reason", "paused_by", "lgpd_accepted_at", "address", "cep"];
// rejected é editável: o dono corrige o cadastro antes de reenviar (rejected -> accreditation).
const EDITABLE = ["signup", "accreditation", "approved", "active", "paused", "rejected"] as const;
const LOCKED = ["under_review", "suspended"] as const;

describe("S13 schema: papelarias, membros, eventos", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  describe("enums, colunas e checks", () => {
    it("enums novos têm os valores do plano", async () => {
      await withSuperuser(async (c) => {
        const r = await c.query("select unnest(enum_range(null::public.stationery_member_role))::text as v");
        expect(r.rows.map((x) => x.v)).toEqual(["owner", "staff"]);
        const s = await c.query("select unnest(enum_range(null::public.catalog_stock_status))::text as v");
        expect(s.rows.map((x) => x.v)).toEqual(["in_stock", "out_of_stock", "unknown"]);
      });
    });
    it("tabelas têm id/created_at/updated_at e RLS habilitada", async () => {
      await withSuperuser(async (c) => {
        for (const t of ["stationeries", "stationery_members", "stationery_areas", "catalog_items", "stationery_status_events"]) {
          const cols = await c.query(
            "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
            [t],
          );
          expect(cols.rows.map((r) => r.column_name), t).toEqual(expect.arrayContaining(["id", "created_at", "updated_at"]));
          const rls = await c.query("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`]);
          expect(rls.rows[0]?.relrowsecurity, t).toBe(true);
        }
      });
    });
    it("sem FK para tabelas de outras trilhas (ADR-004)", async () => {
      await withSuperuser(async (c) => {
        const r = await c.query(
          `select confrelid::regclass::text as f from pg_constraint where contype = 'f' and conrelid = any(array[
             'public.stationeries','public.stationery_members','public.stationery_areas','public.catalog_items',
             'public.stationery_status_events']::regclass[])`,
        );
        const targets = new Set(r.rows.map((x) => String(x.f).replace(/^public\./, "")));
        for (const t of targets) {
          expect(["municipalities", "profiles", "stationeries", "auth.users"], t).toContain(t);
        }
        expect(targets.size).toBeGreaterThan(0);
      });
    });
    it("checks: CNPJ (formato e único), raio, pagamentos, WhatsApp, slug, status", async () => {
      await inTx(async (c) => {
        const base = await seedStationery(c);
        const cnpj = (await c.query("select cnpj from public.stationeries where id = $1", [base])).rows[0].cnpj as string;
        const bad = async (overrides: Record<string, unknown>, label: string) => {
          await c.query("savepoint s");
          try {
            await seedStationery(c, { overrides });
            await c.query("release savepoint s");
            throw new Error(`aceitou ${label}`);
          } catch (e) {
            await c.query("rollback to savepoint s");
            expect((e as Error).message, label).not.toMatch(/^aceitou/);
          }
        };
        await bad({ cnpj: "1234567890123" }, "cnpj 13 dígitos");
        await bad({ cnpj: "12.345.678/0001-95" }, "cnpj com máscara");
        await bad({ cnpj: "12abc34501de35" }, "cnpj alfanumérico em caixa baixa");
        await bad({ cnpj: "12ABC34501DE!5" }, "cnpj com símbolo");
        await bad({ cnpj: "12ABC34501DE355" }, "cnpj alfanumérico com 15");
        await bad({ cnpj }, "cnpj duplicado");
        await bad({ service_radius_km: 51 }, "raio 51");
        await bad({ service_radius_km: -1 }, "raio -1");
        await bad({ payment_methods: ["pix", "fiado"] }, "pagamento inválido");
        await bad({ whatsapp: "65999990000" }, "whatsapp sem E.164");
        await bad({ slug: "Slug Inválido" }, "slug inválido");
        await bad({ status: "foo" }, "status inválido");
        await bad({ cep: "78005-000" }, "cep com máscara");
        await bad({ trade_name: "  " }, "nome vazio");
      });
    });
    it("payment_methods aceita o subconjunto do plano", async () => {
      await inTx(async (c) => {
        const id = await seedStationery(c, {
          overrides: { payment_methods: ["pix", "credit_card", "debit_card", "cash", "boleto"], service_radius_km: 50 },
        });
        const r = await c.query("select payment_methods, service_radius_km from public.stationeries where id = $1", [id]);
        expect(r.rows[0].service_radius_km).toBe(50);
      });
    });
    it("owner único por perfil e por papelaria; staff livre", async () => {
      await inTx(async (c) => {
        const a = await seedStationery(c, { ownerId: IDS.parent });
        const b = await seedStationery(c);
        const second = await attempt(
          c,
          "insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'owner')",
          [b, IDS.parent],
        );
        expect(second.error).not.toBeNull();
        const other = await attempt(
          c,
          "insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'owner')",
          [a, IDS.school_member],
        );
        expect(other.error).not.toBeNull();
        const staff = await attempt(
          c,
          "insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'staff')",
          [b, IDS.parent],
        );
        expect(staff.error).toBeNull();
        const dup = await attempt(
          c,
          "insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'staff')",
          [b, IDS.parent],
        );
        expect(dup.error).not.toBeNull();
      });
    });
  });

  describe("grants por coluna e integridade", () => {
    it("authenticated só atualiza colunas cadastrais (sem id, status, lgpd_*, created_at, updated_at, municipality_id)", async () => {
      await withSuperuser(async (c) => {
        const can = async (col: string) =>
          (await c.query("select has_column_privilege('authenticated', 'public.stationeries', $1, 'update') as ok", [col])).rows[0].ok as boolean;
        for (const col of ["trade_name", "legal_name", "cnpj", "neighborhood", "address", "cep", "whatsapp", "phone", "email",
          "offers_pickup", "offers_delivery", "service_radius_km", "opening_hours", "payment_methods", "slug", "is_demo"]) {
          expect(await can(col), col).toBe(true);
        }
        for (const col of ["id", "status", "status_reason", "paused_by", "lgpd_accepted_at", "lgpd_text_version",
          "created_at", "updated_at", "municipality_id"]) {
          expect(await can(col), col).toBe(false);
        }
        const ins = await c.query("select has_table_privilege('authenticated', 'public.stationeries', 'insert') as i, has_table_privilege('authenticated', 'public.stationeries', 'delete') as d");
        expect(ins.rows[0]).toEqual({ i: false, d: false });
      });
    });
    it("dono e admin não forjam id, created_at, updated_at, lgpd_*, município (permission denied)", async () => {
      for (const who of ["stationery_member", "admin"] as Identity[]) {
        await withClaims(who, async (c) => {
          const id = await seedStationery(c, { status: "active", ownerId: who === "admin" ? IDS.parent : IDS.stationery_member });
          for (const set of [
            "created_at = '2000-01-01'",
            "updated_at = '2000-01-01'",
            "lgpd_accepted_at = null",
            "lgpd_text_version = 'forjada'",
            "id = gen_random_uuid()",
            "municipality_id = (select id from public.municipalities order by ibge_code desc limit 1)",
          ]) {
            const r = await attempt(c, `update public.stationeries set ${set} where id = $1`, [id]);
            expect(r.code, `${who}: ${set}`).toBe("42501");
          }
        });
      }
    });
    it("caller sem profile (auth_role NULL) falha fechado no guard: is_demo, slug e cnpj não mudam", async () => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status: "approved", ownerId: IDS.stationery_member });
        // deixa o vínculo de pé e tira o profile (sem RI): o dono passa na RLS, mas auth_role() vira NULL
        await c.query("reset role");
        await c.query("set local session_replication_role = replica");
        await c.query("delete from public.profiles where id = $1", [IDS.stationery_member]);
        await c.query("set local session_replication_role = origin");
        await c.query("set local role authenticated");
        expect((await c.query("select public.auth_role() as r")).rows[0].r).toBeNull();
        for (const set of ["is_demo = true", "slug = 'forjado'", "cnpj = '11444777000161'"]) {
          const r = await attempt(c, `update public.stationeries set ${set} where id = $1`, [id]);
          expect(r.code, set).toBe("42501");
        }
        expect((await attempt(c, "update public.stationeries set trade_name = 'Ok' where id = $1", [id])).rowCount).toBe(1);
      });
    });
    it("FK dos eventos é restrict e member_role não tem default", async () => {
      await withSuperuser(async (c) => {
        const fk = await c.query(
          "select confdeltype from pg_constraint where contype = 'f' and conrelid = 'public.stationery_status_events'::regclass and confrelid = 'public.stationeries'::regclass",
        );
        expect(fk.rows).toEqual([{ confdeltype: "r" }]);
        const d = await c.query(
          "select column_default from information_schema.columns where table_schema='public' and table_name='stationery_members' and column_name='member_role'",
        );
        expect(d.rows[0]?.column_default).toBeNull();
      });
    });
    it("catalog_items tem índice em item_key (busca da cotação local)", async () => {
      await withSuperuser(async (c) => {
        const r = await c.query(
          "select 1 from pg_indexes where schemaname='public' and tablename='catalog_items' and indexdef ~ '\\(item_key\\)$'",
        );
        expect(r.rows).toHaveLength(1);
      });
    });
    it("service_role não apaga papelaria (sem grant de DELETE)", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "signup" });
        const r = await attempt(c, "delete from public.stationeries where id = $1", [id]);
        expect(r.code).toBe("42501");
      });
    });
    it("stationery_discard_orphan não existe mais; register, record_consent, replace_areas, upsert_catalog e candidates: só service_role", async () => {
      await withSuperuser(async (c) => {
        const gone = await c.query("select 1 from pg_proc where proname = 'stationery_discard_orphan'");
        expect(gone.rows).toEqual([]);
        for (const fn of ["stationery_register", "stationery_record_consent", "stationery_replace_areas", "stationery_upsert_catalog", "stationery_local_candidates"]) {
          const r = await c.query(
            `select has_function_privilege('anon', p.oid, 'execute') as anon,
                    has_function_privilege('authenticated', p.oid, 'execute') as auth,
                    has_function_privilege('service_role', p.oid, 'execute') as svc, p.prosecdef
               from pg_proc p where p.proname = $1 and p.pronamespace = 'public'::regnamespace`,
            [fn],
          );
          expect(r.rows, fn).toHaveLength(1);
          expect(r.rows[0], fn).toMatchObject({ anon: false, auth: false, svc: true, prosecdef: true });
        }
      });
    });
    it("stationery_register só aceita dono com papel parent", async () => {
      await withClaims("system", async (c) => {
        const call = (owner: string, cnpj: string) =>
          attempt(
            c,
            "select public.stationery_register($1, 'p-x', 'Papelaria X', 'X Ltda', $2, (select id from public.municipalities limit 1), 'centro', null, null, '+5565999991234', null, null, true, false, 0, null, '{}', '[]', 'v1')",
            [owner, cnpj],
          );
        const bad = await call(IDS.school_member, "11222333000181");
        expect(bad.code).toBe("42501");
        const ok = await call(IDS.parent, "11222333000181");
        expect(ok.error).toBeNull();
      });
    });
    it("cnpj aceita [0-9A-Z]{14} (alfanumérico)", async () => {
      await inTx(async (c) => {
        const ok = await seedStationery(c, { status: "signup", overrides: { cnpj: "12ABC34501DE35" } });
        expect((await c.query("select cnpj from public.stationeries where id = $1", [ok])).rows[0].cnpj).toBe("12ABC34501DE35");
      });
    });
  });

  describe("visão pública (stationery_public) e grants", () => {
    it("expõe só as colunas seguras", async () => {
      await withSuperuser(async (c) => {
        const r = await c.query(
          "select column_name from information_schema.columns where table_schema='public' and table_name='stationery_public'",
        );
        expect(r.rows.map((x) => x.column_name).sort()).toEqual([...PUBLIC_VIEW_COLUMNS].sort());
        for (const col of SENSITIVE) expect(r.rows.map((x) => x.column_name)).not.toContain(col);
      });
    });
    it.each(["anon", "parent", "orphan"] as Identity[])("%s lê só papelarias active pela view", async (who) => {
      await withClaims(who, async (c) => {
        const ids = {
          active: await seedStationery(c, { status: "active", ownerId: IDS.stationery_member }),
          paused: await seedStationery(c, { status: "paused", pausedBy: "owner" }),
          suspended: await seedStationery(c, { status: "suspended" }),
          rejected: await seedStationery(c, { status: "rejected" }),
          under_review: await seedStationery(c, { status: "under_review" }),
          approved: await seedStationery(c, { status: "approved" }),
          signup: await seedStationery(c, { status: "signup" }),
          accreditation: await seedStationery(c, { status: "accreditation" }),
        };
        const r = await attempt(c, "select id, whatsapp from public.stationery_public where id = any($1::uuid[])", [Object.values(ids)]);
        expect(r.error).toBeNull();
        expect(r.rows.map((x) => x.id)).toEqual([ids.active]);
        expect(r.rows[0]?.whatsapp).toBe("+5565999990000");
      });
    });
    it("anon não lê a tabela base nem as colunas sensíveis", async () => {
      await withClaims("anon", async (c) => {
        const r = await attempt(c, "select cnpj from public.stationeries");
        expect(r.code).toBe("42501");
        const v = await attempt(c, "select cnpj from public.stationery_public");
        expect(v.error).not.toBeNull();
        const m = await attempt(c, "select * from public.stationery_members");
        expect(m.code).toBe("42501");
        const e = await attempt(c, "select * from public.stationery_status_events");
        expect(e.code).toBe("42501");
      });
    });
    it("qualquer autenticado sem vínculo não vê a base, nem de papelaria active", async () => {
      for (const who of ["parent", "school_member", "orphan"] as Identity[]) {
        await withClaims(who, async (c) => {
          await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
          const r = await attempt(c, "select cnpj, email from public.stationeries");
          expect(r.error, who).toBeNull();
          expect(r.rows, who).toHaveLength(0);
        });
      }
    });
  });

  describe("RLS da base", () => {
    it("dono lê a própria em qualquer status, com dados cadastrais; terceiro não lê", async () => {
      await withClaims("stationery_member", async (c) => {
        const mine = [await seedStationery(c, { status: "signup", ownerId: IDS.stationery_member })];
        const theirs = await seedStationery(c, { status: "active", ownerId: IDS.parent });
        const r = await attempt(c, "select id, cnpj, email, status from public.stationeries");
        expect(r.rows.map((x) => x.id)).toEqual([mine[0]]);
        expect(r.rows.map((x) => x.id)).not.toContain(theirs);
        expect(r.rows[0]?.cnpj).toMatch(/^[0-9]{14}$/);
      });
      for (const status of ["under_review", "suspended", "rejected"] as const) {
        await withClaims("stationery_member", async (c) => {
          const id = await seedStationery(c, { status, ownerId: IDS.stationery_member });
          const r = await attempt(c, "select status_reason from public.stationeries where id = $1", [id]);
          expect(r.rows).toHaveLength(1);
        });
      }
    });
    it.each(["admin", "system_profile", "system"] as Identity[])("%s lê todas", async (who) => {
      await withClaims(who, async (c) => {
        const a = await seedStationery(c, { status: "suspended" });
        const b = await seedStationery(c, { status: "signup", ownerId: IDS.parent });
        const r = await attempt(c, "select id from public.stationeries where id = any($1::uuid[])", [[a, b]]);
        expect(r.rows.map((x) => x.id).sort()).toEqual([a, b].sort());
      });
    });
    it("ninguém (nem dono, nem admin) insere ou apaga papelaria/membro pelo cliente", async () => {
      for (const who of ["parent", "stationery_member", "admin", "system_profile"] as Identity[]) {
        await withClaims(who, async (c) => {
          const mine = await seedStationery(c, { status: "signup", ownerId: who === "system_profile" ? IDS.system : who === "admin" ? IDS.admin : who === "parent" ? IDS.parent : IDS.stationery_member });
          const ins = await attempt(
            c,
            `insert into public.stationeries (slug, trade_name, cnpj, municipality_id)
             select 'x-' || $1, 'X', $1, id from public.municipalities limit 1`,
            ["99999999999999"],
          );
          expect(ins.error, `${who} insert`).not.toBeNull();
          const mem = await attempt(
            c,
            "insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'staff')",
            [mine, IDS.spare],
          );
          expect(mem.error, `${who} member`).not.toBeNull();
          const del = await attempt(c, "delete from public.stationeries where id = $1", [mine]);
          expect(del.error, `${who} delete`).not.toBeNull();
          const delm = await attempt(c, "delete from public.stationery_members where stationery_id = $1", [mine]);
          expect(delm.error, `${who} delete member`).not.toBeNull();
        });
      }
    });
    it.each(EDITABLE)("dono edita dados cadastrais em %s", async (status) => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status, ownerId: IDS.stationery_member, pausedBy: status === "paused" ? "owner" : null });
        const r = await attempt(c, "update public.stationeries set trade_name = 'Novo Nome', opening_hours = 'Seg-Sex 8h-18h' where id = $1", [id]);
        expect(r.error).toBeNull();
        expect(r.rowCount).toBe(1);
      });
    });
    it.each(LOCKED)("dono não edita nada em %s (RLS filtra a linha)", async (status) => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status, ownerId: IDS.stationery_member });
        const r = await attempt(c, "update public.stationeries set trade_name = 'Novo Nome' where id = $1", [id]);
        expect(r.rowCount).toBe(0);
      });
    });
    it("terceiro (parent, school_member, orphan, outro dono) não edita", async () => {
      for (const who of ["parent", "school_member", "orphan", "stationery_member"] as Identity[]) {
        await withClaims(who, async (c) => {
          const id = await seedStationery(c, {
            status: "active",
            ownerId: who === "stationery_member" ? IDS.parent : IDS.stationery_member,
          });
          const r = await attempt(c, "update public.stationeries set trade_name = 'Invadido' where id = $1", [id]);
          expect(r.rowCount, who).toBe(0);
        });
      }
    });
    it("dono não muda status, status_reason, paused_by, is_demo, slug; nem cnpj depois de accreditation", async () => {
      await withClaims("stationery_member", async (c) => {
        const id = await seedStationery(c, { status: "approved", ownerId: IDS.stationery_member });
        for (const set of [
          "status = 'active'",
          "status = 'approved', status_reason = 'x'",
          "paused_by = 'owner'",
          "is_demo = true",
          "slug = 'outro-slug'",
          "cnpj = '11444777000161'",
        ]) {
          const r = await attempt(c, `update public.stationeries set ${set} where id = $1`, [id]);
          expect(r.error, set).not.toBeNull();
          expect(r.code, set).toBe("42501");
        }
      });
      // cnpj é editável enquanto o cadastro pode ser corrigido: accreditation e rejected (reenvio)
      for (const status of ["accreditation", "rejected"] as const) {
        await withClaims("stationery_member", async (c) => {
          const id = await seedStationery(c, { status, ownerId: IDS.stationery_member });
          const r = await attempt(c, "update public.stationeries set cnpj = '11444777000161' where id = $1", [id]);
          expect(r.error, status).toBeNull();
          expect(r.rowCount, status).toBe(1);
        });
      }
    });
    it("nem service_role nem admin escrevem status direto (só a função)", async () => {
      for (const who of ["system", "admin", "system_profile"] as Identity[]) {
        await withClaims(who, async (c) => {
          const id = await seedStationery(c, { status: "under_review" });
          const r = await attempt(c, "update public.stationeries set status = 'approved' where id = $1", [id]);
          expect(r.error, who).not.toBeNull();
          const d = await attempt(c, "update public.stationeries set status_reason = 'x' where id = $1", [id]);
          expect(d.error, who).not.toBeNull();
        });
      }
    });
    it("admin/system alteram is_demo e cnpj, dono não", async () => {
      for (const who of ["admin", "system"] as Identity[]) {
        await withClaims(who, async (c) => {
          const id = await seedStationery(c, { status: "approved" });
          const r = await attempt(c, "update public.stationeries set is_demo = true, cnpj = '11444777000161' where id = $1", [id]);
          expect(r.error, who).toBeNull();
          expect(r.rowCount, who).toBe(1);
        });
      }
    });
  });

  describe("membros", () => {
    it("dono lê só o próprio vínculo; admin lê todos; sem escrita", async () => {
      await withClaims("stationery_member", async (c) => {
        await seedStationery(c, { ownerId: IDS.stationery_member });
        await seedStationery(c, { ownerId: IDS.parent });
        const r = await attempt(c, "select profile_id from public.stationery_members");
        expect(r.rows.map((x) => x.profile_id)).toEqual([IDS.stationery_member]);
        const u = await attempt(c, "update public.stationery_members set member_role = 'staff'");
        expect(u.error).not.toBeNull();
      });
      await withClaims("admin", async (c) => {
        const a = await seedStationery(c, { ownerId: IDS.stationery_member });
        const b = await seedStationery(c, { ownerId: IDS.parent });
        const r = await attempt(c, "select stationery_id from public.stationery_members where stationery_id = any($1::uuid[])", [[a, b]]);
        expect(r.rows).toHaveLength(2);
      });
      await withClaims("orphan", async (c) => {
        await seedStationery(c, { ownerId: IDS.stationery_member });
        const r = await attempt(c, "select 1 from public.stationery_members");
        expect(r.rows).toHaveLength(0);
      });
    });
  });

  describe("eventos de status", () => {
    async function seedEvent(c: import("pg").Client, sid: string) {
      const prev = (await c.query("select current_user as u")).rows[0].u as string;
      await c.query("reset role");
      await c.query(
        `insert into public.stationery_status_events (stationery_id, from_status, to_status, actor_id, actor_role)
         values ($1, 'signup', 'accreditation', $2, 'owner')`,
        [sid, IDS.stationery_member],
      );
      await c.query(`set local role ${prev}`);
    }
    it("dono lê os da própria papelaria, terceiro não, admin todos", async () => {
      await withClaims("stationery_member", async (c) => {
        const mine = await seedStationery(c, { ownerId: IDS.stationery_member });
        const theirs = await seedStationery(c, { ownerId: IDS.parent });
        await seedEvent(c, mine);
        await seedEvent(c, theirs);
        const r = await attempt(c, "select stationery_id from public.stationery_status_events");
        expect(r.rows.map((x) => x.stationery_id)).toEqual([mine]);
      });
      await withClaims("admin", async (c) => {
        const a = await seedStationery(c);
        const b = await seedStationery(c);
        await seedEvent(c, a);
        await seedEvent(c, b);
        const r = await attempt(c, "select stationery_id from public.stationery_status_events where stationery_id = any($1::uuid[])", [[a, b]]);
        expect(r.rows).toHaveLength(2);
      });
      await withClaims("parent", async (c) => {
        const a = await seedStationery(c, { ownerId: IDS.stationery_member });
        await seedEvent(c, a);
        const r = await attempt(c, "select 1 from public.stationery_status_events");
        expect(r.rows).toHaveLength(0);
      });
    });
    it("ninguém escreve direto: authenticated e service_role sem grant", async () => {
      for (const who of ["stationery_member", "admin", "system"] as Identity[]) {
        await withClaims(who, async (c) => {
          const sid = await seedStationery(c, { ownerId: IDS.stationery_member });
          const ins = await attempt(
            c,
            `insert into public.stationery_status_events (stationery_id, from_status, to_status, actor_role)
             values ($1, 'signup', 'active', 'owner')`,
            [sid],
          );
          expect(ins.error, who).not.toBeNull();
        });
      }
    });
    it("imutáveis: update/delete/truncate bloqueados até para superuser; papelaria com evento não é apagada (restrict)", async () => {
      await inTx(async (c) => {
        const sid = await seedStationery(c);
        await seedEvent(c, sid);
        const upd = await attempt(c, "update public.stationery_status_events set reason = 'adulterado'");
        expect(upd.error).not.toBeNull();
        const del = await attempt(c, "delete from public.stationery_status_events");
        expect(del.error).not.toBeNull();
        const tr = await attempt(c, "truncate public.stationery_status_events");
        expect(tr.error).not.toBeNull();
        const casc = await attempt(c, "delete from public.stationeries where id = $1", [sid]);
        expect(casc.code).toBe("23503");
        const left = await c.query("select 1 from public.stationery_status_events where stationery_id = $1", [sid]);
        expect(left.rows).toHaveLength(1);
      });
    });
    it("a função de bloqueio não tem exceção por profundidade de trigger", async () => {
      await withSuperuser(async (c) => {
        const src = (await c.query("select prosrc from pg_proc where proname = 'stationery_events_block_mutation'")).rows[0].prosrc as string;
        expect(src).not.toMatch(/pg_trigger_depth/);
      });
    });
    it("purgeStationeries limpa papelaria com evento confirmado (helper de teste)", async () => {
      const id = await withSuperuser(async (c) => {
        const sid = await seedStationery(c);
        await seedEvent(c, sid);
        return sid;
      });
      await purgeStationeries([id]);
      await withSuperuser(async (c) => {
        expect((await c.query("select 1 from public.stationeries where id = $1", [id])).rows).toHaveLength(0);
      });
    });
  });

  describe("auditoria", () => {
    it("audit_log de stationeries nunca contém whatsapp, phone nem email", async () => {
      await inTx(async (c) => {
        const id = await seedStationery(c);
        await c.query("update public.stationeries set trade_name = 'Renomeada', whatsapp = '+5565988887777' where id = $1", [id]);
        const r = await c.query(
          "select action, before, after from public.audit_log where entity_table = 'stationeries' and entity_id = $1 order by created_at",
          [id],
        );
        expect(r.rows.map((x) => x.action)).toEqual(["INSERT", "UPDATE"]);
        for (const row of r.rows) {
          for (const side of [row.before, row.after]) {
            if (!side) continue;
            for (const k of ["whatsapp", "phone", "email"]) expect(Object.keys(side), k).not.toContain(k);
            expect(JSON.stringify(side)).not.toMatch(/5565988887777|contato@papelaria-teste/);
          }
        }
        expect(r.rows[1].after.trade_name).toBe("Renomeada");
        expect(r.rows[1].after.cnpj).toMatch(/^[0-9]{14}$/);
      });
    });
  });
});
