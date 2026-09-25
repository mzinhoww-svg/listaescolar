import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { createReviewService } from "@/features/review/service";
import { createReviewRepository } from "@/features/review/repository";
import { getDetail, listQueue } from "@/features/review/read-models";
import { createParentCopyService } from "@/features/review/parent-copy";
import { MemoryListPublisher } from "@/supabase/functions/_shared/publication/memory";

import { IDS, cleanupUsers, seedUsers, withSuperuser } from "../db/helpers";
import { purgeSubmissions, seedSubmission } from "../db/review-fixtures";
import { localEnv } from "../claims/support";
import { FIXTURE, memoryPublication, SCHOOL } from "./support";

const session = vi.hoisted(() => ({ user: null as { id: string } | null, role: null as string | null }));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: async () => session.user, getCurrentRole: async () => session.role }));
async function actorOf(id: string, role: string): Promise<SessionActor> {
  session.user = { id };
  session.role = role;
  return (await getSessionActor())!;
}

let service: SupabaseClient;
const created: string[] = [];
const commit = (opts: Parameters<typeof seedSubmission>[1] = {}) =>
  withSuperuser(async (c) => {
    const id = await seedSubmission(c, { schoolId: SCHOOL, ...opts });
    created.push(id);
    return id;
  });

beforeAll(async () => {
  await seedUsers();
  const env = localEnv();
  service = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
});
afterAll(async () => {
  await purgeSubmissions(created);
  await cleanupUsers();
});

const dbRows = (id: string) =>
  withSuperuser(async (c) => (await c.query("select kind, decision, actor_id, reasons from public.ai_decisions where entity_id = $1 order by created_at, id", [id])).rows as { kind: string; decision: string; actor_id: string | null; reasons: string[] }[]);

describe("revisão ponta a ponta contra o banco local (porta em memória)", () => {
  it("abre, edita, aprova e publica; a fila, o detalhe e a origem da publicação vêm das linhas", async () => {
    const id = await commit({ grade: "4º ano", year: 2027 });
    const repo = createReviewRepository(service);
    const { deps, publisher } = memoryPublication({ publisher: new MemoryListPublisher() });
    const svc = createReviewService({ store: repo.store, publication: deps });
    const admin = await actorOf(IDS.admin, "admin");

    const opened = await svc.open(admin, id);
    expect(opened.version).toBe(1);
    expect((await listQueue(repo, "pending")).some((r) => r.id === id)).toBe(true);
    const row = (await listQueue(repo, "pending")).find((r) => r.id === id)!;
    expect(row).toMatchObject({ source: "school", isDemo: false, itemCount: 3 });
    expect(JSON.stringify(row)).not.toMatch(/lista-secreta|storage|@/);

    const items = [
      { name: "Caderno 96 folhas", quantity: 2, unit: "un", category: "papelaria", confidence: 0.92, alerts: [], origin: "extracted" },
      { name: "Lápis preto HB", quantity: 12, unit: null, category: "escrita", confidence: null, alerts: [], origin: "edited" },
      { name: "Régua", quantity: 1, unit: "un", category: "papelaria", confidence: null, alerts: [], origin: "added" },
    ];
    const saved = await svc.save(admin, id, { grade: "4º ano", schoolYear: 2027, items, expectedVersion: 1 });
    expect(saved).toMatchObject({ status: "saved", version: 2 });
    expect(await svc.save(admin, id, { grade: "4º ano", schoolYear: 2027, items, expectedVersion: 1 })).toMatchObject({ status: "stale", version: 2 });

    // alerta crítico do resultado (handwritten está em ai_settings.critical_alerts): exige confirmar
    const blocked = await svc.approveAndPublish(admin, id, { expectedVersion: 2, acknowledged: false });
    expect(blocked).toEqual({ approval: { status: "blocked", codes: ["critical_alerts_unconfirmed"] }, publication: null });
    const done = await svc.approveAndPublish(admin, id, { expectedVersion: 2, acknowledged: true });
    expect(done.approval).toEqual({ status: "approved" });
    expect(done.publication).toMatchObject({ status: "published" });
    expect(publisher!.calls).toHaveLength(1);
    expect(publisher!.calls[0]).toMatchObject({ source: "school_upload", actor: { kind: "admin", profileId: IDS.admin } });
    expect(publisher!.calls[0]!.items).toHaveLength(3);

    const rows = await dbRows(id);
    expect(rows.map((r) => `${r.kind}:${r.decision}`)).toEqual(["review:edited", "review:approved", "review:published"]);
    expect(rows.every((r) => r.actor_id === IDS.admin)).toBe(true);
    expect(rows[1]!.reasons).toEqual(["critical_alerts_acknowledged"]);
    expect(JSON.stringify(rows)).not.toContain("Caderno");

    const detail = await getDetail(repo, id);
    expect(detail).toMatchObject({ publishedBy: "human", hasOrphan: false, submission: { status: "published" }, current: { version: 2 } });
    expect(detail!.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(detail!.extraction?.criticalAlerts ?? []).toEqual([]);
    expect(detail!.extraction?.alerts).toContain("handwritten");
    expect((await listQueue(repo, "approved")).find((r) => r.id === id)?.state).toBe("published");
    expect((await listQueue(repo, "pending")).some((r) => r.id === id)).toBe(false);
  });

  it("recusa: vai para a aba Recusadas com o código; não-admin nunca chega ao banco", async () => {
    const id = await commit();
    const repo = createReviewRepository(service);
    const svc = createReviewService({ store: repo.store, publication: memoryPublication().deps });
    const admin = await actorOf(IDS.admin, "admin");
    await svc.open(admin, id);
    expect(await svc.reject(admin, id, { reason: "illegible_document", expectedVersion: 1 })).toEqual({ status: "rejected" });
    expect((await listQueue(repo, "rejected")).some((r) => r.id === id)).toBe(true);
    expect((await dbRows(id)).map((r) => `${r.kind}:${r.decision}`)).toEqual(["review:rejected"]);
    const parent = await actorOf(IDS.parent, "parent");
    await expect(svc.open(parent, id)).rejects.toMatchObject({ code: "forbidden" });
    // mesmo com o serviço enganado, a função SQL confere o papel: parent como ator -> 42501
    await expect(repo.store.open(id, IDS.parent)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("D-071: publicada pela automática mostra publishedBy auto (linha publication:published), não só o status", async () => {
    const id = await commit({ status: "published" });
    await withSuperuser((c) =>
      c.query("insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, new_version_id) values ('list_submission', $1, 'publication', 's09.1', 'published', 'published', gen_random_uuid())", [id]),
    );
    expect((await getDetail(createReviewRepository(service), id))?.publishedBy).toBe("auto");
    const humano = await commit({ status: "published" });
    expect((await getDetail(createReviewRepository(service), humano))?.publishedBy).toBeNull(); // status published sem linha: origem desconhecida
  });

  it("cópia do pai: abre, salva e a revisão do admin continua vendo a extração", async () => {
    const id = await commit({ source: "parent", schoolId: null });
    const copies = createParentCopyService(service);
    const parent = await actorOf(IDS.parent, "parent");
    const c = (await copies.open(parent, id))!;
    expect(c.version).toBe(1);
    expect(await copies.save(parent, c.copyId, { items: [{ ...c.items[0]!, name: "Caderno do meu jeito", origin: "edited" }], expectedVersion: 1 })).toBe("saved");
    expect(await copies.open(await actorOf(IDS.spare, "parent"), id)).toBeNull();
    const repo = createReviewRepository(service);
    const svc = createReviewService({ store: repo.store, publication: memoryPublication().deps });
    const admin = await actorOf(IDS.admin, "admin");
    await svc.open(admin, id);
    const detail = await getDetail(repo, id);
    expect(detail!.current!.items.map((i) => i.name)).toContain("Caderno 96 folhas");
    expect(JSON.stringify(detail)).not.toContain("meu jeito");
    expect(await dbRows(id)).toEqual([]);
    void FIXTURE;
  });
});
