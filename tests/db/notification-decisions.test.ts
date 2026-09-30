// S29 · UX-109: decisões da equipe avisam quem foi afetado (0805_s29_decision_notifications). Fato real -> gatilho -> notificação.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedPartner } from "./b2b-fixtures";
import { attempt, cleanupUsers, IDS, seedLead, seedStationery, seedUsers } from "./helpers";
import { asService, asSuper, tx } from "./review-fixtures";

beforeAll(seedUsers);
afterAll(cleanupUsers);

type N = { recipient_id: string; event_type: string; event_key: string; params: Record<string, unknown>; link_path: string; is_demo: boolean };
const notes = async (c: Client, event: string): Promise<N[]> =>
  (await c.query("select recipient_id, event_type, event_key, params, link_path, is_demo from public.notifications where event_type = $1 order by event_key", [event])).rows;
const deliveries = async (c: Client, event: string) =>
  (await c.query("select count(*)::int as n from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.event_type = $1", [event])).rows[0].n as number;
const emitErrors = async (c: Client) => (await c.query("select count(*)::int as n from public.notification_emit_errors")).rows[0].n as number;
const transition = (c: Client, id: string, to: string, reason: string | null = null) =>
  attempt(c, "select public.stationery_transition($1::uuid, $2::public.stationery_status, $3::uuid, 'admin', $4::text)", [id, to, IDS.admin, reason]);

async function seedDispute(c: Client): Promise<{ dispute: string; code: string; stationery: string }> {
  const stationery = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
  const lead = await seedLead(c, { stationeryId: stationery, requesterId: IDS.parent });
  await asSuper(c);
  const r = await c.query(
    "insert into public.lead_disputes (lead_id, stationery_id, reason, opened_by, deadline_at) values ($1, $2, 'wrong_number', $3, now() + interval '5 days') returning id",
    [lead.id, stationery, IDS.stationery_member],
  );
  return { dispute: r.rows[0].id as string, code: lead.code, stationery };
}
const resolve = (c: Client, id: string, decision: string, reason: string | null = "Conferido pela equipe") =>
  attempt(c, "select public.lead_dispute_resolve($1::uuid, $2::uuid, 'admin', $3::text, $4::text)", [id, IDS.admin, decision, reason]);

describe("UX-109 · papelaria aprovada ou recusada avisa a dona", () => {
  it("aprovar: notifica os membros, link /papelaria, sem dado pessoal nem motivo, só entrega externa se o dono ligou", async () => {
    await tx(async (c) => {
      const id = await seedStationery(c, { status: "under_review", ownerId: IDS.stationery_member });
      await asService(c);
      expect((await transition(c, id, "approved")).error).toBeNull();
      await asSuper(c);
      const n = await notes(c, "stationery_decided");
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ recipient_id: IDS.stationery_member, link_path: "/papelaria", params: { status_code: "approved" } });
      expect(n[0]!.event_key.startsWith(`stationery_decided:${id}:approved:`)).toBe(true);
      expect(Object.keys(n[0]!.params)).toEqual(["status_code"]);
      expect(await deliveries(c, "stationery_decided")).toBe(0); // sem preferência ligada = sem canal externo
      expect(await emitErrors(c)).toBe(0);
    });
  });

  it("recusar: notifica com status rejected e sem o motivo em texto livre", async () => {
    await tx(async (c) => {
      const id = await seedStationery(c, { status: "under_review", ownerId: IDS.stationery_member });
      await asService(c);
      expect((await transition(c, id, "rejected", "Documento ilegível do CNPJ 12345678000190")).error).toBeNull();
      await asSuper(c);
      const n = await notes(c, "stationery_decided");
      expect(n.map((x) => x.params)).toEqual([{ status_code: "rejected" }]);
      expect(JSON.stringify(n)).not.toMatch(/CNPJ|Documento/);
    });
  });

  it("pausar/suspender/reativar e a decisão do próprio dono não geram aviso de decisão", async () => {
    await tx(async (c) => {
      const id = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await asService(c);
      expect((await transition(c, id, "paused")).error).toBeNull();
      expect((await transition(c, id, "suspended", "teste")).error).toBeNull();
      await asSuper(c);
      expect(await notes(c, "stationery_decided")).toEqual([]);
    });
  });

  it("papelaria sem membro: nada a notificar e a decisão não falha", async () => {
    await tx(async (c) => {
      const id = await seedStationery(c, { status: "under_review" });
      await asService(c);
      expect((await transition(c, id, "approved")).error).toBeNull();
      await asSuper(c);
      expect(await notes(c, "stationery_decided")).toEqual([]);
    });
  });
});

describe("UX-109 · contestação decidida avisa a papelaria", () => {
  it.each(["accepted", "rejected"] as const)("%s: notifica a dona com o código do pedido no link, sem o motivo", async (decision) => {
    await tx(async (c) => {
      const d = await seedDispute(c);
      await asService(c);
      const r = await resolve(c, d.dispute, decision, "Nota interna com telefone 65 99999-0000");
      expect(r.error).toBeNull();
      await asSuper(c);
      const n = await notes(c, "dispute_decided");
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ recipient_id: IDS.stationery_member, event_key: `dispute_decided:${d.dispute}`, link_path: `/papelaria/leads/${d.code}`, params: { status_code: decision } });
      expect(JSON.stringify(n)).not.toMatch(/telefone|99999/);
      expect(await emitErrors(c)).toBe(0);
    });
  });

  it("decisão repetida (idempotente) não duplica o aviso", async () => {
    await tx(async (c) => {
      const d = await seedDispute(c);
      await asService(c);
      await resolve(c, d.dispute, "rejected");
      await resolve(c, d.dispute, "rejected");
      await asSuper(c);
      expect(await notes(c, "dispute_decided")).toHaveLength(1);
    });
  });
});

describe("UX-109 · parceiro decidido avisa o dono do parceiro", () => {
  const payload = JSON.stringify({ plan: "sandbox", test_rate_per_minute: 60, test_rate_per_day: 1000 });
  const decide = (c: Client, id: string, to: string, body = payload) =>
    attempt(c, "select public.b2b_partner_decide($1::uuid, $2::uuid, $3::text, $4::jsonb)", [id, IDS.admin, to, body]);

  it("sandbox: notifica o dono, link /b2b/conta, só central (nenhuma entrega externa)", async () => {
    await tx(async (c) => {
      const id = await seedPartner(c, { status: "pending", ownerId: IDS.parent });
      await asService(c);
      expect((await decide(c, id, "sandbox")).error).toBeNull();
      await asSuper(c);
      const n = await notes(c, "partner_decided");
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ recipient_id: IDS.parent, link_path: "/b2b/conta", params: { status_code: "sandbox" } });
      expect(await deliveries(c, "partner_decided")).toBe(0);
      expect(await emitErrors(c)).toBe(0);
    });
  });

  it("rejeitar: notifica sem o motivo; suspender não notifica", async () => {
    await tx(async (c) => {
      const a = await seedPartner(c, { status: "pending", ownerId: IDS.parent });
      const b = await seedPartner(c, { status: "sandbox", ownerId: IDS.stationery_member });
      await asService(c);
      expect((await decide(c, a, "rejected", JSON.stringify({ reason: "CNPJ 00.000.000/0001-00 inconsistente" }))).error).toBeNull();
      expect((await decide(c, b, "suspended", JSON.stringify({ reason: "uso indevido" }))).error).toBeNull();
      await asSuper(c);
      const n = await notes(c, "partner_decided");
      expect(n.map((x) => [x.recipient_id, x.params])).toEqual([[IDS.parent, { status_code: "rejected" }]]);
      expect(JSON.stringify(n)).not.toMatch(/CNPJ|inconsistente/);
    });
  });
});

describe("UX-109 · catálogo e privilégios", () => {
  it("event_type e status_code novos aceitos; texto livre e evento fora do catálogo recusados", async () => {
    await tx(async (c) => {
      const ins = (event: string, params: object) =>
        attempt(c, "insert into public.notifications (recipient_id, event_type, event_key, params, link_path) values ($1, $2, gen_random_uuid()::text, $3::jsonb, '/papelaria')", [IDS.parent, event, JSON.stringify(params)]);
      for (const e of ["stationery_decided", "dispute_decided", "partner_decided"]) expect((await ins(e, { status_code: "rejected" })).error).toBeNull();
      expect((await ins("dispute_decided", { status_code: "accepted" })).error).toBeNull();
      expect((await ins("partner_decided", { status_code: "sandbox" })).error).toBeNull();
      expect((await ins("partner_decided", { status_code: "active" })).error).toBeNull();
      expect((await ins("stationery_decided", { reason: "texto livre" })).error).not.toBeNull();
      expect((await ins("admin_note", { status_code: "approved" })).error).not.toBeNull();
    });
  });

  it("funções de gatilho novas: definer, search_path vazio, sem EXECUTE para anon/authenticated/service_role", async () => {
    await tx(async (c) => {
      const r = await c.query(
        `select p.proname, p.prosecdef, p.proconfig,
                has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
                has_function_privilege('service_role', p.oid, 'execute') as svc, has_function_privilege('public', p.oid, 'execute') as pub
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('notify_stationery_decided', 'notify_dispute_decided', 'notify_partner_decided') order by 1`,
      );
      expect(r.rows.map((x) => x.proname)).toEqual(["notify_dispute_decided", "notify_partner_decided", "notify_stationery_decided"]);
      for (const f of r.rows) {
        expect(f).toMatchObject({ prosecdef: true, anon: false, auth: false, svc: false, pub: false });
        expect(f.proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/^search_path=("")?$/)]));
      }
    });
  });
});
