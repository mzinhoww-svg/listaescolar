// ListPublisher REAL (list_publish_from_pipeline sobre school_lists/list_versions/list_items): a suíte de contrato da S09/S10
// roda contra ele por HTTP (supabase-js com a chave de serviço), mais o que só o banco real prova (S11 · Task 2).
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRpcPublicationPorts } from "../../supabase/functions/_shared/publication/rpc-ports";
import { type ListPublisher, type PublishRequest } from "../../supabase/functions/_shared/publication/ports";
import { localApi } from "../helpers/local-api";
import { runListPublisherContract, request } from "../publication/list-publisher.contract";
import { cleanupUsers, ensureSchool, IDS, seedUsers, withSuperuser } from "./helpers";
import { ensurePublishableSubmission, purgeSchools, SYSTEM_ID, uuidFrom } from "./integration-fixtures";

const { url, key } = localApi();
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const created: string[] = [];

const purge = () => purgeSchools(created);

beforeAll(seedUsers);
afterAll(async () => {
  await purge();
  await cleanupUsers();
});

type Harness = { publisher: ListPublisher; schoolId: string; failNext: () => void; raw: ListPublisher; direct: ListPublisher };

/** Uma escola e um espaço de chaves por teste (o banco é compartilhado): o contrato usa ids fixos, o harness os isola. */
async function harness(): Promise<Harness> {
  const schoolId = randomUUID();
  await withSuperuser((c) => ensureSchool(c, schoolId));
  created.push(schoolId);
  const ns = randomUUID();
  let failNext = false;
  const rpc = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new TypeError("fetch failed"));
      }
      return sb.rpc(fn, args);
    },
  };
  const { publisher: real } = createRpcPublicationPorts(rpc as never, { now: () => new Date("2026-09-25T12:00:00Z") });
  // ator system só publica de um envio da escola (mesma escola, série, ano; remetente vinculado): semeia um por (escola, série, ano, id original)
  const seeded = new Map<string, Promise<void>>();
  const raw: ListPublisher = {
    async publish(r) {
      if (r.actor.kind !== "system") return real.publish(r);
      const id = uuidFrom(`${r.schoolId}|${r.gradeSlug}|${r.schoolYear}|${r.submissionId}`);
      const key = `${r.schoolId}|${id}`;
      if (!seeded.has(key)) seeded.set(key, withSuperuser((c) => ensurePublishableSubmission(c, { id, schoolId: r.schoolId, gradeSlug: r.gradeSlug, schoolYear: r.schoolYear })).then(() => undefined, () => undefined));
      await seeded.get(key); // escola inexistente etc.: a função recusa com o código certo
      return real.publish({ ...r, submissionId: id });
    },
  };
  const rewrite = (r: PublishRequest): PublishRequest => ({ ...r, schoolId: r.schoolId === request().schoolId ? schoolId : r.schoolId, idempotencyKey: `${ns}:${r.idempotencyKey}` });
  return { raw, direct: real, schoolId, failNext: () => void (failNext = true), publisher: { publish: (r) => raw.publish(rewrite(r)) } };
}

runListPublisherContract("real (list_publish_from_pipeline)", async () => {
  const h = await harness();
  return {
    publisher: h.publisher,
    failNextTransiently: h.failNext,
    archiveList: async (t) => {
      await withSuperuser(async (c) => {
        const l = (await c.query("select l.id from public.school_lists l join public.grades g on g.id = l.grade_id where l.school_id = $1 and g.slug = $2 and l.school_year = $3", [h.schoolId, t.gradeSlug, t.schoolYear])).rows[0];
        await c.query("select public.list_archive($1, $2, 'teste')", [l.id, SYSTEM_ID]);
      });
    },
  };
});

const real = (h: Harness): ListPublisher => h.direct;
const rows = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T[]> => withSuperuser(async (c) => (await c.query(sql, p)).rows as T[]);
const codeOf = async (p: Promise<unknown>): Promise<{ code: string; transient: boolean }> => {
  try {
    await p;
  } catch (e) {
    return e as { code: string; transient: boolean };
  }
  throw new Error("deveria recusar");
};

describe("ListPublisher real: efeitos no banco", () => {
  it("lista nova: candidate -> aprovação -> publicação com o ator system; trilha de estados e itens com confiança nula e origin preservados", async () => {
    const h = await harness();
    const items = [
      { position: 1, originalName: "Caderno", normalizedName: "caderno", category: "papelaria", quantity: 2, unit: "un", confidence: 0.9 },
      { position: 2, originalName: "Cola", normalizedName: "cola", category: "papelaria", quantity: 1, unit: null, confidence: null, origin: "reviewed" as const },
    ];
    const r = await h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: `k-${randomUUID()}`, items }));
    const v = (await rows("select status::text as s, approved_by, created_by, publication_key, publication_hash, item_count, source::text as src from public.list_versions where id = $1", [r.newVersionId]))[0]!;
    expect(v).toMatchObject({ s: "published", approved_by: SYSTEM_ID, created_by: SYSTEM_ID, item_count: 2, src: "school_upload" });
    expect(v.publication_hash).toMatch(/^[0-9a-f]{64}$/);
    const its = await rows("select position, confidence::float as c, origin from public.list_items where version_id = $1 order by position", [r.newVersionId]);
    expect(its).toEqual([{ position: 1, c: 0.9, origin: "extracted" }, { position: 2, c: null, origin: "reviewed" }]);
    const ev = await rows("select from_status::text as f, to_status::text as t, actor_id from public.list_status_events where list_id = $1 order by created_at", [r.listId]);
    expect(ev.map((e) => e.t)).toEqual(["submitted", "processing", "approved", "published"]);
    expect(ev.every((e) => e.actor_id === SYSTEM_ID || e.t === "submitted" || e.t === "processing")).toBe(true);
    expect((await rows("select status::text as s, current_version_id from public.school_lists where id = $1", [r.listId]))[0]).toMatchObject({ s: "published", current_version_id: r.newVersionId });
  });

  it("troca de versão: a anterior vira superseded; ator admin fica em approved_by", async () => {
    const h = await harness();
    const a = await h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: `k-${randomUUID()}` }));
    const b = await h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: `k-${randomUUID()}`, actor: { kind: "admin", profileId: IDS.admin } }));
    expect(b.previousVersionId).toBe(a.newVersionId);
    const st = await rows("select id, status::text as s, approved_by, version_number from public.list_versions where list_id = $1 order by version_number", [a.listId]);
    expect(st.map((x) => x.s)).toEqual(["superseded", "published"]);
    expect(st[1]!.approved_by).toBe(IDS.admin);
  });

  it("ator admin falso (perfil que não é admin ou inexistente) é recusado como permanente e nada é gravado", async () => {
    const h = await harness();
    for (const profileId of [IDS.parent, randomUUID()]) {
      const e = await codeOf(h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: `k-${randomUUID()}`, actor: { kind: "admin", profileId } })));
      expect(e).toMatchObject({ code: "invalid_actor", transient: false });
    }
    expect(await rows("select 1 from public.school_lists where school_id = $1", [h.schoolId])).toHaveLength(0);
  });

  it("escola inexistente, suspensa e série desconhecida são recusas permanentes com código estável", async () => {
    const h = await harness();
    const k = () => `k-${randomUUID()}`;
    expect(await codeOf(h.raw.publish(request({ schoolId: randomUUID(), idempotencyKey: k() })))).toMatchObject({ code: "school_not_found", transient: false });
    expect(await codeOf(h.raw.publish(request({ schoolId: h.schoolId, gradeSlug: "nao-existe", idempotencyKey: k() })))).toMatchObject({ code: "grade_unknown", transient: false });
    await withSuperuser((c) => c.query("update public.schools set verification_status = 'suspended' where id = $1", [h.schoolId]));
    expect(await codeOf(h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: k() })))).toMatchObject({ code: "school_suspended", transient: false });
  });

  it("D-068: lista-alvo em estado que a matriz proíbe -> list_state_conflict (permanente); approved e draft publicam", async () => {
    const h = await harness();
    const listOf = async (slug: string, status: string): Promise<void> => {
      await withSuperuser((c) => c.query("insert into public.school_lists (school_id, grade_id, school_year, status) select $1, g.id, 2027, $3::public.list_status from public.grades g where g.slug = $2", [h.schoolId, slug, status]));
    };
    for (const [slug, status] of [["ef-1", "human_review"], ["ef-2", "processing"], ["ef-3", "rejected"]] as const) {
      await listOf(slug, status);
      const e = await codeOf(h.raw.publish(request({ schoolId: h.schoolId, gradeSlug: slug, idempotencyKey: `k-${randomUUID()}` })));
      expect(e).toMatchObject({ code: "list_state_conflict", transient: false });
    }
    await listOf("ef-5", "approved");
    await listOf("ef-6", "draft");
    for (const slug of ["ef-5", "ef-6"]) {
      const r = await h.raw.publish(request({ schoolId: h.schoolId, gradeSlug: slug, idempotencyKey: `k-${randomUUID()}` }));
      expect(r.newVersionId).toBeTruthy();
    }
  });

  it("mesma chave com outro payload: idempotency_conflict, e nada novo é gravado", async () => {
    const h = await harness();
    const k = `k-${randomUUID()}`;
    await h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: k }));
    expect(await codeOf(h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: k, schoolYear: 2028 })))).toMatchObject({ code: "idempotency_conflict", transient: false });
    expect(await rows("select 1 from public.list_versions v join public.school_lists l on l.id = v.list_id where l.school_id = $1", [h.schoolId])).toHaveLength(1);
  });

  it("concorrência: duas chamadas com a MESMA chave (conexões distintas) -> uma versão e resultados iguais", async () => {
    const h = await harness();
    const k = `k-${randomUUID()}`;
    const r = request({ schoolId: h.schoolId, idempotencyKey: k });
    const [a, b] = await Promise.all([h.raw.publish(r), h.raw.publish(r)]);
    expect(b).toEqual(a);
    expect(await rows("select 1 from public.list_versions v join public.school_lists l on l.id = v.list_id where l.school_id = $1", [h.schoolId])).toHaveLength(1);
  });

  it("concorrência: chaves diferentes para a mesma lista -> versões em série, sem 23505, cadeia de anteriores consistente (D-022)", async () => {
    const h = await harness();
    const n = 5;
    const out = await Promise.all(Array.from({ length: n }, (_, i) => h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: `k-${randomUUID()}`, items: [{ position: 1, originalName: `Item ${i}`, normalizedName: `item ${i}`, category: "papelaria", quantity: 1, unit: null, confidence: 0.9 }] }))));
    const vs = await rows<{ id: string; s: string; n: number }>("select v.id, v.status::text as s, v.version_number as n from public.list_versions v join public.school_lists l on l.id = v.list_id where l.school_id = $1 order by v.version_number", [h.schoolId]);
    expect(vs).toHaveLength(n);
    expect(vs.map((v) => v.s)).toEqual([...Array(n - 1).fill("superseded"), "published"]);
    const prevs = new Set(out.map((o) => o.previousVersionId));
    expect(prevs.size).toBe(n); // cada publicação teve uma anterior distinta (a primeira, nula)
    expect(out.filter((o) => o.previousVersionId === null)).toHaveLength(1);
  });

  it("a porta recusa chaves fora da lista e itens inválidos com erro permanente (não trata como transitório)", async () => {
    const h = await harness();
    const bad = await codeOf(h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: `k-${randomUUID()}`, items: [{ position: 1, originalName: "X", normalizedName: "x", category: "c", quantity: -1, unit: null, confidence: 0.5 }] })));
    expect(bad).toMatchObject({ code: "invalid_items", transient: false });
    const rawReq = { key: "k", submissionId: randomUUID(), schoolId: h.schoolId, gradeSlug: "ef-4", schoolYear: 2027, source: "school_upload", actor: "system", items: [{ position: 1, originalName: "X", normalizedName: "x", category: "c", quantity: 1, unit: null, confidence: 0.5 }] };
    expect((await sb.rpc("list_publish_from_pipeline", { p_request: { ...rawReq, extra: 1 } })).error?.hint).toBe("invalid_request");
    expect((await sb.rpc("list_publish_from_pipeline", { p_request: { ...rawReq, actorId: IDS.admin } })).error?.hint).toBe("invalid_request");
  });

  it("ator system só publica envio da escola: lista de pai, envio de outra escola/série/ano e remetente sem vínculo são recusas fechadas", async () => {
    const h = await harness();
    const k = () => `k-${randomUUID()}`;
    const other = randomUUID();
    await withSuperuser((c) => ensureSchool(c, other));
    created.push(other);
    const sub = (over: Partial<Parameters<typeof ensurePublishableSubmission>[1]> = {}) => {
      const id = randomUUID();
      return withSuperuser((c) => ensurePublishableSubmission(c, { id, schoolId: h.schoolId, gradeSlug: "ef-4", schoolYear: 2027, ...over })).then(() => id);
    };
    const pub = (over: Partial<PublishRequest>) => codeOf(real(h).publish(request({ schoolId: h.schoolId, idempotencyKey: k(), ...over })));
    // 1. lista de pai pedida pelo system
    expect(await pub({ source: "parent_upload", submissionId: await sub() })).toMatchObject({ code: "invalid_source", transient: false });
    // 2. envio inexistente, de família, de outra escola, de outra série e de outro ano
    expect(await pub({ submissionId: randomUUID() })).toMatchObject({ code: "submission_mismatch", transient: false });
    const parentSub = randomUUID();
    await withSuperuser(async (c) => {
      await ensurePublishableSubmission(c, { id: parentSub, schoolId: h.schoolId, gradeSlug: "ef-4", schoolYear: 2027 });
      await c.query("alter table public.list_submissions disable trigger list_submissions_guard_update");
      await c.query("update public.list_submissions set source = 'parent' where id = $1", [parentSub]);
      await c.query("alter table public.list_submissions enable trigger list_submissions_guard_update");
    });
    expect(await pub({ submissionId: parentSub })).toMatchObject({ code: "submission_mismatch" });
    expect(await pub({ submissionId: await sub({ schoolId: other }) })).toMatchObject({ code: "submission_mismatch" });
    expect(await pub({ submissionId: await sub({ gradeSlug: "ef-5" }) })).toMatchObject({ code: "submission_mismatch" });
    expect(await pub({ submissionId: await sub({ schoolYear: 2028 }) })).toMatchObject({ code: "submission_mismatch" });
    // 3. remetente sem vínculo com a escola
    const unlinked = await sub();
    await withSuperuser((c) => c.query("delete from public.school_members where school_id = $1", [h.schoolId]));
    expect(await pub({ submissionId: unlinked })).toMatchObject({ code: "sender_not_linked", transient: false });
    // o ator admin (publicação humana da S10) não depende do envio nem do vínculo
    const human = await h.raw.publish(request({ schoolId: h.schoolId, idempotencyKey: k(), actor: { kind: "admin", profileId: IDS.admin }, source: "parent_upload", submissionId: randomUUID() }));
    expect(human.newVersionId).toBeTruthy();
  });
});
