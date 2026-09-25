import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPublishedList, listVersionHistory } from "@/features/lists/queries";
import { ListRepositoryError, createListsRepository, type ListsRepository } from "@/features/lists/repository";
import {
  InvalidListTransitionError,
  LIST_STATES,
  PUBLISH_ONLY_TARGET,
  canTransition,
} from "@/features/lists/state";

import { IDS, withSuperuser } from "../db/helpers";
import { cleanupCommitted, seedSchool } from "../db/list-fixtures";

// Roda em `pnpm test:db` contra o Supabase local da trilha; chaves lidas em tempo de execução.
function localEnv(): { url: string; publishable: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("repository.test só roda contra Supabase local");
  return { url, publishable: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), secret: get("SUPABASE_SECRET_KEY") };
}

const INEP_A = "51999951";
const INEP_B = "51999952";
const YEAR = 2027;
const ACTOR = IDS.admin;
const OPTS = { auth: { persistSession: false, autoRefreshToken: false } };

let service: SupabaseClient;
let pub: SupabaseClient;
let repo: ListsRepository;
let schoolA: string;
let schoolB: string;
const grades = new Map<string, string>();

const item = (n: string, extra: Record<string, unknown> = {}) => ({
  originalName: n,
  quantity: 2,
  unit: "un",
  confidence: 0.6,
  alerts: ["low_confidence_item" as const],
  ...extra,
});

async function toApproved(listId: string): Promise<void> {
  for (const to of ["submitted", "processing"] as const) await repo.transition({ listId, to, actorId: ACTOR });
  await repo.transition({ listId, to: "approved", actorId: ACTOR });
}

async function publishedList(schoolId: string, slug: string, names: string[]) {
  const listId = await repo.createDraftList({ schoolId, gradeId: grades.get(slug)!, schoolYear: YEAR, isDemo: true });
  const v = await repo.createCandidateVersion({ listId, source: "admin" });
  await repo.addItems(v.versionId, names.map((n) => item(n)));
  await toApproved(listId);
  await repo.approveVersion({ listId, versionId: v.versionId, actorId: ACTOR });
  await repo.publishVersion({ listId, versionId: v.versionId, actorId: ACTOR });
  return { listId, versionId: v.versionId };
}

beforeAll(async () => {
  const env = localEnv();
  service = createClient(env.url, env.secret, OPTS);
  pub = createClient(env.url, env.publishable, OPTS);
  repo = createListsRepository(service);
  await cleanupCommitted([INEP_A, INEP_B]);
  await withSuperuser(async (c) => {
    schoolA = await seedSchool(c, INEP_A);
    schoolB = await seedSchool(c, INEP_B);
    const r = await c.query<{ id: string; slug: string }>("select id, slug from public.grades");
    for (const g of r.rows) grades.set(g.slug, g.id);
  });
});

afterAll(async () => {
  await cleanupCommitted([INEP_A, INEP_B]);
});

describe("matriz TS x banco real (list_transition_allowed)", () => {
  const pairs = LIST_STATES.flatMap((f) => LIST_STATES.map((t) => [f, t] as const));
  it.each(pairs)("%s -> %s", async (from, to) => {
    const { data, error } = await service.rpc("list_transition_allowed", { p_from: from, p_to: to });
    expect(error).toBeNull();
    expect(data).toBe(canTransition(from, to));
  });

  it("approved -> published é válido na matriz e exige a função de publicação", () => {
    expect(canTransition("approved", "published")).toBe(true);
    expect(PUBLISH_ONLY_TARGET).toBe("published");
  });
});

describe("fluxo real de lista", () => {
  it("draft -> ... -> published, nova versão, arquivamento", async () => {
    const listId = await repo.createDraftList({ schoolId: schoolA, gradeId: grades.get("ef-1")!, schoolYear: YEAR, isDemo: true });
    const v1 = await repo.createCandidateVersion({ listId, source: "admin" });
    expect(v1.versionNumber).toBe(1);
    expect(await repo.addItems(v1.versionId, [item("Caderno"), item("Lápis nº 2")])).toBe(2);
    expect(await repo.addItems(v1.versionId, [item("Borracha")])).toBe(1);

    // Rascunho e aprovada ainda não são públicas.
    expect(await getPublishedList(INEP_A, "ef-1", YEAR, { client: pub })).toBeNull();
    await toApproved(listId);
    expect(await getPublishedList(INEP_A, "ef-1", YEAR, { client: pub })).toBeNull();
    expect(await listVersionHistory(INEP_A, "ef-1", YEAR, { client: pub })).toEqual([]);

    // A aprovação da lista não basta: a versão precisa ser aprovada antes de publicar.
    await expect(repo.publishVersion({ listId, versionId: v1.versionId, actorId: ACTOR })).rejects.toMatchObject({ code: "invalid_transition" });
    await repo.approveVersion({ listId, versionId: v1.versionId, actorId: ACTOR });
    expect(await repo.publishVersion({ listId, versionId: v1.versionId, actorId: ACTOR })).toBe(1);
    const pubList = await getPublishedList(INEP_A, "ef-1", YEAR, { client: pub });
    expect(pubList?.version.versionNumber).toBe(1);
    expect(pubList?.version.items.map((i) => [i.position, i.name, i.normalizedName, i.quantity])).toEqual([
      [1, "Caderno", "caderno", 2],
      [2, "Lápis nº 2", "lapis n 2", 2],
      [3, "Borracha", "borracha", 2],
    ]);
    expect(pubList?.isDemo).toBe(true);
    expect(JSON.stringify(pubList)).not.toMatch(/alerts|confidence|source|submission|created_by/);

    // Nova versão de lista publicada: a antiga segue pública até publicar a nova.
    const v2 = await repo.createCandidateVersion({ listId, source: "school_upload" });
    expect(v2.versionNumber).toBe(2);
    await repo.addItems(v2.versionId, [item("Caderno brochura"), item("Cola")]);
    expect((await getPublishedList(INEP_A, "ef-1", YEAR, { client: pub }))?.version.versionNumber).toBe(1);
    expect((await listVersionHistory(INEP_A, "ef-1", YEAR, { client: pub })).map((h) => h.versionNumber)).toEqual([1]);

    await repo.approveVersion({ listId, versionId: v2.versionId, actorId: ACTOR });
    expect(await repo.publishVersion({ listId, versionId: v2.versionId, actorId: ACTOR })).toBe(2);
    const cur = await getPublishedList(INEP_A, "ef-1", YEAR, { client: pub });
    expect(cur?.version.versionNumber).toBe(2);
    expect(cur?.version.items.map((i) => i.name)).toEqual(["Caderno brochura", "Cola"]);
    const hist = await listVersionHistory(INEP_A, "ef-1", YEAR, { client: pub });
    expect(hist.map((h) => [h.versionNumber, h.status])).toEqual([[2, "published"], [1, "superseded"]]);

    // Uma terceira candidata nunca aparece no histórico público.
    await repo.createCandidateVersion({ listId, source: "admin" });
    expect((await listVersionHistory(INEP_A, "ef-1", YEAR, { client: pub })).map((h) => h.versionNumber)).toEqual([2, 1]);

    await repo.archive({ listId, actorId: ACTOR, reason: "teste" });
    expect(await getPublishedList(INEP_A, "ef-1", YEAR, { client: pub })).toBeNull();
    expect(await listVersionHistory(INEP_A, "ef-1", YEAR, { client: pub })).toEqual([]);
    await expect(repo.createCandidateVersion({ listId, source: "admin" })).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("lista de outra escola/série/ano não se mistura", async () => {
    await publishedList(schoolB, "ef-2", ["Item da escola B"]);
    await publishedList(schoolA, "ef-2", ["Item da escola A"]);
    const a = await getPublishedList(INEP_A, "ef-2", YEAR, { client: pub });
    const b = await getPublishedList(INEP_B, "ef-2", YEAR, { client: pub });
    expect(a?.version.items.map((i) => i.name)).toEqual(["Item da escola A"]);
    expect(b?.version.items.map((i) => i.name)).toEqual(["Item da escola B"]);
    expect(await getPublishedList(INEP_A, "ef-3", YEAR, { client: pub })).toBeNull();
    expect(await getPublishedList(INEP_A, "ef-2", YEAR + 1, { client: pub })).toBeNull();
    expect(await getPublishedList("51999999", "ef-2", YEAR, { client: pub })).toBeNull();
    expect(await getPublishedList(INEP_A, "serie-inexistente", YEAR, { client: pub })).toBeNull();
    expect(await listVersionHistory(INEP_A, "ef-3", YEAR, { client: pub })).toEqual([]);
  });

  it("colunas internas continuam ilegíveis ao público", async () => {
    await publishedList(schoolA, "ef-4", ["Caderno"]);
    const r = await pub.from("list_items").select("alerts");
    expect(r.error?.code).toBe("42501");
    const all = await pub.from("list_items").select("*");
    expect(all.error?.code).toBe("42501");
    expect((await pub.from("list_versions").select("source")).error?.code).toBe("42501");
  });
});

describe("guardas do repositório de escrita", () => {
  it("transition recusa par inválido com InvalidListTransitionError, antes do banco", async () => {
    const listId = await repo.createDraftList({ schoolId: schoolA, gradeId: grades.get("ef-5")!, schoolYear: YEAR, isDemo: true });
    await expect(repo.transition({ listId, to: "approved", actorId: ACTOR })).rejects.toBeInstanceOf(InvalidListTransitionError);
    await expect(repo.transition({ listId, to: "archived", actorId: ACTOR })).rejects.toBeInstanceOf(InvalidListTransitionError);
  });

  it("transition não publica (só publishVersion) e exige actorId válido", async () => {
    const listId = await repo.createDraftList({ schoolId: schoolA, gradeId: grades.get("ef-6")!, schoolYear: YEAR, isDemo: true });
    await toApproved(listId);
    await expect(repo.transition({ listId, to: "published", actorId: ACTOR })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(repo.transition({ listId, to: "archived", actorId: "" })).rejects.toThrow();
  });

  it("publishVersion recusa versão de outra lista e lista não aprovada", async () => {
    const l1 = await repo.createDraftList({ schoolId: schoolA, gradeId: grades.get("ef-7")!, schoolYear: YEAR, isDemo: true });
    const l2 = await repo.createDraftList({ schoolId: schoolA, gradeId: grades.get("ef-8")!, schoolYear: YEAR, isDemo: true });
    const v1 = await repo.createCandidateVersion({ listId: l1, source: "admin" });
    const v2 = await repo.createCandidateVersion({ listId: l2, source: "admin" });
    await expect(repo.publishVersion({ listId: l1, versionId: v1.versionId, actorId: ACTOR })).rejects.toMatchObject({ code: "invalid_transition" });
    await toApproved(l1);
    await expect(repo.publishVersion({ listId: l1, versionId: v2.versionId, actorId: ACTOR })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(repo.approveVersion({ listId: l1, versionId: v2.versionId, actorId: ACTOR })).rejects.toMatchObject({ code: "invalid_argument" });
    await repo.addItems(v1.versionId, [item("Caderno")]);
    // aprovada mas vazia não publica; sem aprovação, com itens, também não
    await expect(repo.publishVersion({ listId: l1, versionId: v1.versionId, actorId: ACTOR })).rejects.toMatchObject({ code: "invalid_transition" });
    await repo.approveVersion({ listId: l1, versionId: v1.versionId, actorId: ACTOR });
    await expect(repo.approveVersion({ listId: l1, versionId: v1.versionId, actorId: ACTOR })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(repo.publishVersion({ listId: l1, versionId: v1.versionId, actorId: ACTOR })).resolves.toBe(1);
  });

  it("createDraftList repetida dá already_exists; item inválido nunca chega ao banco", async () => {
    const gradeId = grades.get("ef-9")!;
    await repo.createDraftList({ schoolId: schoolA, gradeId, schoolYear: YEAR, isDemo: true });
    await expect(repo.createDraftList({ schoolId: schoolA, gradeId, schoolYear: YEAR, isDemo: true })).rejects.toMatchObject({
      code: "already_exists",
    });
    const l = await repo.createDraftList({ schoolId: schoolA, gradeId: grades.get("em-1")!, schoolYear: YEAR, isDemo: true });
    const v = await repo.createCandidateVersion({ listId: l, source: "admin" });
    await expect(repo.addItems(v.versionId, [{ originalName: "Caderno", quantity: "12,5x" }])).rejects.toThrow();
    await expect(repo.addItems(v.versionId, [])).rejects.toThrow();
    await expect(repo.addItems(v.versionId, [{ originalName: "Caderno", confidence: 1.5 }])).rejects.toThrow();
  });

  it("addItems só em versão candidate (publicada recusa)", async () => {
    const { versionId } = await publishedList(schoolA, "em-2", ["Caderno"]);
    await expect(repo.addItems(versionId, [item("Extra")])).rejects.toBeInstanceOf(ListRepositoryError);
  });
});
