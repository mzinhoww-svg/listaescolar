// Um teste por evento do catálogo: o FATO real dispara o gatilho e gera exatamente as notificações esperadas (S11 · Task 3).
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addEvidence, backdateTokens, createClaim, decide, docsAwaiting, issueToken, seedClaimSchool, sha } from "./claim-fixtures";
import { cleanupUsers, ensureSchool, IDS, seedLead, seedStationery, seedUsers } from "./helpers";
import { publishOk } from "./integration-fixtures";
import { approve, asService, asSuper, item, open, reject, save, seedSubmission, tx } from "./review-fixtures";

beforeAll(seedUsers);
afterAll(cleanupUsers);

type N = { recipient_id: string; event_type: string; event_key: string; params: Record<string, unknown>; link_path: string; is_demo: boolean };
const notes = async (c: Client, event?: string): Promise<N[]> =>
  (await c.query("select recipient_id, event_type, event_key, params, link_path, is_demo from public.notifications where ($1::text is null or event_type = $1) order by recipient_id, event_key", [event ?? null])).rows;
const errors = async (c: Client) => (await c.query("select count(*)::int as n from public.notification_emit_errors")).rows[0].n as number;
const asActor = (c: Client, id: string) => c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "service_role" })]);

describe("eventos do catálogo por gatilho", () => {
  it("submission_ready: processing_async -> review_needed avisa o remetente (só ele, params mínimos, link do envio); síncrono não gera", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const id = await seedSubmission(c, { status: "processing_async", source: "parent", owner: "parent", schoolId: school, grade: "4º ano", year: 2027 });
      const sync = await seedSubmission(c, { status: "processing", source: "parent", owner: "parent", schoolId: school });
      await c.query("update public.list_submissions set status = 'review_needed' where id = any($1::uuid[])", [[id, sync]]);
      const n = await notes(c, "submission_ready");
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ recipient_id: IDS.parent, event_key: `submission_ready:${id}`, link_path: `/enviar-lista/${id}`, is_demo: false, params: { school_name: "Escola Fixture", grade_label: "4º ano", school_year: 2027 } });
      await c.query("update public.list_submissions set status = 'human_review' where id = $1", [id]);
      expect(await notes(c, "submission_ready")).toHaveLength(1); // repetição do fato não duplica
    });
  });

  it("submission_failed: job morto (processing_async -> rejected)", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { status: "processing_async", source: "parent", owner: "parent", schoolId: null });
      await asService(c);
      await c.query("select public.submissions_reject($1, 'ocr_dead')", [id]);
      await asSuper(c);
      const n = await notes(c, "submission_failed");
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ recipient_id: IDS.parent, link_path: `/enviar-lista/${id}`, params: {} });
    });
  });

  it("submission_published (automática e humana) e o ator que causou o fato não recebe", async () => {
    await tx(async (c) => {
      const a = await seedSubmission(c, { status: "approved", source: "parent", owner: "parent", schoolId: null });
      const b = await seedSubmission(c, { status: "approved", source: "parent", owner: "parent", schoolId: null });
      await c.query("update public.list_submissions set status = 'published' where id = $1", [a]);
      await asActor(c, IDS.parent); // o próprio remetente causou o fato: sem aviso
      await c.query("update public.list_submissions set status = 'published' where id = $1", [b]);
      const n = await notes(c, "submission_published");
      expect(n.map((x) => x.event_key)).toEqual([`submission_published:${a}`]);
    });
  });

  it("submission_not_published: review/rejected avisa o remetente sem o motivo em texto", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      const id = await seedSubmission(c, { status: "human_review", source: "parent", owner: "parent", schoolId: school });
      await asService(c);
      await open(c, id);
      await reject(c, id, 1, "illegible_document");
      await asSuper(c);
      const n = await notes(c, "submission_not_published");
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ recipient_id: IDS.parent, link_path: `/enviar-lista/${id}`, params: {} });
      expect(JSON.stringify(n[0])).not.toMatch(/illegible/);
      void approve; void save; void item;
    });
  });

  it("list_published: versão publicada avisa os dois watchers da (escola, série, ano); outro ano não", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      await c.query("update public.schools set name = 'Escola Modelo' where id = $1", [school]);
      await asService(c);
      for (const p of [IDS.parent, IDS.school_member]) await c.query("select public.list_watch_add($1, $2, 'ef-4', 2027)", [p, school]);
      await c.query("select public.list_watch_add($1, $2, 'ef-4', 2028)", [IDS.admin, school]);
      await asSuper(c);
      const { out } = await publishOk(c, { schoolId: school, gradeSlug: "ef-4", schoolYear: 2027 });
      const inep = (await c.query("select inep from public.schools where id = $1", [school])).rows[0].inep;
      const n = await notes(c, "list_published");
      expect(n.map((x) => x.recipient_id).sort()).toEqual([IDS.parent, IDS.school_member].sort());
      expect(n[0]).toMatchObject({ event_key: `list_published:${out.newVersionId}`, link_path: `/escolas/${inep}/ef-4?ano=2027`, params: { school_name: "Escola Modelo", grade_label: "4º ano", school_year: 2027 } });
    });
  });

  it("lead_received (dois membros da papelaria, só lead_code) e lead_quote_sent/lead_expired (solicitante)", async () => {
    await tx(async (c) => {
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      await c.query("insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'staff')", [st, IDS.admin]);
      const { id, code } = await seedLead(c, { stationeryId: st, requesterId: IDS.parent });
      const rec = await notes(c, "lead_received");
      expect(rec.map((x) => x.recipient_id).sort()).toEqual([IDS.admin, IDS.stationery_member].sort());
      expect(rec[0]).toMatchObject({ params: { lead_code: code }, link_path: `/papelaria/leads/${code}`, is_demo: true });
      expect(JSON.stringify(rec)).not.toMatch(/Escola|estudante|nome/i); // nada de escola, aluno ou responsável
      await c.query("update public.leads set status = 'quote_sent' where id = $1", [id]);
      await c.query("update public.leads set status = 'expired' where id = $1", [id]);
      const req = [...(await notes(c, "lead_quote_sent")), ...(await notes(c, "lead_expired"))].sort((a, b) => a.event_type.localeCompare(b.event_type));
      expect(req.map((x) => [x.recipient_id, x.event_type, x.link_path])).toEqual([[IDS.parent, "lead_expired", `/cotacao/${code}`], [IDS.parent, "lead_quote_sent", `/cotacao/${code}`]]);
    });
  });

  it("claim_updated: aprovada, recusada, evidência insuficiente e token_expired avisam o reivindicante", async () => {
    await tx(async (c) => {
      const s1 = await seedClaimSchool(c, { inep: "51999811" });
      const s2 = await seedClaimSchool(c, { inep: "51999812" });
      const s3 = await seedClaimSchool(c, { inep: "51999813" });
      const c1 = await docsAwaiting(c, s1);
      await decide(c, c1, "approved");
      const c2 = await docsAwaiting(c, s2, IDS.school_member);
      await decide(c, c2, "rejected");
      const c3 = await docsAwaiting(c, s3);
      await decide(c, c3, "insufficient_evidence");
      const s4 = await seedClaimSchool(c, { inep: "51999814" });
      const c4 = await createClaim(c, s4, { method: "institutional_email", claimant: IDS.school_member });
      await issueToken(c, c4, sha("t"), IDS.school_member);
      await backdateTokens(c, c4, 25 * 3600);
      await asService(c);
      await c.query("select public.claim_expire_tokens()");
      await asSuper(c);
      const n = await notes(c, "claim_updated");
      const byStatus = Object.fromEntries(n.map((x) => [x.params.status_code, x.recipient_id]));
      expect(n.filter((x) => x.params.status_code === "rejected").map((x) => x.recipient_id)).toEqual([IDS.school_member]);
      expect(byStatus).toMatchObject({ approved: IDS.parent, insufficient_evidence: IDS.parent, token_expired: IDS.school_member });
      expect(n.every((x) => x.link_path.startsWith("/escolas/") && !JSON.stringify(x).includes("Maria"))).toBe(true);
      void addEvidence;
    });
  });

  it("publication_orphaned: os dois admins, só central (sem entregas externas), sem o ator", async () => {
    await tx(async (c) => {
      await c.query("update public.profiles set role = 'admin' where id = $1", [IDS.school_member]);
      const sub = await seedSubmission(c, { status: "human_review", source: "school", schoolId: await ensureSchool(c) });
      await c.query(
        `insert into public.ai_decisions (entity_type, entity_id, kind, pipeline_version, decision, justification, reasons, new_version_id)
         values ('list_submission', $1, 'publication', 's9.1', 'publish_orphaned', 'published_after_failure', '[]'::jsonb, $2)`,
        [sub, randomUUID()],
      );
      const n = (await notes(c, "publication_orphaned")).filter((x) => x.link_path === `/admin/revisao/${sub}`); // linhas confirmadas por outros testes não contam
      const admins = (await c.query("select id from public.profiles where role = 'admin'")).rows.map((r) => r.id as string);
      expect(admins).toEqual(expect.arrayContaining([IDS.admin, IDS.school_member]));
      expect(n.map((x) => x.recipient_id).sort()).toEqual(admins.sort());
      expect(n[0]).toMatchObject({ link_path: `/admin/revisao/${sub}`, params: {} });
      expect((await c.query("select count(*)::int as n from public.notification_deliveries")).rows[0].n).toBe(0);
    });
  });

  it("erro na emissão nunca desfaz o fato: o contador sobe e o envio muda de estado", async () => {
    await tx(async (c) => {
      const id = await seedSubmission(c, { status: "processing_async", source: "parent", owner: "parent", schoolId: null });
      const before = await errors(c);
      await c.query("alter table public.notifications drop constraint notifications_link_path_valid"); // força o erro dentro da emissão
      await c.query("alter table public.notifications add constraint notifications_link_path_valid check (false) not valid");
      await c.query("update public.list_submissions set status = 'review_needed' where id = $1", [id]);
      expect((await c.query("select status::text as s from public.list_submissions where id = $1", [id])).rows[0].s).toBe("review_needed");
      expect(await errors(c)).toBe(before + 1);
      expect(await notes(c, "submission_ready")).toHaveLength(0);
    });
  });
});
