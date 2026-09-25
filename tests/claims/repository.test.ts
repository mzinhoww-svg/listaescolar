import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { ClaimRepositoryError, createClaimsRepository, type ClaimsRepository, type CreateClaimArgs } from "@/features/claims/repository";
import { getClaimForAdmin, getClaimStatusView, getMyClaimForSchool, getSchoolClaimContext, listClaimQueue } from "@/features/claims/queries";
import { CLAIM_ACTORS, CLAIM_STATUSES, canTransition } from "@/features/claims/state";
import { MemoryClaimTokenSender } from "@/features/claims/senders";

import {
  CLAIMANT_EMAIL, SCHOOL_EMAIL, SCHOOL_PHONE, backdateTokens, ensureProfile, schoolStatus, seedClaimSchool, statusOf,
} from "../db/claim-fixtures";
import { IDS, cleanupUsers, seedUsers, withSuperuser } from "../db/helpers";
import { concat, enc, pdf, png } from "../helpers/files";
import { MemoryEvidenceStorage, localEnv, sessionClient, type LocalEnv } from "./support";

// Session actors só nascem de getSessionActor (sessão + perfil): o teste simula a sessão com mocks de auth/queries.
const session = vi.hoisted(() => ({ user: null as { id: string } | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({
  getCurrentUser: async () => session.user,
  getCurrentRole: async () => session.role,
}));
async function actorOf(id: string, role: string): Promise<SessionActor> {
  session.user = { id };
  session.role = role;
  return (await getSessionActor())!;
}

const INEPS = ["51999801", "51999802", "51999803", "51999804", "51999805"];
const ORIGIN = "http://localhost:3001";
let env: LocalEnv;
let service: SupabaseClient;
let storage: MemoryEvidenceStorage;
let sender: MemoryClaimTokenSender;
let repo: ClaimsRepository;
let parent: SessionActor;
let spare: SessionActor;
let admin: SessionActor;
let stationery: SessionActor;

async function cleanupClaims(): Promise<void> {
  await withSuperuser(async (c: Client) => {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    const sub = "select id from public.claims where school_id in (select id from public.schools where inep = any($1::text[]))";
    for (const t of ["claim_tokens", "claim_evidence", "claim_status_events"]) await c.query(`delete from public.${t} where claim_id in (${sub})`, [INEPS]);
    await c.query("delete from public.school_members where school_id in (select id from public.schools where inep = any($1::text[]))", [INEPS]);
    await c.query(`delete from public.claims where id in (${sub})`, [INEPS]);
    await c.query("delete from public.schools where inep = any($1::text[])", [INEPS]);
    await c.query("commit");
  });
}

const school = (inep: string, o: Parameters<typeof seedClaimSchool>[1] = {}) =>
  withSuperuser((c) => seedClaimSchool(c, { inep, demo: true, ...o }));
const schoolId = async (inep: string) =>
  (await service.from("schools").select("id").eq("inep", inep).single()).data!.id as string;
const CLAIM_IN = { method: "documents" as const, claimantName: "Maria da Silva", claimantRoleTitle: "Diretora" };
const claimOf = async (inep: string, a: SessionActor = parent, extra: Partial<Omit<CreateClaimArgs, "schoolId">> = {}) =>
  repo.createClaim(a, { schoolId: await schoolId(inep), ...CLAIM_IN, ...extra });
const errCode = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ClaimRepositoryError | null;

beforeAll(async () => {
  env = localEnv();
  service = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  await cleanupClaims();
  await seedUsers();
  await withSuperuser(async (c) => {
    await ensureProfile(c, IDS.spare, "parent");
  });
  parent = await actorOf(IDS.parent, "parent");
  spare = await actorOf(IDS.spare, "parent");
  admin = await actorOf(IDS.admin, "admin");
  stationery = await actorOf(IDS.stationery_member, "stationery_member");
});

afterAll(async () => {
  await cleanupClaims();
  await cleanupUsers();
});

afterEach(async () => {
  // cada teste começa sem escolas de teste; usuários voltam ao papel original.
  await cleanupClaims();
  await withSuperuser(async (c) => {
    await c.query("update public.profiles set role = 'parent' where id = any($1::uuid[])", [[IDS.parent, IDS.spare]]);
  });
});

const fresh = () => {
  storage = new MemoryEvidenceStorage();
  sender = new MemoryClaimTokenSender();
  repo = createClaimsRepository(service, { storage });
};
beforeAll(fresh);
afterEach(fresh);

const tokenFromLink = (link: string) => new URL(link).searchParams.get("token")!;

describe("matriz TS x banco real (claim_transition_allowed): 108 triplas", () => {
  const triples = CLAIM_ACTORS.flatMap((a) => CLAIM_STATUSES.flatMap((f) => CLAIM_STATUSES.map((t) => [a, f, t] as const)));
  it.each(triples)("%s: %s -> %s", async (actor, from, to) => {
    const { data, error } = await service.rpc("claim_transition_allowed", { p_from: from, p_to: to, p_actor: actor });
    expect(error).toBeNull();
    expect(data).toBe(canTransition(actor, from, to));
  });
});

describe("ator", () => {
  it("objeto forjado é recusado antes de qualquer chamada ao banco", async () => {
    const rpc = vi.spyOn(service, "rpc");
    const forged = { userId: IDS.admin, role: "admin" } as unknown as SessionActor;
    for (const call of [
      () => repo.createClaim(forged, { schoolId: IDS.parent, ...CLAIM_IN }),
      () => repo.decide(forged, { claimId: IDS.parent, to: "approved" }),
      () => repo.submitForReview(forged, { claimId: IDS.parent }),
      () => repo.expireTokens(forged),
    ]) expect((await errCode(call()))?.code).toBe("forbidden");
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockRestore();
  });

  it("papéis que não reivindicam (admin, papelaria) são recusados", async () => {
    await school(INEPS[0]!);
    const id = await schoolId(INEPS[0]!);
    for (const a of [admin, stationery]) expect((await errCode(repo.createClaim(a, { schoolId: id, ...CLAIM_IN })))?.code).toBe("forbidden");
  });
});

describe("fluxo por documentos", () => {
  it("criar -> evidência -> enviar -> pedir evidência -> reenvio -> aprovar", async () => {
    await school(INEPS[0]!);
    const id = await claimOf(INEPS[0]!);
    expect(await statusOf_(id)).toBe("submitted");

    // enviar sem evidência é recusado; bytes ruins nunca chegam ao Storage
    expect((await errCode(repo.submitForReview(parent, { claimId: id })))?.code).toBe("invalid_state");
    const bad = await errCode(repo.addEvidence(parent, { claimId: id, bytes: enc("<html>"), declaredMime: "application/pdf", originalName: "x.pdf" }));
    expect(bad?.code).toBe("invalid_file");
    const big = concat(pdf(), new Uint8Array(4_000_000));
    expect((await errCode(repo.addEvidence(parent, { claimId: id, bytes: big, declaredMime: "application/pdf", originalName: "x.pdf" })))?.code).toBe("file_too_large");
    expect(storage.objects.size).toBe(0);

    const ev = await repo.addEvidence(parent, { claimId: id, bytes: pdf(), declaredMime: "application/pdf", originalName: "../Certidão.pdf" });
    expect([...storage.objects.keys()]).toEqual([expect.stringMatching(new RegExp(`^${id}/[0-9a-f-]{36}\\.pdf$`))]);
    await repo.submitForReview(parent, { claimId: id });
    expect(await statusOf_(id)).toBe("awaiting_verification");
    await withSuperuser(async (c) => expect(await schoolStatus(c, await schoolId(INEPS[0]!))).toBe("claimed"));

    // outro usuário e não-admin não decidem; motivo é obrigatório
    expect((await errCode(repo.decide(spare, { claimId: id, to: "approved" })))?.code).toBe("forbidden");
    expect((await errCode(repo.decide(parent, { claimId: id, to: "approved" })))?.code).toBe("forbidden");
    expect((await errCode(repo.decide(admin, { claimId: id, to: "insufficient_evidence" })))?.code).toBe("invalid_argument");
    await repo.decide(admin, { claimId: id, to: "insufficient_evidence", reason: "Envie o ato de nomeação" });
    expect(await statusOf_(id)).toBe("insufficient_evidence");

    // reenvio sem novidade é recusado; com evidência nova volta à fila
    expect((await errCode(repo.submitForReview(parent, { claimId: id })))?.code).toBe("invalid_state");
    await repo.addEvidence(parent, { claimId: id, bytes: png(), declaredMime: "image/png", originalName: "nomeação.png" });
    await repo.submitForReview(parent, { claimId: id });

    // remover evidência apaga o objeto
    const before = storage.objects.size;
    expect(before).toBe(2);
    const view = await getClaimForAdmin(admin, id, { admin: service, repo });
    expect(view?.evidence).toHaveLength(2);
    expect(await repo.evidenceSignedUrl(admin, ev.id)).toMatch(/ttl=60$/);
    expect((await errCode(repo.evidenceSignedUrl(parent, ev.id)))?.code).toBe("forbidden");

    await repo.decide(admin, { claimId: id, to: "approved" });
    expect(await statusOf_(id)).toBe("approved");
    await withSuperuser(async (c) => {
      expect(await schoolStatus(c, await schoolId(INEPS[0]!))).toBe("verified");
      const r = await c.query("select role::text from public.profiles where id = $1", [IDS.parent]);
      expect(r.rows[0].role).toBe("school_member");
    });
  });

  it("evidência recusada pela função remove o objeto que já estava no Storage", async () => {
    await school(INEPS[0]!);
    const id = await claimOf(INEPS[0]!);
    await repo.addEvidence(parent, { claimId: id, bytes: pdf(), declaredMime: "application/pdf", originalName: "a.pdf" });
    await repo.submitForReview(parent, { claimId: id });
    const err = await errCode(repo.addEvidence(parent, { claimId: id, bytes: pdf(), declaredMime: "application/pdf", originalName: "b.pdf" }));
    expect(err?.code).toBe("invalid_state");
    expect(storage.objects.size).toBe(1);
  });

  it("removeEvidence apaga a linha e o objeto; outro usuário não remove", async () => {
    await school(INEPS[0]!);
    const id = await claimOf(INEPS[0]!);
    const ev = await repo.addEvidence(parent, { claimId: id, bytes: pdf(), declaredMime: "application/pdf", originalName: "a.pdf" });
    expect((await errCode(repo.removeEvidence(spare, ev.id)))?.code).toBe("forbidden");
    await repo.removeEvidence(parent, ev.id);
    expect(storage.objects.size).toBe(0);
  });

  it("uma aberta por escola e usuário; escola inexistente ou verificada", async () => {
    await school(INEPS[0]!);
    await school(INEPS[1]!, { status: "verified" });
    await claimOf(INEPS[0]!);
    expect((await errCode(claimOf(INEPS[0]!)))?.code).toBe("invalid_state");
    expect((await errCode(claimOf(INEPS[1]!)))?.code).toBe("school_closed");
    expect((await errCode(repo.createClaim(parent, { schoolId: IDS.admin, ...CLAIM_IN })))?.code).toBe("not_found");
  });
});

describe("fluxo por e-mail", () => {
  const emailClaim = (a: SessionActor = parent) => claimOf(INEPS[0]!, a, { method: "institutional_email" });

  it("emitir -> confirmar -> aprovar; destino nunca sai do repositório", async () => {
    await school(INEPS[0]!);
    const id = await emailClaim();
    const issued = await repo.issueToken(parent, { claimId: id, sender, origin: ORIGIN });
    expect(issued.channel).toBe("email");
    expect(JSON.stringify(issued)).not.toContain(SCHOOL_EMAIL);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ channel: "email", to: SCHOOL_EMAIL });
    const link = sender.sent[0]!.secret;
    expect(link.startsWith(`${ORIGIN}/escolas/${INEPS[0]}/reivindicar/confirmar?token=`)).toBe(true);
    const token = tokenFromLink(link);
    expect(await statusOf_(id)).toBe("awaiting_verification");

    // aprovar sem canal confirmado é recusado
    expect((await errCode(repo.decide(admin, { claimId: id, to: "approved" })))?.code).toBe("invalid_state");
    // outro usuário não confirma; o token errado nunca levanta
    expect(await repo.confirmToken(spare, { channel: "email", token })).toBe("invalid");
    expect(await repo.confirmToken(parent, { channel: "email", token: "A".repeat(43) })).toBe("invalid");
    expect(await repo.confirmToken(parent, { channel: "email", token })).toBe("confirmed");
    expect(await repo.confirmToken(parent, { channel: "email", token })).toBe("already_confirmed");
    await repo.decide(admin, { claimId: id, to: "approved" });
    expect(await statusOf_(id)).toBe("approved");
  });

  it("token vencido leva a token_expired; novo token volta a awaiting_verification", async () => {
    await school(INEPS[0]!);
    const id = await emailClaim();
    await repo.issueToken(parent, { claimId: id, sender, origin: ORIGIN });
    const first = tokenFromLink(sender.sent[0]!.secret);
    await withSuperuser((c) => backdateTokens(c, id, 25 * 3600));
    expect(await repo.confirmToken(parent, { channel: "email", token: first })).toBe("expired");
    expect(await statusOf_(id)).toBe("token_expired");
    await repo.issueToken(parent, { claimId: id, sender, origin: ORIGIN });
    expect(await statusOf_(id)).toBe("awaiting_verification");
    expect(await repo.confirmToken(parent, { channel: "email", token: first })).toBe("invalid");
  });

  it("expireTokens: varredura é do admin; o reivindicante só a própria", async () => {
    await school(INEPS[0]!);
    const id = await emailClaim();
    await repo.issueToken(parent, { claimId: id, sender, origin: ORIGIN });
    await withSuperuser((c) => backdateTokens(c, id, 25 * 3600));
    expect((await errCode(repo.expireTokens(parent)))?.code).toBe("forbidden");
    expect((await errCode(repo.expireTokens(spare, id)))?.code).toBe("not_found");
    expect(await repo.expireTokens(parent, id)).toBe(1);
    expect(await repo.expireTokens(admin)).toBe(0);
    expect(await statusOf_(id)).toBe("token_expired");
  });

  it("sem provedor: não emite nada; falha de entrega vira erro fixo e não vaza o destino", async () => {
    await school(INEPS[0]!);
    const id = await emailClaim();
    expect((await errCode(repo.issueToken(parent, { claimId: id, sender: null, origin: ORIGIN })))?.code).toBe("delivery_unavailable");
    await withSuperuser(async (c) => expect((await c.query("select count(*)::int as n from public.claim_tokens where claim_id = $1", [id])).rows[0].n).toBe(0));
    // o entregador pode depender da escola: escola real (não demo) não recebe o de console
    expect((await errCode(repo.issueToken(parent, { claimId: id, sender: (sc) => (sc.isDemo ? null : sender), origin: ORIGIN })))?.code).toBe("delivery_unavailable");
    sender.failNext = true;
    const err = await errCode(repo.issueToken(parent, { claimId: id, sender, origin: ORIGIN }));
    expect(err?.code).toBe("delivery_failed");
    expect(JSON.stringify(err?.message)).not.toContain(SCHOOL_EMAIL);
  });

  it("colisão do hash (23505) refaz com novo token", async () => {
    await school(INEPS[0]!);
    await school(INEPS[1]!);
    const fixed = "B".repeat(43);
    const queue = [fixed, fixed, "C".repeat(43)];
    const rp = createClaimsRepository(service, { storage, generateEmailToken: () => queue.shift() ?? "D".repeat(43) });
    const a = await emailClaim();
    await rp.issueToken(parent, { claimId: a, sender, origin: ORIGIN });
    const b = await claimOf(INEPS[1]!, parent, { method: "institutional_email" });
    await rp.issueToken(parent, { claimId: b, sender, origin: ORIGIN });
    expect(tokenFromLink(sender.sent[0]!.secret)).toBe(fixed);
    expect(tokenFromLink(sender.sent[1]!.secret)).toBe("C".repeat(43));
  });

  it("reivindicação de outro usuário não emite token", async () => {
    await school(INEPS[0]!);
    const id = await emailClaim();
    expect((await errCode(repo.issueToken(spare, { claimId: id, sender, origin: ORIGIN })))?.code).toBe("not_found");
    expect(sender.sent).toHaveLength(0);
  });
});

describe("fluxo por WhatsApp", () => {
  it("código de 6 dígitos vai ao celular da escola; código errado não confirma", async () => {
    await school(INEPS[0]!);
    const id = await claimOf(INEPS[0]!, parent, { method: "institutional_whatsapp" });
    const issued = await repo.issueToken(parent, { claimId: id, sender, origin: ORIGIN });
    expect(issued.channel).toBe("whatsapp");
    expect(sender.sent[0]).toMatchObject({ channel: "whatsapp", to: `55${SCHOOL_PHONE}` });
    const code = sender.sent[0]!.secret;
    expect(code).toMatch(/^[0-9]{6}$/);
    const wrong = code === "000000" ? "000001" : "000000";
    expect(await repo.confirmToken(parent, { channel: "whatsapp", claimId: id, code: wrong })).toBe("invalid");
    expect(await repo.confirmToken(spare, { channel: "whatsapp", claimId: id, code })).toBe("invalid");
    expect(await repo.confirmToken(parent, { channel: "whatsapp", claimId: id, code })).toBe("confirmed");
  });
});

describe("consultas nunca expõem o contato da escola", () => {
  it("contexto, fila, admin, estado e minha reivindicação", async () => {
    await school(INEPS[0]!);
    const id = await claimOf(INEPS[0]!);
    await repo.addEvidence(parent, { claimId: id, bytes: pdf(), declaredMime: "application/pdf", originalName: "a.pdf" });
    await repo.submitForReview(parent, { claimId: id });

    const ctx = await getSchoolClaimContext(INEPS[0]!, { admin: service, env: {} });
    expect(ctx?.school.inep).toBe(INEPS[0]);
    expect(ctx?.blockedReason).toBeNull();
    expect(ctx?.methods.institutional_email).toMatchObject({ available: false });
    expect(ctx?.methods.documents).toEqual({ available: true });
    const demo = await getSchoolClaimContext(INEPS[0]!, { admin: service, env: { DEMO_CLAIM_DELIVERY: "1", APP_ENV: "local" } });
    expect(demo?.methods.institutional_email).toEqual({ available: true });
    expect(demo?.methods.institutional_whatsapp).toEqual({ available: true });

    const mine = await getMyClaimForSchool(parent, INEPS[0]!, { session: sessionClient(env, IDS.parent) });
    expect(mine?.id).toBe(id);
    const view = await getClaimStatusView(parent, id, { session: sessionClient(env, IDS.parent), repo });
    expect(view?.events.map((e) => e.toStatus)).toEqual(["submitted", "awaiting_verification"]);
    expect(view?.evidence).toHaveLength(1);
    expect(await getClaimStatusView(spare, id, { session: sessionClient(env, IDS.spare), repo })).toBeNull();
    expect(await getMyClaimForSchool(spare, INEPS[0]!, { session: sessionClient(env, IDS.spare) })).toBeNull();

    const queue = await listClaimQueue(admin, {}, { admin: service, repo });
    expect(queue.map((r) => r.id)).toContain(id);
    expect(queue.find((r) => r.id === id)).toMatchObject({ contactEmail: CLAIMANT_EMAIL, evidenceCount: 1 });
    await expect(listClaimQueue(parent, {}, { admin: service, repo })).rejects.toMatchObject({ code: "forbidden" });
    await expect(getClaimForAdmin(parent, id, { admin: service, repo })).rejects.toMatchObject({ code: "forbidden" });
    const adminView = await getClaimForAdmin(admin, id, { admin: service, repo });

    const all = JSON.stringify([ctx, demo, mine, view, queue, adminView]);
    expect(all).not.toContain(SCHOOL_EMAIL);
    expect(all).not.toContain(SCHOOL_PHONE);
    expect(all).not.toMatch(/decided_by|decidedBy|actor_id|storage_path|token_hash/);
  });

  it("escola verificada mostra o motivo fixo; município desabilitado é nulo", async () => {
    await school(INEPS[0]!, { status: "verified" });
    await school(INEPS[1]!, { enabled: false });
    expect((await getSchoolClaimContext(INEPS[0]!, { admin: service, env: {} }))?.blockedReason).toMatch(/administrador|verificada/);
    expect(await getSchoolClaimContext(INEPS[1]!, { admin: service, env: {} })).toBeNull();
    expect(await getSchoolClaimContext("51000000", { admin: service, env: {} })).toBeNull();
  });
});

async function statusOf_(id: string): Promise<string> {
  return withSuperuser((c) => statusOf(c, id));
}
