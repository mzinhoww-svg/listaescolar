import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  attempt,
  cleanupUsers,
  DATABASE_URL,
  IDS,
  seedStationery,
  seedUsers,
  withClaims,
  withSuperuser,
  type Identity,
  type StationeryStatus,
} from "./helpers";

const STATUSES: StationeryStatus[] = [
  "signup",
  "accreditation",
  "under_review",
  "approved",
  "active",
  "paused",
  "suspended",
  "rejected",
];

type Actor = "owner" | "admin" | "system";
const NOT_REJECTED = ["signup", "accreditation", "under_review", "approved", "active", "paused"];

// Matriz do plano, escrita de forma independente da implementação.
const ALLOWED: Record<Actor, Set<string>> = {
  owner: new Set([
    "signup>accreditation",
    "accreditation>under_review",
    "approved>active",
    "active>paused",
    "paused>active",
    "rejected>accreditation",
  ]),
  admin: new Set([
    "under_review>approved",
    "under_review>rejected",
    "active>paused",
    "approved>paused",
    "paused>active",
    "suspended>paused",
    ...NOT_REJECTED.map((s) => `${s}>suspended`),
  ]),
  system: new Set(),
};
ALLOWED.system = ALLOWED.admin;

const ACTOR_ID: Record<Actor, string | null> = { owner: IDS.stationery_member, admin: IDS.admin, system: null };
const CALL = "select public.stationery_transition($1::uuid, $2::public.stationery_status, $3::uuid, $4::text, $5::text)::text as s";

async function statusOf(c: Client, id: string): Promise<{ status: string; reason: string | null; paused_by: string | null }> {
  const r = await c.query("select status::text, status_reason as reason, paused_by from public.stationeries where id = $1", [id]);
  return r.rows[0];
}
async function events(c: Client, id: string) {
  const r = await c.query(
    "select from_status::text, to_status::text, actor_id, actor_role, reason from public.stationery_status_events where stationery_id = $1 order by created_at",
    [id],
  );
  return r.rows;
}

describe("S13 stationery_transition", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("é SECURITY DEFINER com search_path vazio e EXECUTE só para service_role", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select prosecdef, proconfig,
                has_function_privilege('anon', oid, 'execute') as anon,
                has_function_privilege('authenticated', oid, 'execute') as auth,
                has_function_privilege('service_role', oid, 'execute') as svc,
                has_function_privilege('public', oid, 'execute') as pub
         from pg_proc where proname = 'stationery_transition' and pronamespace = 'public'::regnamespace`,
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].prosecdef).toBe(true);
      expect(r.rows[0].proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/^search_path=("")?$/)]));
      expect(r.rows[0]).toMatchObject({ anon: false, auth: false, svc: true, pub: false });
    });
  });

  it.each(["anon", "parent", "stationery_member", "admin", "system_profile"] as Identity[])(
    "%s não executa a função direto",
    async (who) => {
      await withClaims(who, async (c) => {
        const id = await seedStationery(c, { status: "under_review" });
        const r = await attempt(c, CALL, [id, "approved", IDS.admin, "admin", null]);
        expect(r.code).toBe("42501");
        await c.query("reset role");
        expect((await statusOf(c, id)).status).toBe("under_review");
      });
    },
  );

  it("matriz completa 8x8 por ator (owner, admin, system)", async () => {
    let checked = 0;
    await withClaims("system", async (c) => {
      for (const actor of ["owner", "admin", "system"] as Actor[]) {
        for (const from of STATUSES) {
          for (const to of STATUSES) {
            await c.query("savepoint matrix");
            const id = await seedStationery(c, {
              status: from,
              ownerId: IDS.stationery_member,
              pausedBy: from === "paused" ? "owner" : null,
            });
            const reason = to === "rejected" || to === "suspended" ? "motivo de teste" : null;
            const res = await attempt(c, CALL, [id, to, ACTOR_ID[actor], actor, reason]);
            const label = `${actor}: ${from} -> ${to}`;
            const allowed = ALLOWED[actor].has(`${from}>${to}`);
            if (allowed) {
              expect(res.error, label).toBeNull();
              expect(res.rows[0]?.s, label).toBe(to);
              expect((await statusOf(c, id)).status, label).toBe(to);
              const ev = await events(c, id);
              expect(ev, label).toHaveLength(1);
              expect(ev[0], label).toMatchObject({ from_status: from, to_status: to, actor_role: actor, reason });
            } else {
              expect(res.error, label).not.toBeNull();
              expect((await statusOf(c, id)).status, label).toBe(from);
              expect(await events(c, id), label).toHaveLength(0);
            }
            checked += 1;
            await c.query("rollback to savepoint matrix");
          }
        }
      }
    });
    expect(checked).toBe(192);
  });

  describe("motivos obrigatórios", () => {
    it.each([
      ["under_review", "rejected"],
      ["active", "suspended"],
      ["approved", "suspended"],
    ])("%s -> %s exige motivo não vazio", async (from, to) => {
      await withClaims("system", async (c) => {
        for (const bad of [null, "", "   "]) {
          await c.query("savepoint r");
          const id = await seedStationery(c, { status: from as StationeryStatus });
          const r = await attempt(c, CALL, [id, to, IDS.admin, "admin", bad]);
          expect(r.error, JSON.stringify(bad)).not.toBeNull();
          expect((await statusOf(c, id)).status).toBe(from);
          await c.query("rollback to savepoint r");
        }
        const id = await seedStationery(c, { status: from as StationeryStatus });
        const ok = await attempt(c, CALL, [id, to, IDS.admin, "admin", "  Documento ilegível  "]);
        expect(ok.error).toBeNull();
        expect(await statusOf(c, id)).toMatchObject({ status: to, reason: "Documento ilegível" });
      });
    });
    it("aprovar e reenviar limpam o motivo anterior", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "rejected", ownerId: IDS.stationery_member, overrides: { status_reason: "faltou doc" } });
        expect((await attempt(c, CALL, [id, "accreditation", IDS.stationery_member, "owner", null])).error).toBeNull();
        expect((await statusOf(c, id)).reason).toBeNull();
      });
    });
  });

  describe("quem pode agir em nome de quem", () => {
    it("owner precisa ser o owner daquela papelaria", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "signup", ownerId: IDS.parent });
        for (const actorId of [IDS.stationery_member, IDS.admin, null]) {
          const r = await attempt(c, CALL, [id, "accreditation", actorId, "owner", null]);
          expect(r.error, String(actorId)).not.toBeNull();
        }
        expect((await attempt(c, CALL, [id, "accreditation", IDS.parent, "owner", null])).error).toBeNull();
      });
    });
    it("admin/system precisam de um perfil com esse papel; papel desconhecido é recusado", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "under_review" });
        for (const [actorId, role] of [
          [IDS.parent, "admin"],
          [IDS.stationery_member, "admin"],
          [IDS.orphan, "admin"],
          [null, "admin"],
          [IDS.admin, "system"],
          [IDS.parent, "system"],
          [IDS.admin, "root"],
          [IDS.admin, ""],
        ] as [string | null, string][]) {
          const r = await attempt(c, CALL, [id, "approved", actorId, role, null]);
          expect(r.error, `${actorId}/${role}`).not.toBeNull();
          expect((await statusOf(c, id)).status).toBe("under_review");
        }
        // system com perfil system, ou sem perfil (processo interno), é aceito.
        expect((await attempt(c, CALL, [id, "approved", IDS.system, "system", null])).error).toBeNull();
      });
    });
    it("papelaria inexistente devolve erro", async () => {
      await withClaims("system", async (c) => {
        const r = await attempt(c, CALL, ["00000000-0000-4000-8000-00000000dead", "approved", IDS.admin, "admin", null]);
        expect(r.error).not.toBeNull();
      });
    });
  });

  describe("paused_by", () => {
    it("dono só retoma o que ele mesmo pausou; admin retoma qualquer pausa", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        // admin pausa: dono não retoma
        await attempt(c, CALL, [id, "paused", IDS.admin, "admin", null]);
        expect(await statusOf(c, id)).toMatchObject({ status: "paused", paused_by: "admin" });
        expect((await attempt(c, CALL, [id, "active", IDS.stationery_member, "owner", null])).error).not.toBeNull();
        expect((await attempt(c, CALL, [id, "active", IDS.admin, "admin", null])).error).toBeNull();
        expect((await statusOf(c, id)).paused_by).toBeNull();
        // dono pausa: dono retoma
        await attempt(c, CALL, [id, "paused", IDS.stationery_member, "owner", null]);
        expect((await statusOf(c, id)).paused_by).toBe("owner");
        expect((await attempt(c, CALL, [id, "active", IDS.stationery_member, "owner", null])).error).toBeNull();
      });
    });
    it("suspensa reabilitada vira pausada por admin: dono não a reativa sozinho", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "suspended", ownerId: IDS.stationery_member });
        expect((await attempt(c, CALL, [id, "paused", IDS.admin, "admin", null])).error).toBeNull();
        expect((await statusOf(c, id)).paused_by).toBe("admin");
        expect((await attempt(c, CALL, [id, "active", IDS.stationery_member, "owner", null])).error).not.toBeNull();
      });
    });
  });

  describe("pré-condições do dono", () => {
    it("signup -> accreditation exige dados básicos completos", async () => {
      await withClaims("system", async (c) => {
        const incomplete = await seedStationery(c, { status: "signup", ownerId: IDS.stationery_member, complete: false });
        expect((await attempt(c, CALL, [incomplete, "accreditation", IDS.stationery_member, "owner", null])).error).not.toBeNull();
      });
    });
    it("accreditation -> under_review exige LGPD, WhatsApp e (bairro, retirada ou entrega)", async () => {
      const cases: [string, Record<string, unknown>, boolean][] = [
        ["completo com retirada", {}, true],
        ["sem aceite LGPD", { lgpd_accepted_at: null }, false],
        ["sem versão do texto LGPD", { lgpd_text_version: null }, false],
        ["sem WhatsApp", { whatsapp: null }, false],
        ["sem retirada, entrega nem bairro", { offers_pickup: false }, false],
        ["só entrega", { offers_pickup: false, offers_delivery: true }, true],
      ];
      for (const [label, overrides, ok] of cases) {
        await withClaims("system", async (c) => {
          const id = await seedStationery(c, { status: "accreditation", ownerId: IDS.stationery_member, overrides });
          const r = await attempt(c, CALL, [id, "under_review", IDS.stationery_member, "owner", null]);
          expect(r.error === null, label).toBe(ok);
        });
      }
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "accreditation", ownerId: IDS.stationery_member, overrides: { offers_pickup: false } });
        const prev = (await c.query("select current_user as u")).rows[0].u as string;
        await c.query("reset role");
        await c.query(
          "insert into public.stationery_areas (stationery_id, municipality_id, neighborhood) select $1, municipality_id, 'centro' from public.stationeries where id = $1",
          [id],
        );
        await c.query(`set local role ${prev}`);
        expect((await attempt(c, CALL, [id, "under_review", IDS.stationery_member, "owner", null])).error).toBeNull();
      });
    });
    it("admin não fica sujeito às pré-condições do dono (analisa o que está lá)", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "under_review", complete: false });
        expect((await attempt(c, CALL, [id, "rejected", IDS.admin, "admin", "dados incompletos"])).error).toBeNull();
      });
    });
  });

  describe("aprovação promove membros sem rebaixar", () => {
    async function roleOf(c: Client, id: string): Promise<string> {
      return (await c.query("select role::text as r from public.profiles where id = $1", [id])).rows[0].r;
    }
    it("parent vira stationery_member; admin, school_member e system ficam como estão", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "under_review", ownerId: IDS.parent });
        const prev = (await c.query("select current_user as u")).rows[0].u as string;
        await c.query("reset role");
        for (const p of [IDS.admin, IDS.school_member, IDS.system]) {
          await c.query("insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'staff')", [id, p]);
        }
        await c.query(`set local role ${prev}`);
        expect(await roleOf(c, IDS.parent)).toBe("parent");
        expect((await attempt(c, CALL, [id, "approved", IDS.admin, "admin", null])).error).toBeNull();
        expect(await roleOf(c, IDS.parent)).toBe("stationery_member");
        expect(await roleOf(c, IDS.admin)).toBe("admin");
        expect(await roleOf(c, IDS.school_member)).toBe("school_member");
        expect(await roleOf(c, IDS.system)).toBe("system");
      });
    });
    it("rejeitar, suspender ou publicar não promove ninguém", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "under_review", ownerId: IDS.parent });
        expect((await attempt(c, CALL, [id, "rejected", IDS.admin, "admin", "motivo"])).error).toBeNull();
        expect(await roleOf(c, IDS.parent)).toBe("parent");
        const other = await seedStationery(c, { status: "signup", ownerId: IDS.school_member });
        await attempt(c, CALL, [other, "suspended", IDS.admin, "admin", "motivo"]);
        expect(await roleOf(c, IDS.school_member)).toBe("school_member");
      });
    });
    it("a promoção da aprovação não depende do papel do chamador (função definer) e é auditada em profiles", async () => {
      await withClaims("system", async (c) => {
        const id = await seedStationery(c, { status: "under_review", ownerId: IDS.parent });
        await attempt(c, CALL, [id, "approved", IDS.admin, "admin", null]);
        const a = await c.query(
          "select after ->> 'role' as role from public.audit_log where entity_table = 'profiles' and entity_id = $1 and action = 'UPDATE' order by created_at desc limit 1",
          [IDS.parent],
        );
        expect(a.rows[0]?.role).toBe("stationery_member");
      });
    });
  });

  describe("concorrência", () => {
    async function openTx(): Promise<Client> {
      const c = new Client({ connectionString: DATABASE_URL });
      await c.connect();
      await c.query("begin");
      await c.query("set local role service_role");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      return c;
    }
    async function waitForLockWait(): Promise<void> {
      for (let i = 0; i < 60; i += 1) {
        const n = await withSuperuser(async (c) =>
          Number((await c.query("select count(*) as n from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%stationery_transition%'")).rows[0].n),
        );
        if (n > 0) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("a segunda transição não ficou esperando o lock");
    }
    async function fixture(): Promise<string> {
      return withSuperuser((c) => seedStationery(c, { status: "under_review", ownerId: IDS.stationery_member }));
    }
    async function drop(id: string): Promise<void> {
      await withSuperuser((c) => c.query("delete from public.stationeries where id = $1", [id]));
    }

    it("aprovar e rejeitar em paralelo: a segunda espera o lock, relê o estado e erra", async () => {
      const id = await fixture();
      try {
        const a = await openTx();
        const b = await openTx();
        try {
          await a.query(CALL, [id, "approved", IDS.admin, "admin", null]);
          const pb = b.query(CALL, [id, "rejected", IDS.admin, "admin", "motivo"]).then(
            () => "ok",
            (e: Error) => e.message,
          );
          await waitForLockWait();
          await a.query("commit");
          const outcome = await pb;
          expect(outcome).not.toBe("ok");
          await b.query("rollback");
        } finally {
          await a.end();
          await b.end();
        }
        await withSuperuser(async (c) => {
          expect((await statusOf(c, id)).status).toBe("approved");
          const ev = await events(c, id);
          expect(ev).toHaveLength(1);
          expect(ev[0]).toMatchObject({ from_status: "under_review", to_status: "approved" });
        });
      } finally {
        await drop(id);
      }
    });

    it("dupla aprovação simultânea: exatamente uma vence e há um só evento", async () => {
      const id = await fixture();
      try {
        const clients = await Promise.all([openTx(), openTx(), openTx()]);
        const results = await Promise.allSettled(
          clients.map(async (c) => {
            try {
              await c.query(CALL, [id, "approved", IDS.admin, "admin", null]);
              await c.query("commit");
            } catch (e) {
              await c.query("rollback");
              throw e;
            }
          }),
        );
        await Promise.all(clients.map((c) => c.end()));
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        await withSuperuser(async (c) => {
          expect((await statusOf(c, id)).status).toBe("approved");
          expect(await events(c, id)).toHaveLength(1);
        });
      } finally {
        await drop(id);
      }
    });

    it("dono publica enquanto admin suspende: o estado final e os eventos são coerentes", async () => {
      const id = await withSuperuser((c) => seedStationery(c, { status: "approved", ownerId: IDS.stationery_member }));
      try {
        const clients = await Promise.all([openTx(), openTx()]);
        const calls: [Client, unknown[]][] = [
          [clients[0] as Client, [id, "active", IDS.stationery_member, "owner", null]],
          [clients[1] as Client, [id, "suspended", IDS.admin, "admin", "denúncia"]],
        ];
        await Promise.allSettled(
          calls.map(async ([c, params]) => {
            try {
              await c.query(CALL, params);
              await c.query("commit");
            } catch (e) {
              await c.query("rollback");
              throw e;
            }
          }),
        );
        await Promise.all(clients.map((c) => c.end()));
        await withSuperuser(async (c) => {
          const st = (await statusOf(c, id)).status;
          const ev = await events(c, id);
          expect(st).toBe("suspended"); // a suspensão vence em qualquer ordem (active->suspended ou active recusada)
          // cadeia de eventos contínua: cada from é o to anterior (a partir de approved)
          let cur = "approved";
          for (const e of ev) {
            expect(e.from_status).toBe(cur);
            cur = e.to_status;
          }
          expect(cur).toBe(st);
        });
      } finally {
        await drop(id);
      }
    });
  });
});
