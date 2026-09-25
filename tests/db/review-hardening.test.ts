import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criticalAlertsIn } from "../../features/review/gate";
import { cleanupUsers, IDS, seedUsers } from "./helpers";
import { approve, asService, asSuper, begin, complete, failPublish, item, open, reject, release, reviewRows, rpc, save, seedSubmission, statusOf, tx } from "./review-fixtures";

const GOOD = [item({ name: "Caderno", quantity: 2 }), item({ name: "Lápis", quantity: 12, category: "escrita" })];
const payload = (items: unknown[] = GOOD, over: Record<string, unknown> = {}) => ({ grade: "4º ano", school_year: 2027, items, ...over });
const CLEAN = { items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9, category: "papelaria", alerts: [] }], overallConfidence: 0.9, warnings: [] };
const state = (r: { rows: Record<string, unknown>[] }) => (r.rows[0]!.r as { state: string }).state;

describe("0204: beco sem saída (resultado ausente/inválido)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  const cases: [string, unknown][] = [
    ["resultado ausente", null],
    ["nome com U+2066 (aceito pelo cleanText antigo)", { items: [{ name: "Caderno⁦azul", quantity: 1, unit: null, confidence: 0.5 }], overallConfidence: 0.5, warnings: [] }],
    ["items que não é array", { items: "nenhum", overallConfidence: 0.5, warnings: [] }],
  ];
  for (const [nome, result] of cases) {
    it(`${nome}: abre a versão 1 vazia, não aprova (no_items) e permite recusar`, async () => {
      await tx(async (c) => {
        const id = await seedSubmission(c, { result });
        await asService(c);
        expect((await open(c, id)).error).toBeNull();
        expect((await approve(c, id, 1, [])).code).toBe("22023");
        expect((await reject(c, id, 1)).rows[0]!.r).toBe("rejected");
        expect(await statusOf(c, id)).toBe("rejected");
      });
    });
  }

  it("o admin digita os itens a partir da versão vazia e aprova", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { result: null });
      await asService(c);
      await open(c, id);
      expect((await save(c, id, 1, payload())).rows[0]!.r).toMatchObject({ state: "saved", version: 2 });
      expect((await approve(c, id, 2, [])).rows[0]!.r).toBe("approved");
    });
  });
});

describe("0204: payload e nomes", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("grade e school_year ausentes -> 22023 (null tem de ser explícito)", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      await asService(c);
      await open(c, id);
      expect((await save(c, id, 1, { school_year: 2027, items: GOOD })).code).toBe("22023");
      expect((await save(c, id, 1, { grade: "4º ano", items: GOOD })).code).toBe("22023");
      expect((await save(c, id, 1, payload(GOOD, { grade: null, school_year: null }))).rows[0]!.r).toMatchObject({ state: "saved" });
    });
  });

  it("nome com espaços nas pontas ou acima de 300 depois do trim -> 22023 (o valor guardado é o validado)", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c);
      await asService(c);
      await open(c, id);
      expect((await save(c, id, 1, payload([item({ name: ` ${"a".repeat(300)}` })]))).code).toBe("22023");
      expect((await save(c, id, 1, payload([item({ name: "a".repeat(301) })]))).code).toBe("22023");
      expect((await save(c, id, 1, payload([item({ name: "a".repeat(300) })]))).rows[0]!.r).toMatchObject({ state: "saved" });
    });
  });
});

describe("0204: confirmação do alerta crítico no SQL (paridade com criticalAlertsIn)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  const CONFIG = ["handwritten", "invalid_school_grade_year", "text_document_mismatch"];
  const r = (over: Record<string, unknown>, itemAlerts: string[] = []) => ({ items: [{ name: "Caderno", quantity: 2, unit: "un", confidence: 0.9, category: "papelaria", alerts: itemAlerts }], overallConfidence: 0.9, warnings: [], ...over });
  const table: [string, Record<string, unknown> | null, string[]][] = [
    ["sem alertas", r({}), CONFIG],
    ["alerta do documento na configuração", r({ alerts: ["handwritten"] }), CONFIG],
    ["alerta do documento fora da configuração", r({ alerts: ["low_confidence_item"] }), CONFIG],
    ["alerta de item na configuração", r({}, ["text_document_mismatch"]), CONFIG],
    ["alerta de item fora da configuração", r({}, ["ambiguous_item"]), CONFIG],
    ["criticalAlerts marcado pela extração", r({ criticalAlerts: ["handwritten"] }), []],
    ["criticalAlerts vazio", r({ criticalAlerts: [] }), CONFIG],
    ["configuração vazia com alerta", r({ alerts: ["handwritten"] }), []],
    ["resultado ausente", null, CONFIG],
  ];
  for (const [nome, result, config] of table) {
    it(`${nome}: SQL = TS`, async () => {
      await tx(async (c) => {
        const ts = criticalAlertsIn(result === null ? null : { alerts: (result.alerts as string[] | undefined) ?? [], criticalAlerts: (result.criticalAlerts as string[] | undefined) ?? [], items: (result.items as { alerts: string[] }[]) }, config).length > 0;
        const sql = (await c.query("select public.review_has_critical_alert($1::jsonb, $2::text[]) as v", [result === null ? null : JSON.stringify(result), config])).rows[0].v;
        expect(sql).toBe(ts);
      });
    });
  }

  it("aprovar exige a confirmação com alerta crítico e a recusa sem ele (a trilha não mente)", async () => {
    await tx(async (c) => {
      const crit = await seedSubmission(c, { result: r({ alerts: ["handwritten"] }) });
      const limpo = await seedSubmission(c, { result: CLEAN });
      await asService(c);
      for (const id of [crit, limpo]) {
        await open(c, id);
        await save(c, id, 1, payload());
      }
      expect((await approve(c, crit, 2, [])).code).toBe("22023");
      expect(await statusOf(c, crit)).toBe("human_review");
      expect((await approve(c, limpo, 2, ["critical_alerts_acknowledged"])).code).toBe("22023");
      expect(await statusOf(c, limpo)).toBe("human_review");
      expect((await approve(c, crit, 2, ["critical_alerts_acknowledged"])).rows[0]!.r).toBe("approved");
      expect((await approve(c, limpo, 2, [])).rows[0]!.r).toBe("approved");
      expect((await reviewRows(c, crit)).at(-1)).toMatchObject({ decision: "approved", reasons: ["critical_alerts_acknowledged"] });
      expect((await reviewRows(c, limpo)).at(-1)).toMatchObject({ decision: "approved", reasons: [] });
    });
  });

  it("usa o resultado MAIS RECENTE e a configuração padrão do banco", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { result: CLEAN });
      const job = (await c.query("select job_id from public.ocr_jobs where submission_id = $1", [id])).rows[0].job_id;
      const j2 = (await c.query("insert into public.jobs (kind, payload, idempotency_key, submission_id) values ('ocr_jobs', '{}'::jsonb, $1, $2) returning id", [`k2-${id}`, id])).rows[0].id;
      expect(job).not.toBe(j2);
      await c.query("insert into public.ocr_jobs (job_id, submission_id, result, created_at) values ($1, $2, $3::jsonb, now() + interval '1 minute')", [j2, id, JSON.stringify(r({ alerts: ["handwritten"] }))]);
      await asService(c);
      await open(c, id);
      await save(c, id, 1, payload());
      expect((await approve(c, id, 2, [])).code).toBe("22023");
      expect((await approve(c, id, 2, ["critical_alerts_acknowledged"])).rows[0]!.r).toBe("approved");
    });
  });
});

describe("0204: publicação sem trilha (lease, falha e resultado tardio)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  async function approved(c: Parameters<typeof asService>[0]): Promise<string> {
    const id = await seedSubmission(c);
    await asService(c);
    await open(c, id);
    await save(c, id, 1, payload());
    await approve(c, id, 2);
    return id;
  }
  const res = () => ({ newVersionId: randomUUID(), previousVersionId: randomUUID(), listId: randomUUID() });

  it("A com lease ativa (chamada em voo) e B tenta falhar: busy, nada gravado, e o resultado de A fecha o envio", async () => {
    await tx(async (c) => {
      const id = await approved(c);
      expect(state(await begin(c, id))).toBe("leased");
      const before = (await reviewRows(c, id)).length;
      expect((await failPublish(c, id, "list_archived")).rows[0]!.r).toBe("busy");
      expect((await reviewRows(c, id)).length).toBe(before);
      expect(await statusOf(c, id)).toBe("approved");
      expect((await complete(c, id, res())).rows[0]!.r).toBe("completed");
      expect(await statusOf(c, id)).toBe("published");
    });
  });

  it("lease vencida: a falha entra; o resultado tardio da porta grava review/publish_orphaned com as versões e devolve orphaned", async () => {
    await tx(async (c) => {
      const id = await approved(c);
      await begin(c, id);
      await release(c, id); // lease solta/vencida
      expect((await failPublish(c, id, "publish_timeout")).rows[0]!.r).toBe("failed");
      const late = res();
      expect((await complete(c, id, late)).rows[0]!.r).toBe("orphaned");
      expect(await statusOf(c, id)).toBe("human_review");
      const last = (await reviewRows(c, id)).at(-1)!;
      expect(last).toMatchObject({ decision: "publish_orphaned", actor_id: IDS.admin, previous_version_id: late.previousVersionId, new_version_id: late.newVersionId, justification: "published_after_failure" });
      // idempotente: segundo resultado não duplica a linha; nova aprovação continua bloqueada na publicação
      expect((await complete(c, id, late)).rows[0]!.r).toBe("orphaned");
      expect((await reviewRows(c, id)).filter((x) => x.decision === "publish_orphaned")).toHaveLength(1);
      expect((await approve(c, id, 2)).rows[0]!.r).toBe("approved");
      expect(state(await begin(c, id))).toBe("orphaned");
    });
  });

  it("resultado tardio depois de a equipe recusar o envio também vira publish_orphaned; sem histórico de aprovação segue not_approved", async () => {
    await tx(async (c) => {
      const id = await approved(c);
      await begin(c, id);
      await release(c, id);
      await failPublish(c, id, "publish_timeout");
      expect((await reject(c, id, 2)).rows[0]!.r).toBe("rejected");
      expect((await complete(c, id, res())).rows[0]!.r).toBe("orphaned");
      const cru = await seedSubmission(c);
      expect((await complete(c, cru, res())).rows[0]!.r).toBe("not_approved");
    });
  });

  it("S09: auto_publish -> publish_failed (expirador) -> aprovação humana; varredor e expirador não voltam a tocar o envio", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { status: "approved" });
      await c.query("insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification) values ('list_submission', $1, 'publication', 's09.1', 'auto_publish', 'rules_passed')", [id]);
      await asService(c);
      expect((await rpc(c, "publication_expire", "$1::uuid, 0", [id])).rows[0]!.r).toBe("failed");
      expect(await statusOf(c, id)).toBe("human_review");
      await open(c, id);
      await save(c, id, 1, payload());
      expect((await approve(c, id, 2)).rows[0]!.r).toBe("approved");
      expect(state(await begin(c, id))).toBe("leased");
      await asSuper(c);
      await c.query("update public.list_submissions set updated_at = now() - interval '3 hours' where id = $1", [id]);
      await c.query("delete from public.publication_leases where submission_id = $1", [id]);
      expect((await c.query("select * from public.publication_pending(50, 0)")).rows.find((x) => x.submission_id === id)).toBeUndefined();
      await asService(c);
      expect((await rpc(c, "publication_expire", "$1::uuid, 0", [id])).rows[0]!.r).toBe("already_failed");
      expect(await statusOf(c, id)).toBe("approved");
      expect(state(await begin(c, id))).toBe("leased");
    });
  });

  it("comentário da coluna new_version_id descreve o significado por decisão", async () => {
    await tx(async (c) => {
      const t = (await c.query("select col_description('public.ai_decisions'::regclass, (select attnum from pg_attribute where attrelid = 'public.ai_decisions'::regclass and attname = 'new_version_id')) as d")).rows[0].d as string;
      expect(t).toMatch(/review_versions/);
      expect(t).toMatch(/LISTA/);
    });
  });
});
