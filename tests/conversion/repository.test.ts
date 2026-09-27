import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: null as string | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => (authState.userId ? { id: authState.userId } : null),
  getCurrentRole: async () => authState.role,
}));

import { ConversionError } from "@/features/conversion/errors";
import { createConversionStore } from "@/features/conversion/repository";
import { getSessionActor, type SessionActor } from "@/features/stationeries/actor";

import { cleanupUsers, IDS, seedLead, seedStationery, seedUsers, withSuperuser } from "../db/helpers";

// Roda em `pnpm test:db`. Mesmo padrão de tests/billing/repository.test.ts: cliente de serviço próprio (chaves de
// `scripts/supa.mjs env`), atores mockados sobre os ids fixos de `tests/db/helpers` (sem criar usuários novos).
function localEnv(): { url: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("só roda contra Supabase local");
  return { url, secret: get("SUPABASE_SECRET_KEY") };
}

let admin: SupabaseClient;
let stationeryId: string;

async function actor(userId: string, role: string): Promise<SessionActor> {
  authState.userId = userId;
  authState.role = role;
  const a = await getSessionActor();
  if (!a) throw new Error("sem ator");
  return a;
}

async function declareSaleBySql(leadId: string, stationeryOwnerId: string): Promise<void> {
  await withSuperuser(async (c) => {
    await c.query("set local role service_role");
    await c.query("select public.lead_transition($1::uuid, 'converted'::public.lead_status, $2::uuid, 'stationery', null, null)", [leadId, stationeryOwnerId]);
  });
}

beforeAll(async () => {
  const env = localEnv();
  admin = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  await seedUsers();
  // uma papelaria por dono (stationery_members_one_owner_per_profile): compartilhada pelos 3 testes deste arquivo.
  stationeryId = await withSuperuser((c) => seedStationery(c, { status: "active", ownerId: IDS.stationery_member }));
  // membro de outra papelaria (IDS.school_member): usado só para o teste de acesso negado abaixo.
  await withSuperuser((c) => seedStationery(c, { status: "active", ownerId: IDS.school_member }));
});

afterAll(cleanupUsers);

describe("ConversionStore × banco real", () => {
  it("confirmação do pai (1 sinal) + declaração da papelaria (2 sinais) -> confirmed; avaliação some da lista de pendentes", async () => {
    const store = createConversionStore(admin);
    // is_demo: false (papelaria também é real): avaliação real deve aparecer no perfil público (a de brincadeira
    // numa papelaria real é filtrada por `listPublishedReviews`, revisão de segurança).
    const lead = await withSuperuser((c) => seedLead(c, { stationeryId, requesterId: IDS.parent, overrides: { is_demo: false } }));

    const parentActor = await actor(IDS.parent, "parent");
    const stationeryActor = await actor(IDS.stationery_member, "stationery_member");

    await store.confirmPurchase(parentActor, lead.id, "bought_here");
    let signals = await store.getSignals(stationeryActor, lead.id);
    expect(signals).toMatchObject({ parentConfirmed: true, stationeryConfirmed: false, signalCount: 1, confirmed: false, pixConfirmed: false });

    await declareSaleBySql(lead.id, IDS.stationery_member);
    signals = await store.getSignals(parentActor, lead.id);
    expect(signals).toMatchObject({ parentConfirmed: true, stationeryConfirmed: true, signalCount: 2, confirmed: true });

    let survey = await actor(IDS.parent, "parent").then((a) => store.listSurveyLeadsForParent(a, 50));
    let mine = survey.find((s) => s.leadId === lead.id);
    expect(mine).toMatchObject({ existingAnswer: "bought_here", canReview: true, alreadyReviewed: false });

    await store.createReview(parentActor, lead.id, { rating: 5, tags: ["bom_atendimento"], comment: "atendimento ótimo" });
    survey = await store.listSurveyLeadsForParent(parentActor, 50);
    mine = survey.find((s) => s.leadId === lead.id);
    expect(mine).toMatchObject({ alreadyReviewed: true, canReview: false });

    const published = await store.listPublishedReviews(stationeryId, 10);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ rating: 5, tags: ["bom_atendimento"], status: "published" });
  });

  it("contestação: abre, aparece na fila do admin, é aceita e some da fila de abertas; ator de outra papelaria não acessa", async () => {
    const store = createConversionStore(admin);
    const lead = await withSuperuser((c) => seedLead(c, { stationeryId, requesterId: IDS.parent }));

    const stationeryActor = await actor(IDS.stationery_member, "stationery_member");
    const otherActor = await actor(IDS.school_member, "stationery_member");
    const adminActor = await actor(IDS.admin, "admin");

    let gate = await store.getDisputeGate(stationeryActor, lead.id);
    expect(gate).toMatchObject({ canDispute: true, existingDispute: null });

    await expect(store.getDisputeGate(otherActor, lead.id)).rejects.toMatchObject({ code: "forbidden" } satisfies Partial<ConversionError>);

    const disputeId = await store.openDispute(stationeryActor, lead.id, "wrong_number", "número não existe");
    gate = await store.getDisputeGate(stationeryActor, lead.id);
    expect(gate.canDispute).toBe(false);
    expect(gate.existingDispute).toMatchObject({ id: disputeId, status: "open", reason: "wrong_number" });

    const open = await store.listOpenDisputesForAdmin(adminActor);
    expect(open.some((d) => d.id === disputeId)).toBe(true);

    await expect(store.listOpenDisputesForAdmin(stationeryActor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(store.resolveDispute(stationeryActor, disputeId, "accepted", null)).rejects.toMatchObject({ code: "forbidden" });

    await store.resolveDispute(adminActor, disputeId, "accepted", "dado do pai não bate");
    const afterOpen = await store.listOpenDisputesForAdmin(adminActor);
    expect(afterOpen.some((d) => d.id === disputeId)).toBe(false);
    const resolved = await store.listResolvedDisputesForAdmin(adminActor, 50);
    expect(resolved.find((d) => d.id === disputeId)).toMatchObject({ status: "accepted" });
  });

  it("auditoria (Admin11): divergência quando a papelaria declara sem confirmação do pai", async () => {
    const store = createConversionStore(admin);
    const lead = await withSuperuser((c) => seedLead(c, { stationeryId, requesterId: IDS.parent }));
    await declareSaleBySql(lead.id, IDS.stationery_member);

    const adminActor = await actor(IDS.admin, "admin");
    const rows = await store.listAuditRows(adminActor, 200);
    const row = rows.find((r) => r.leadId === lead.id);
    expect(row).toMatchObject({ declaredConverted: true, divergent: true });
    expect(row!.signals.signalCount).toBe(1);

    const parentActor = await actor(IDS.parent, "parent");
    await expect(store.listAuditRows(parentActor, 10)).rejects.toMatchObject({ code: "forbidden" });
  });
});
