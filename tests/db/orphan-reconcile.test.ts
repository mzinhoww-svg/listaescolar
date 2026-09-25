// Conciliação de publish_orphaned por clique do admin (S11 · Task 2, D-066).
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attemptH, cleanupUsers, ensureSchool, IDS, seedUsers } from "./helpers";
import { publishOk } from "./integration-fixtures";
import { approve, asService, asSuper, begin, item, open, reviewRows, save, seedSubmission, statusOf, tx } from "./review-fixtures";

const GOOD = { grade: "4º ano", school_year: 2027, items: [item({ name: "Caderno", quantity: 2 })] };

beforeAll(seedUsers);
afterAll(cleanupUsers);

const reconcile = (c: Client, sub: string, actor: string = IDS.admin) =>
  attemptH(c, "select public.publication_reconcile_orphan($1::uuid, $2::uuid) as r", [sub, actor]);

/** Um envio em human_review cuja publicação automática ficou órfã (versão publicada + decisão publish_orphaned). */
async function orphaned(c: Client, o: { withVersion: boolean; kind?: "publication" | "review" }): Promise<{ sub: string; versionId: string }> {
  const school = await ensureSchool(c);
  const sub = await seedSubmission(c, { status: "human_review", source: "school", schoolId: school });
  let versionId: string = randomUUID();
  if (o.withVersion) {
    const { out } = await publishOk(c, { schoolId: school, key: sub, submissionId: sub });
    versionId = out.newVersionId;
  }
  await c.query("reset role");
  if ((o.kind ?? "publication") === "publication") {
    await c.query(
      `insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, new_version_id)
       values ('list_submission', $1, 'publication', 's9.1', 'publish_orphaned', 'published_after_failure', '[]'::jsonb, null, $2)`,
      [sub, versionId],
    );
  } else {
    await c.query(
      `insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, actor_id, new_version_id)
       values ('list_submission', $1, 'review', 's10.1', 'publish_orphaned', 'published_after_failure', '[]'::jsonb, $2, $3)`,
      [sub, IDS.admin, versionId],
    );
  }
  return { sub, versionId };
}
const decisions = async (c: Client, sub: string) =>
  (await c.query("select kind, decision, reasons, new_version_id, actor_id from public.ai_decisions where entity_id = $1 order by created_at, id", [sub])).rows as Record<string, unknown>[];

describe("publication_reconcile_orphan", () => {
  it("órfão com versão existente: review/published + review/reconciled e o envio vira published", async () => {
    await tx(async (c) => {
      const { sub, versionId } = await orphaned(c, { withVersion: true });
      await asService(c);
      expect((await reconcile(c, sub)).rows[0]!.r).toBe("reconciled");
      await asSuper(c);
      expect(await statusOf(c, sub)).toBe("published");
      const rows = (await decisions(c, sub)).filter((d) => d.kind === "review");
      expect(rows.map((d) => d.decision)).toEqual(["published", "reconciled"]);
      expect(rows.every((d) => d.actor_id === IDS.admin && d.new_version_id === versionId)).toBe(true);
    });
  });

  it("órfão de publicação humana (review/publish_orphaned) também concilia", async () => {
    await tx(async (c) => {
      const { sub } = await orphaned(c, { withVersion: true, kind: "review" });
      await asService(c);
      expect((await reconcile(c, sub)).rows[0]!.r).toBe("reconciled");
    });
  });

  it("repetir é no-op: nada novo é gravado e o resultado é not_orphaned", async () => {
    await tx(async (c) => {
      const { sub } = await orphaned(c, { withVersion: true });
      await asService(c);
      await reconcile(c, sub);
      await asSuper(c);
      const before = (await decisions(c, sub)).length;
      await asService(c);
      expect((await reconcile(c, sub)).rows[0]!.r).toBe("not_orphaned");
      await asSuper(c);
      expect((await decisions(c, sub)).length).toBe(before);
    });
  });

  it("sem versão: reconciled/orphan_not_found, envio segue em human_review e a publicação humana é liberada", async () => {
    await tx(async (c) => {
      const { sub } = await orphaned(c, { withVersion: false });
      await asService(c);
      await open(c, sub);
      await save(c, sub, 1, GOOD);
      expect((await approve(c, sub, 2)).rows[0]!.r).toBe("approved");
      expect((await begin(c, sub)).rows[0]!.r).toMatchObject({ state: "orphaned" }); // órfão pendente bloqueia
      expect((await reconcile(c, sub)).rows[0]!.r).toBe("orphan_not_found");
      expect((await begin(c, sub)).rows[0]!.r).toMatchObject({ state: "leased" }); // conciliado: libera
      await asSuper(c);
      const rec = (await reviewRows(c, sub)).find((d) => d.decision === "reconciled")!;
      expect(rec.reasons).toEqual(["orphan_not_found"]);
    });
  });

  it("só admin (42501); sem órfão devolve not_orphaned; envio inexistente P0002", async () => {
    await tx(async (c) => {
      const { sub } = await orphaned(c, { withVersion: true });
      const clean = await seedSubmission(c, { status: "human_review" });
      await asService(c);
      expect((await reconcile(c, sub, IDS.parent)).code).toBe("42501");
      expect((await reconcile(c, clean)).rows[0]!.r).toBe("not_orphaned");
      expect((await reconcile(c, randomUUID())).code).toBe("P0002");
    });
  });

  it("review_begin_publish sem órfão continua como na S10 (leased) e review_complete_publish ignora órfão conciliado", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const sub = await seedSubmission(c, { status: "human_review", schoolId: school });
      await asService(c);
      await open(c, sub);
      await save(c, sub, 1, GOOD);
      await approve(c, sub, 2);
      expect((await begin(c, sub)).rows[0]!.r).toMatchObject({ state: "leased" });
    });
  });
});
