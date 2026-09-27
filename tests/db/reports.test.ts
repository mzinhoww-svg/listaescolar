// Denúncias (S16, Admin): fila com motivo por código (nunca prosa/PII), transição de estado e resolução do admin.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, attemptH, cleanupUsers, IDS, inTx, seedUsers, withClaims, withSuperuser } from "./helpers";
import { cleanupCommitted, seedInState } from "./list-fixtures";

const INEPS = ["51999801", "51999802", "51999803", "51999804", "51999805"];

async function insertOpen(
  c: { query: (sql: string, params?: unknown[]) => Promise<{ rows: { id: string }[] }> },
  targetId: string,
  reporterId: string = IDS.parent,
): Promise<string> {
  const r = await c.query(
    "insert into public.reports (target_type, target_id, reason, detail_code, reporter_id) values ('school_list', $1, 'preco_incorreto', 'catalogo_desatualizado', $2) returning id",
    [targetId, reporterId],
  );
  return r.rows[0]!.id;
}

async function cleanupReports(targetIds: string[]): Promise<void> {
  if (targetIds.length === 0) return;
  await withSuperuser(async (c) => {
    await c.query("delete from public.reports where target_id = any($1::uuid[])", [targetIds]);
  });
}

describe("tabela reports: colunas e RLS", () => {
  it("tem id/created_at/updated_at e RLS habilitada", async () => {
    await withSuperuser(async (c) => {
      const cols = await c.query("select column_name from information_schema.columns where table_schema='public' and table_name='reports'");
      expect(cols.rows.map((r) => r.column_name)).toEqual(
        expect.arrayContaining(["id", "created_at", "updated_at", "target_type", "target_id", "reason", "reporter_id", "status"]),
      );
      const rls = await c.query("select relrowsecurity from pg_class where oid = 'public.reports'::regclass");
      expect(rls.rows[0]?.relrowsecurity).toBe(true);
    });
  });
});

describe("report_transition_allowed", () => {
  it("só permite a matriz esperada, sem 'resolvido -> aberto' de novo", async () => {
    await inTx(async (c) => {
      const allowed = async (f: string, t: string) => (await c.query<{ v: boolean }>("select public.report_transition_allowed($1, $2) as v", [f, t])).rows[0]!.v;
      expect(await allowed("open", "reviewing")).toBe(true);
      expect(await allowed("open", "resolved")).toBe(true);
      expect(await allowed("open", "dismissed")).toBe(true);
      expect(await allowed("reviewing", "resolved")).toBe(true);
      expect(await allowed("reviewing", "dismissed")).toBe(true);
      expect(await allowed("resolved", "open")).toBe(false);
      expect(await allowed("resolved", "reviewing")).toBe(false);
      expect(await allowed("dismissed", "open")).toBe(false);
      expect(await allowed("open", "open")).toBe(false);
    });
  });
});

describe("com lista publicada como alvo", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await cleanupCommitted(INEPS);
    await cleanupUsers();
  });

  it("regex de código: recusa detail_code/resolution_note com espaço (prosa) e aceita código curto", async () => {
    await withSuperuser(async (c) => {
      const school = await seedInState(c, "published", { inep: INEPS[0] });
      await c.query("begin");
      const bad = await attempt(
        c,
        "insert into public.reports (target_type, target_id, reason, detail_code, reporter_id) values ('school_list', $1, 'conteudo_inadequado', 'nome da mae eh maria', $2)",
        [school.listId, IDS.parent],
      );
      expect(bad.error, "detail_code com espaço deveria falhar no CHECK").not.toBeNull();
      const ok = await attempt(
        c,
        "insert into public.reports (target_type, target_id, reason, detail_code, reporter_id) values ('school_list', $1, 'conteudo_inadequado', 'item_repetido', $2)",
        [school.listId, IDS.parent],
      );
      expect(ok.error).toBeNull();
      await c.query("rollback");
    });
  });

  it("authenticated insere a própria denúncia 'open'; não pode forjar reporter_id de outro nem status resolvido", async () => {
    const school = await withSuperuser((c) => seedInState(c, "published", { inep: INEPS[1] }));
    try {
      await withClaims("parent", async (cc) => {
        const own = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, detail_code, reporter_id) values ('school_list', $1, 'suspeita_fraude', null, $2) returning id",
          [school.listId, IDS.parent],
        );
        expect(own.error, own.error ?? undefined).toBeNull();

        const forged = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, detail_code, reporter_id) values ('school_list', $1, 'outro', null, $2)",
          [school.listId, IDS.admin],
        );
        expect(forged.error).not.toBeNull();

        // status não é uma coluna concedida em INSERT: tentar setá-la falha por privilégio de coluna, não pela política.
        const setStatus = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, detail_code, reporter_id, status) values ('school_list', $1, 'outro', null, $2, 'resolved')",
          [school.listId, IDS.parent],
        );
        expect(setStatus.error).not.toBeNull();
      });
    } finally {
      await cleanupReports([school.listId]);
    }
  });

  it("denunciante vê a própria denúncia; não vê a de terceiros; admin vê todas", async () => {
    const school = await withSuperuser((c) => seedInState(c, "published", { inep: INEPS[2] }));
    const parentReportId = await withSuperuser((c) => insertOpen(c, school.listId, IDS.parent));
    const memberReportId = await withSuperuser((c) => insertOpen(c, school.listId, IDS.school_member));
    try {
      await withClaims("parent", async (cc) => {
        const mine = await cc.query("select id from public.reports where id = $1", [parentReportId]);
        expect(mine.rows).toHaveLength(1);
        const theirs = await cc.query("select id from public.reports where id = $1", [memberReportId]);
        expect(theirs.rows).toHaveLength(0);
      });
      await withClaims("admin", async (cc) => {
        const all = await cc.query("select id from public.reports where id in ($1, $2)", [parentReportId, memberReportId]);
        expect(all.rows).toHaveLength(2);
      });
    } finally {
      await cleanupReports([school.listId]);
    }
  });

  it("parent não resolve denúncia; admin resolve com sucesso; identidade e resolução ficam imutáveis depois", async () => {
    const school = await withSuperuser((c) => seedInState(c, "published", { inep: INEPS[3] }));
    const reportId = await withSuperuser((c) => insertOpen(c, school.listId));
    try {
      await withClaims("parent", async (cc) => {
        // RLS filtra a linha (USING falso para quem não é admin/system): a linha simplesmente não casa,
        // sem exceção — 0 linhas afetadas, não erro.
        const r = await attemptH(cc, "update public.reports set status = 'reviewing' where id = $1", [reportId]);
        expect(r.error).toBeNull();
        expect(r.rowCount).toBe(0);
      });

      await withClaims("admin", async (cc) => {
        const toReviewing = await attemptH(cc, "update public.reports set status = 'reviewing' where id = $1", [reportId]);
        expect(toReviewing.error, toReviewing.error ?? undefined).toBeNull();

        const resolve = await attemptH(
          cc,
          `update public.reports
              set status = 'resolved', resolution = 'upheld', resolution_note = 'lista_arquivada', resolved_by = $2, resolved_at = now()
            where id = $1`,
          [reportId, IDS.admin],
        );
        expect(resolve.error, resolve.error ?? undefined).toBeNull();

        // identidade imutável mesmo para admin.
        const tamper = await attemptH(cc, "update public.reports set reason = 'outro' where id = $1", [reportId]);
        expect(tamper.error).not.toBeNull();

        // 'resolvido -> revisão' de novo é transição inválida.
        const back = await attemptH(cc, "update public.reports set status = 'reviewing' where id = $1", [reportId]);
        expect(back.error).not.toBeNull();

        // resolution_note sozinho, sem mudar status: bloqueado pelo gatilho (resolução é imutável depois de fechada).
        const editNote = await attemptH(cc, "update public.reports set resolution_note = 'outro_codigo' where id = $1", [reportId]);
        expect(editNote.error).not.toBeNull();
      });
    } finally {
      await cleanupReports([school.listId]);
    }
  });

  it("resolver sem informar resolution/resolved_by/resolved_at falha no CHECK de consistência", async () => {
    const school = await withSuperuser((c) => seedInState(c, "published", { inep: INEPS[4] }));
    const reportId = await withSuperuser((c) => insertOpen(c, school.listId));
    try {
      await withClaims("admin", async (cc) => {
        const r = await attemptH(cc, "update public.reports set status = 'resolved' where id = $1", [reportId]);
        expect(r.error).not.toBeNull();
      });
    } finally {
      await cleanupReports([school.listId]);
    }
  });
});

describe("privilégios de EXECUTE", () => {
  it("report_transition_allowed e reports_guard: ninguém tem EXECUTE direto", async () => {
    await withSuperuser(async (c) => {
      const sigs = ["public.report_transition_allowed(public.report_status, public.report_status)", "public.reports_guard()"];
      for (const sig of sigs) {
        for (const role of ["anon", "authenticated", "service_role"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [role, sig]);
          expect(r.rows[0]!.ok, `${role} × ${sig}`).toBe(false);
        }
      }
    });
  });
});
