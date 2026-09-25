import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asServiceCommitted,
  attemptH,
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
  type LeadStatus,
} from "./helpers";

const STATUSES: LeadStatus[] = [
  "received",
  "viewed",
  "in_progress",
  "quote_sent",
  "awaiting_customer",
  "converted",
  "declined",
  "expired",
  "cancelled",
];
const OPEN = ["received", "viewed", "in_progress", "quote_sent", "awaiting_customer"];
type Actor = "stationery" | "parent" | "admin" | "system";

// Oráculo escrito à mão (independente da implementação), a partir do plano.
const ALLOWED: Record<Actor, Set<string>> = {
  stationery: new Set([
    "received>viewed",
    ...OPEN.flatMap((f) =>
      ["in_progress", "quote_sent", "awaiting_customer", "converted", "declined"].filter((t) => t !== f).map((t) => `${f}>${t}`),
    ),
  ]),
  parent: new Set(OPEN.map((f) => `${f}>cancelled`)),
  admin: new Set(OPEN.map((f) => `${f}>cancelled`)),
  system: new Set(OPEN.map((f) => `${f}>expired`)), // só com expires_at vencido
};

const CALL = "select public.lead_transition($1::uuid, $2::public.lead_status, $3::uuid, $4::text, $5::int, $6::text)::text as s";
const ACTOR_ID: Record<Actor, string | null> = { stationery: IDS.stationery_member, parent: IDS.parent, admin: IDS.admin, system: null };

function reasonFor(actor: Actor, to: LeadStatus): string | null {
  if (to === "declined") return "price";
  if (actor === "admin" && to === "cancelled") return "abuso comprovado";
  return null;
}

async function leadRow(c: Client, id: string) {
  return (
    await c.query(
      `select status::text, expires_at, quoted_total_cents, quoted_at, declared_sale_cents, declared_at, close_reason,
              extract(epoch from (expires_at - now())) as ttl
         from public.leads where id = $1`,
      [id],
    )
  ).rows[0];
}
async function eventTypes(c: Client, id: string): Promise<string[]> {
  return (await c.query("select event_type from public.lead_events where lead_id = $1 order by created_at, id", [id])).rows.map((r) => r.event_type as string);
}
async function setup(c: Client, stationeryStatus: "active" | "paused" | "suspended" = "active") {
  const stationery = await seedStationery(c, {
    status: stationeryStatus,
    ownerId: IDS.stationery_member,
    pausedBy: stationeryStatus === "paused" ? "owner" : null,
  });
  return stationery;
}

describe("S14 lead_transition · matriz por ator", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it.each(["anon", "parent", "stationery_member", "admin", "system_profile"] as Identity[])(
    "%s não executa lead_transition, lead_mark_viewed, lead_record_whatsapp_open nem lead_expire_due direto",
    async (who) => {
      await withClaims(who, async (c) => {
        const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        const { id } = await seedLead(c, { stationeryId: st });
        expect((await attemptH(c, CALL, [id, "cancelled", IDS.parent, "parent", null, null])).code).toBe("42501");
        expect((await attemptH(c, "select public.lead_mark_viewed($1::uuid, $2::uuid)", [id, IDS.stationery_member])).code).toBe("42501");
        expect((await attemptH(c, "select public.lead_record_whatsapp_open($1::uuid, $2::uuid)", [id, IDS.parent])).code).toBe("42501");
        expect((await attemptH(c, "select public.lead_expire_due(10)")).code).toBe("42501");
        await c.query("reset role");
        expect((await leadRow(c, id)).status).toBe("received");
      });
    },
  );

  it.each(["stationery", "parent", "admin", "system"] as Actor[])("matriz completa 9x9 para %s", async (actor) => {
    let allowedSeen = 0;
    await withClaims("system", async (c) => {
      const st = await setup(c);
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          // system só age em lead vencido; nos demais casos o lead está no prazo (vencido viraria expiração preguiçosa).
          const overdue = actor === "system" && to === "expired";
          const { id } = await seedLead(c, { stationeryId: st, status: from, expiresIn: overdue ? "-1 hour" : "+2 days" });
          const before = await eventTypes(c, id);
          const label = `${actor}: ${from} -> ${to}`;
          const res = await attemptH(c, CALL, [id, to, ACTOR_ID[actor], actor, null, reasonFor(actor, to)]);
          const allowed = ALLOWED[actor].has(`${from}>${to}`);
          if (from === "expired") {
            // contrato único: lead já expirado devolve `expired` sem erro, sem mudar nada e sem novo evento
            expect(res.error, label).toBeNull();
            expect(res.rows[0]?.s, label).toBe("expired");
            expect((await leadRow(c, id)).status, label).toBe("expired");
            expect((await eventTypes(c, id)).length, label).toBe(before.length);
          } else if (allowed) {
            expect(res.error, label).toBeNull();
            expect(res.rows[0]?.s, label).toBe(to);
            expect((await leadRow(c, id)).status, label).toBe(to);
            expect((await eventTypes(c, id)).length, label).toBe(before.length + 1);
            allowedSeen++;
          } else {
            expect(res.code, label).toBe("23514");
            expect(res.hint, label).toBe("transition_not_allowed");
            expect((await leadRow(c, id)).status, label).toBe(from);
            expect((await eventTypes(c, id)).length, label).toBe(before.length);
          }
        }
      }
    });
    expect(allowedSeen).toBe(ALLOWED[actor].size);
  });

  it("lead já expirado devolve expired sem erro e sem novo evento, para qualquer ator válido", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st, status: "expired" });
      for (const [actor, to] of [["stationery", "in_progress"], ["parent", "cancelled"], ["admin", "cancelled"], ["system", "expired"]] as [Actor, LeadStatus][]) {
        const r = await attemptH(c, CALL, [id, to, ACTOR_ID[actor], actor, null, reasonFor(actor, to)]);
        expect(r.error, actor).toBeNull();
        expect(r.rows[0]?.s, actor).toBe("expired");
      }
      // ator que não é quem diz ser continua recusado
      expect((await attemptH(c, CALL, [id, "in_progress", IDS.school_member, "stationery", null, null])).hint).toBe("forbidden");
      expect(await eventTypes(c, id)).toEqual(["created"]);
    });
  });

  it("system não expira lead dentro do prazo", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st, expiresIn: "+1 hour" });
      const r = await attemptH(c, CALL, [id, "expired", null, "system", null, null]);
      expect(r.hint).toBe("transition_not_allowed");
    });
  });

  it("tipos de evento por transição e exatamente um evento por mudança", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st });
      const step = async (to: LeadStatus, amount: number | null = null, reason: string | null = null) => {
        const r = await attemptH(c, CALL, [id, to, IDS.stationery_member, "stationery", amount, reason]);
        expect(r.error).toBeNull();
      };
      await step("viewed");
      await step("in_progress");
      await step("quote_sent", 45000);
      await step("awaiting_customer");
      await step("converted", 43000);
      expect(await eventTypes(c, id)).toEqual(["created", "viewed", "status_changed", "quote_registered", "status_changed", "sale_declared"]);
      const ev = (await c.query("select event_type, from_status::text f, to_status::text t, actor_role, actor_id, amount_cents from public.lead_events where lead_id = $1 order by created_at, id", [id])).rows;
      expect(ev[3]).toMatchObject({ event_type: "quote_registered", f: "in_progress", t: "quote_sent", actor_role: "stationery", actor_id: IDS.stationery_member, amount_cents: 45000 });
      expect(ev[5]).toMatchObject({ event_type: "sale_declared", f: "awaiting_customer", t: "converted", amount_cents: 43000 });
      const l = await leadRow(c, id);
      expect(l).toMatchObject({ status: "converted", quoted_total_cents: 45000, declared_sale_cents: 43000 });
      expect(l.quoted_at).not.toBeNull();
      expect(l.declared_at).not.toBeNull();
    });
  });

  it("declined exige motivo do conjunto fechado e grava close_reason; closed_lost", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st, status: "quote_sent" });
      for (const reason of [null, "", "   "]) {
        expect((await attemptH(c, CALL, [id, "declined", IDS.stationery_member, "stationery", null, reason])).hint).toBe("reason_required");
      }
      expect((await attemptH(c, CALL, [id, "declined", IDS.stationery_member, "stationery", null, "porque sim"])).hint).toBe("invalid_input");
      expect((await leadRow(c, id)).status).toBe("quote_sent");
      for (const ok of ["price", "stock", "no_reply", "bought_elsewhere", "other"]) {
        const { id: lid } = await seedLead(c, { stationeryId: st, status: "in_progress" });
        expect((await attemptH(c, CALL, [lid, "declined", IDS.stationery_member, "stationery", null, ok])).error).toBeNull();
        expect((await leadRow(c, lid)).close_reason).toBe(ok);
        expect((await eventTypes(c, lid)).at(-1)).toBe("closed_lost");
      }
    });
  });

  it("cancelamento: pai com ou sem motivo; admin exige motivo", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const a = await seedLead(c, { stationeryId: st });
      expect((await attemptH(c, CALL, [a.id, "cancelled", IDS.admin, "admin", null, null])).hint).toBe("reason_required");
      expect((await attemptH(c, CALL, [a.id, "cancelled", IDS.admin, "admin", null, "  "])).hint).toBe("reason_required");
      expect((await attemptH(c, CALL, [a.id, "cancelled", IDS.admin, "admin", null, "abuso"])).error).toBeNull();
      const b = await seedLead(c, { stationeryId: st });
      expect((await attemptH(c, CALL, [b.id, "cancelled", IDS.parent, "parent", null, null])).error).toBeNull();
      expect((await eventTypes(c, b.id)).at(-1)).toBe("cancelled");
      const ev = (await c.query("select reason, actor_role, actor_id from public.lead_events where lead_id = $1 and event_type = 'cancelled'", [a.id])).rows[0];
      expect(ev).toEqual({ reason: "abuso", actor_role: "admin", actor_id: IDS.admin });
    });
  });

  it("valor opcional e validado: só em quote_sent e converted, 1..10.000.000 centavos", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const call = async (to: LeadStatus, amount: number | null, from: LeadStatus = "in_progress") => {
        const { id } = await seedLead(c, { stationeryId: st, status: from });
        return { id, r: await attemptH(c, CALL, [id, to, IDS.stationery_member, "stationery", amount, reasonFor("stationery", to)]) };
      };
      for (const bad of [0, -1, 10_000_001]) {
        expect((await call("quote_sent", bad)).r.hint, `quote ${bad}`).toBe("amount_invalid");
        expect((await call("converted", bad)).r.hint, `sale ${bad}`).toBe("amount_invalid");
      }
      for (const to of ["in_progress", "awaiting_customer", "declined", "viewed"] as LeadStatus[]) {
        const from: LeadStatus = to === "viewed" ? "received" : "quote_sent";
        expect((await call(to, 100, from)).r.hint, `amount em ${to}`).toBe("amount_invalid");
      }
      expect((await call("quote_sent", 1)).r.error).toBeNull();
      expect((await call("converted", 10_000_000)).r.error).toBeNull();
      const noAmount = await call("quote_sent", null);
      expect(noAmount.r.error).toBeNull();
      expect((await leadRow(c, noAmount.id)).quoted_total_cents).toBeNull();
    });
  });

  it("atividade da papelaria renova expires_at para agora + 7 dias; pai e estados terminais não", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const week = 7 * 86400;
      const near = await seedLead(c, { stationeryId: st, expiresIn: "+1 hour" });
      await attemptH(c, CALL, [near.id, "viewed", IDS.stationery_member, "stationery", null, null]);
      const t1 = Number((await leadRow(c, near.id)).ttl);
      expect(t1).toBeGreaterThan(week - 60);
      expect(t1).toBeLessThanOrEqual(week);
      // não encurta prazo maior
      const far = await seedLead(c, { stationeryId: st, status: "viewed", expiresIn: "+20 days" });
      await attemptH(c, CALL, [far.id, "in_progress", IDS.stationery_member, "stationery", null, null]);
      expect(Number((await leadRow(c, far.id)).ttl)).toBeGreaterThan(19 * 86400);
      // terminal não renova
      const done = await seedLead(c, { stationeryId: st, status: "in_progress", expiresIn: "+1 hour" });
      await attemptH(c, CALL, [done.id, "converted", IDS.stationery_member, "stationery", null, null]);
      expect(Number((await leadRow(c, done.id)).ttl)).toBeLessThan(3700);
    });
  });

  it("expiração preguiçosa: transição em lead vencido grava expired e devolve expired (sem erro)", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      for (const [actor, to] of [["stationery", "in_progress"], ["parent", "cancelled"], ["admin", "cancelled"], ["stationery", "converted"]] as [Actor, LeadStatus][]) {
        const { id } = await seedLead(c, { stationeryId: st, status: "viewed", expiresIn: "-1 minute" });
        const r = await attemptH(c, CALL, [id, to, ACTOR_ID[actor], actor, null, reasonFor(actor, to)]);
        expect(r.error, `${actor}>${to}`).toBeNull();
        expect(r.rows[0]?.s).toBe("expired");
        expect((await leadRow(c, id)).status).toBe("expired");
        const ev = (await c.query("select event_type, actor_role, actor_id from public.lead_events where lead_id = $1 order by created_at, id", [id])).rows;
        expect(ev.map((e) => e.event_type)).toEqual(["created", "expired"]);
        expect(ev[1]).toMatchObject({ actor_role: "system", actor_id: null });
      }
      // ator inválido não dispara expiração
      const { id } = await seedLead(c, { stationeryId: st, status: "viewed", expiresIn: "-1 minute" });
      const r = await attemptH(c, CALL, [id, "in_progress", IDS.school_member, "stationery", null, null]);
      expect(r.code).toBe("42501");
      expect((await leadRow(c, id)).status).toBe("viewed");
    });
  });

  it("identidade do ator: papelaria de outro, pai que não é o solicitante, não-admin, papel inválido, sub do JWT", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const other = await seedStationery(c, { status: "active", ownerId: IDS.school_member });
      const { id } = await seedLead(c, { stationeryId: st });
      const cases: [string | null, string, string][] = [
        [IDS.school_member, "stationery", "forbidden"], // membro de outra papelaria
        [IDS.parent, "stationery", "forbidden"], // pai não é membro
        [IDS.admin, "parent", "forbidden"], // admin se passando por pai
        [IDS.stationery_member, "parent", "forbidden"],
        [IDS.parent, "admin", "forbidden"], // pai se passando por admin
        [null, "stationery", "forbidden"],
        [null, "parent", "forbidden"],
        [null, "admin", "forbidden"],
        [IDS.parent, "system", "forbidden"], // system com ator que não é system
      ];
      for (const [actorId, role, hint] of cases) {
        const to = role === "stationery" ? "in_progress" : role === "system" ? "expired" : "cancelled";
        const r = await attemptH(c, CALL, [id, to, actorId, role, null, "abuso"]);
        expect(r.code, `${role}/${actorId}`).toBe("42501");
        expect(r.hint, `${role}/${actorId}`).toBe(hint);
      }
      expect((await attemptH(c, CALL, [id, "cancelled", IDS.parent, "owner", null, null])).hint).toBe("actor_invalid");
      expect((await attemptH(c, CALL, [id, "cancelled", IDS.parent, null, null, null])).hint).toBe("actor_invalid");
      // papelaria B só age no lead dela
      const { id: otherLead } = await seedLead(c, { stationeryId: other });
      expect((await attemptH(c, CALL, [otherLead, "in_progress", IDS.stationery_member, "stationery", null, null])).hint).toBe("forbidden");
      // sub do JWT diferente do ator
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub: IDS.admin })]);
      expect((await attemptH(c, CALL, [id, "cancelled", IDS.parent, "parent", null, null])).code).toBe("42501");
      // sub igual ao ator passa
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub: IDS.parent })]);
      expect((await attemptH(c, CALL, [id, "cancelled", IDS.parent, "parent", null, null])).error).toBeNull();
      // lead inexistente
      expect((await attemptH(c, CALL, ["00000000-0000-4000-8000-0000000000ff", "cancelled", IDS.parent, "parent", null, null])).hint).toBe("not_found");
    });
  });

  it("papelaria pausada continua operando; suspensa fica congelada; pai cancela sempre", async () => {
    await withClaims("system", async (c) => {
      const paused = await setup(c, "paused");
      const p = await seedLead(c, { stationeryId: paused });
      expect((await attemptH(c, CALL, [p.id, "in_progress", IDS.stationery_member, "stationery", null, null])).error).toBeNull();
      const susp = await seedStationery(c, { status: "suspended", ownerId: IDS.school_member });
      const s = await seedLead(c, { stationeryId: susp });
      const r = await attemptH(c, CALL, [s.id, "in_progress", IDS.school_member, "stationery", null, null]);
      expect(r.hint).toBe("stationery_unavailable");
      expect((await attemptH(c, "select public.lead_mark_viewed($1::uuid, $2::uuid)", [s.id, IDS.school_member])).hint).toBe("stationery_unavailable");
      expect((await attemptH(c, CALL, [s.id, "cancelled", IDS.parent, "parent", null, null])).error).toBeNull();
      expect((await leadRow(c, s.id)).status).toBe("cancelled");
    });
  });
});

describe("S14 lead_mark_viewed, whatsapp_opened e lead_expire_due", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);
  const VIEW = "select public.lead_mark_viewed($1::uuid, $2::uuid)::text as s";
  const WA = "select public.lead_record_whatsapp_open($1::uuid, $2::uuid) as ok";
  const EXPIRE = "select public.lead_expire_due($1::int) as n";

  it("mark_viewed é idempotente: received vira viewed uma vez; estados adiante ficam como estão", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st });
      expect((await attemptH(c, VIEW, [id, IDS.stationery_member])).rows[0]?.s).toBe("viewed");
      expect((await attemptH(c, VIEW, [id, IDS.stationery_member])).rows[0]?.s).toBe("viewed");
      expect(await eventTypes(c, id)).toEqual(["created", "viewed"]);
      const adv = await seedLead(c, { stationeryId: st, status: "quote_sent" });
      expect((await attemptH(c, VIEW, [adv.id, IDS.stationery_member])).rows[0]?.s).toBe("quote_sent");
      expect(await eventTypes(c, adv.id)).toEqual(["created"]);
      const done = await seedLead(c, { stationeryId: st, status: "converted" });
      expect((await attemptH(c, VIEW, [done.id, IDS.stationery_member])).rows[0]?.s).toBe("converted");
      // só membro da papelaria do lead
      expect((await attemptH(c, VIEW, [id, IDS.school_member])).hint).toBe("forbidden");
      expect((await attemptH(c, VIEW, [id, IDS.parent])).hint).toBe("forbidden");
      expect((await attemptH(c, VIEW, [id, null])).hint).toBe("forbidden");
      expect((await attemptH(c, VIEW, ["00000000-0000-4000-8000-0000000000ff", IDS.stationery_member])).hint).toBe("not_found");
    });
  });

  it("sub do JWT diferente do ator é recusado em mark_viewed e whatsapp_opened (e igual passa)", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st });
      const claims = (sub: string) => c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub })]);
      await claims(IDS.admin);
      expect((await attemptH(c, VIEW, [id, IDS.stationery_member])).code).toBe("42501");
      expect((await attemptH(c, WA, [id, IDS.parent])).code).toBe("42501");
      expect(await eventTypes(c, id)).toEqual(["created"]);
      await claims(IDS.stationery_member);
      expect((await attemptH(c, VIEW, [id, IDS.stationery_member])).rows[0]?.s).toBe("viewed");
      await claims(IDS.parent);
      expect((await attemptH(c, WA, [id, IDS.parent])).rows[0]?.ok).toBe(true);
    });
  });

  it("papelaria suspensa ainda lê o histórico (leads, itens e eventos) mas não opera", async () => {
    await withClaims("stationery_member", async (c) => {
      const st = await seedStationery(c, { status: "suspended", ownerId: IDS.stationery_member });
      const { id } = await seedLead(c, { stationeryId: st, status: "quote_sent" });
      expect((await c.query("select 1 from public.leads where id = $1", [id])).rowCount).toBe(1);
      expect((await c.query("select 1 from public.lead_items where lead_id = $1", [id])).rowCount).toBe(1);
      expect((await c.query("select 1 from public.lead_events where lead_id = $1", [id])).rowCount).toBe(1);
      await c.query("set local role service_role");
      expect((await attemptH(c, CALL, [id, "converted", IDS.stationery_member, "stationery", null, null])).hint).toBe("stationery_unavailable");
    });
  });

  it("mark_viewed em lead vencido expira (preguiçoso) e devolve expired", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st, expiresIn: "-1 minute" });
      expect((await attemptH(c, VIEW, [id, IDS.stationery_member])).rows[0]?.s).toBe("expired");
      expect(await eventTypes(c, id)).toEqual(["created", "expired"]);
    });
  });

  it("whatsapp_opened: só o solicitante, dedupe de 60 s, lead aberto, evento sem mudar status", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st });
      expect((await attemptH(c, WA, [id, IDS.parent])).rows[0]?.ok).toBe(true);
      expect((await attemptH(c, WA, [id, IDS.parent])).rows[0]?.ok).toBe(false); // deduplicado
      expect(await eventTypes(c, id)).toEqual(["created", "whatsapp_opened"]);
      const ev = (await c.query("select from_status::text f, to_status::text t, actor_role, actor_id from public.lead_events where lead_id = $1 and event_type = 'whatsapp_opened'", [id])).rows[0];
      expect(ev).toEqual({ f: "received", t: "received", actor_role: "parent", actor_id: IDS.parent });
      expect((await leadRow(c, id)).status).toBe("received");
    });
  });

  it("whatsapp_opened depois de 60 s volta a registrar (evento antigo inserido como superuser)", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st });
      await c.query("reset role");
      await c.query(
        "insert into public.lead_events (lead_id, event_type, from_status, to_status, actor_role, actor_id, created_at) values ($1, 'whatsapp_opened', 'received', 'received', 'parent', $2, clock_timestamp() - interval '61 seconds')",
        [id, IDS.parent],
      );
      await c.query("set local role service_role");
      expect((await attemptH(c, WA, [id, IDS.parent])).rows[0]?.ok).toBe(true);
      expect((await attemptH(c, WA, [id, IDS.parent])).rows[0]?.ok).toBe(false);
    });
  });

  it("whatsapp_opened recusa outro ator, lead terminal e lead vencido", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const { id } = await seedLead(c, { stationeryId: st });
      for (const who of [IDS.stationery_member, IDS.admin, IDS.school_member, null]) {
        expect((await attemptH(c, WA, [id, who])).hint, String(who)).toBe("forbidden");
      }
      const done = await seedLead(c, { stationeryId: st, status: "cancelled" });
      expect((await attemptH(c, WA, [done.id, IDS.parent])).hint).toBe("invalid_state");
      const late = await seedLead(c, { stationeryId: st, expiresIn: "-1 minute" });
      expect((await attemptH(c, WA, [late.id, IDS.parent])).hint).toBe("expired");
      expect((await attemptH(c, WA, ["00000000-0000-4000-8000-0000000000ff", IDS.parent])).hint).toBe("not_found");
    });
  });

  it("lead_expire_due expira só vencidos não terminais, respeita o limite e é idempotente", async () => {
    await withClaims("system", async (c) => {
      const st = await setup(c);
      const due: string[] = [];
      for (const s of ["received", "viewed", "in_progress", "quote_sent", "awaiting_customer"] as LeadStatus[]) {
        due.push((await seedLead(c, { stationeryId: st, status: s, expiresIn: "-1 hour" })).id);
      }
      const fresh = await seedLead(c, { stationeryId: st, expiresIn: "+1 hour" });
      const doneOverdue = await seedLead(c, { stationeryId: st, status: "converted", expiresIn: "-1 hour" });
      // limite: expira ao menos os do limite (o banco pode ter outros vencidos de dados confirmados; conta relativa)
      const first = Number((await attemptH(c, EXPIRE, [2])).rows[0]?.n);
      expect(first).toBe(2);
      const second = Number((await attemptH(c, EXPIRE, [1000])).rows[0]?.n);
      expect(second).toBeGreaterThanOrEqual(3);
      expect(Number((await attemptH(c, EXPIRE, [1000])).rows[0]?.n)).toBe(0); // idempotente
      for (const id of due) {
        expect((await leadRow(c, id)).status).toBe("expired");
        expect(await eventTypes(c, id)).toEqual(["created", "expired"]);
      }
      expect((await leadRow(c, fresh.id)).status).toBe("received");
      expect((await leadRow(c, doneOverdue.id)).status).toBe("converted");
      expect(await eventTypes(c, doneOverdue.id)).toEqual(["created"]);
      for (const bad of [0, -1, 20001]) expect((await attemptH(c, EXPIRE, [bad])).hint, String(bad)).toBe("invalid_input");
    });
  });
});

describe("S14 lead_transition · concorrência (dados confirmados)", () => {
  const stationeryIds: string[] = [];
  const leadIds: string[] = [];
  beforeAll(seedUsers);
  afterAll(async () => {
    await purgeLeads({ leadIds });
    await purgeStationeries(stationeryIds);
    await cleanupUsers();
  });

  async function committedLead(opts: { expiresIn?: string; status?: LeadStatus } = {}): Promise<string> {
    return withSuperuser(async (c) => {
      await c.query("begin");
      // um dono só pode ter uma papelaria: reaproveita a primeira (com o membro) nos demais leads
      let st = stationeryIds[0];
      if (!st) {
        st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
        stationeryIds.push(st);
      }
      const l = await seedLead(c, { stationeryId: st, ...opts });
      leadIds.push(l.id);
      await c.query("commit");
      return l.id;
    });
  }
  const svc = (sql: string, params: unknown[]) => asServiceCommitted(async (c) => (await c.query(sql, params)).rows[0]);

  it("duas transições em paralelo: só uma vence, a outra vê o estado novo (1 evento)", async () => {
    const id = await committedLead();
    const results = await Promise.allSettled([
      svc(CALL, [id, "converted", IDS.stationery_member, "stationery", 5000, null]),
      svc(CALL, [id, "cancelled", IDS.parent, "parent", null, null]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((failed.reason as { hint?: string }).hint).toBe("transition_not_allowed");
    await withSuperuser(async (c) => {
      expect(["converted", "cancelled"]).toContain((await leadRow(c, id)).status);
      expect(await eventTypes(c, id)).toHaveLength(2);
    });
  });

  it("transição da papelaria x lead_expire_due em lead vencido: um único evento expired", async () => {
    const id = await committedLead({ expiresIn: "-1 hour" });
    const results = await Promise.allSettled([
      svc(CALL, [id, "in_progress", IDS.stationery_member, "stationery", null, null]),
      svc("select public.lead_expire_due(1000) as n", []),
    ]);
    // em qualquer ordem: nenhuma das duas falha, a transição devolve `expired`
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect((results[0] as PromiseFulfilledResult<{ s: string }>).value.s).toBe("expired");
    await withSuperuser(async (c) => {
      expect((await leadRow(c, id)).status).toBe("expired");
      expect(await eventTypes(c, id)).toEqual(["created", "expired"]);
    });
  });

  it("dois mark_viewed em paralelo geram um único evento viewed", async () => {
    const id = await committedLead();
    const q = "select public.lead_mark_viewed($1::uuid, $2::uuid)::text as s";
    const rs = await Promise.all([svc(q, [id, IDS.stationery_member]), svc(q, [id, IDS.stationery_member])]);
    expect(rs.map((r) => r.s)).toEqual(["viewed", "viewed"]);
    await withSuperuser(async (c) => {
      expect(await eventTypes(c, id)).toEqual(["created", "viewed"]);
    });
  });
});
