// Denúncias (S16, Admin): fila com motivo por código (nunca prosa/PII), transição de estado e resolução do admin.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, attemptH, cleanupUsers, IDS, inTx, seedLead, seedStationery, seedUsers, withClaims, withSuperuser } from "./helpers";
import { backToSuper, cleanupCommitted, seedInState, switchTo } from "./list-fixtures";

const INEPS = ["51999801", "51999802", "51999803", "51999804", "51999805"];
const SEC_INEPS = ["51999811", "51999812", "51999813", "51999814", "51999815"];
const CAP_INEPS = Array.from({ length: 12 }, (_, i) => `519992${String(i).padStart(2, "0")}`);

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
  it("report_transition_allowed, reports_guard e reports_check_before_insert: ninguém tem EXECUTE direto", async () => {
    await withSuperuser(async (c) => {
      const sigs = [
        "public.report_transition_allowed(public.report_status, public.report_status)",
        "public.reports_guard()",
        "public.reports_check_before_insert()",
        "public.reports_max_per_day()",
      ];
      for (const sig of sigs) {
        for (const role of ["anon", "authenticated", "service_role"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [role, sig]);
          expect(r.rows[0]!.ok, `${role} × ${sig}`).toBe(false);
        }
      }
    });
  });
});

describe("revisão de segurança (rodada única sobre a 0604)", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await cleanupCommitted(SEC_INEPS);
    await cleanupUsers();
  });

  it("só aceita target_type = 'school_list' por enquanto (papelaria/catálogo sem UI ainda)", async () => {
    const school = await withSuperuser((c) => seedInState(c, "published", { inep: SEC_INEPS[0] }));
    try {
      await withClaims("parent", async (cc) => {
        const r = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, reporter_id) values ('stationery', $1, 'outro', $2)",
          [school.listId, IDS.parent],
        );
        expect(r.error).not.toBeNull();
        expect(r.hint).toBe("target_type_not_allowed");
      });
    } finally {
      await cleanupReports([school.listId]);
    }
  });

  it("recusa alvo inexistente e lista não publicada (draft)", async () => {
    const draft = await withSuperuser((c) => seedInState(c, "draft", { inep: SEC_INEPS[1] }));
    try {
      await withClaims("parent", async (cc) => {
        const missing = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, reporter_id) values ('school_list', $1, 'outro', $2)",
          ["00000000-0000-4000-8000-000000000fff", IDS.parent],
        );
        expect(missing.error).not.toBeNull();
        expect(missing.hint).toBe("target_not_found");

        const notPublished = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, reporter_id) values ('school_list', $1, 'outro', $2)",
          [draft.listId, IDS.parent],
        );
        expect(notPublished.error).not.toBeNull();
        expect(notPublished.hint).toBe("target_not_found");
      });
    } finally {
      await cleanupReports([draft.listId]);
    }
  });

  it("não deixa duplicar denúncia aberta/em análise do mesmo alvo pelo mesmo denunciante; libera depois de resolvida", async () => {
    const school = await withSuperuser((c) => seedInState(c, "published", { inep: SEC_INEPS[2] }));
    try {
      let firstId = "";
      await withClaims("parent", async (cc) => {
        const first = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, reporter_id) values ('school_list', $1, 'outro', $2) returning id",
          [school.listId, IDS.parent],
        );
        expect(first.error).toBeNull();
        firstId = first.rows[0]!.id as string;

        const dup = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, reporter_id) values ('school_list', $1, 'preco_incorreto', $2)",
          [school.listId, IDS.parent],
        );
        expect(dup.error).not.toBeNull();
        expect(dup.code).toBe("23505");
      });

      await withClaims("admin", async (cc) => {
        await cc.query(
          "update public.reports set status = 'resolved', resolution = 'no_action', resolved_at = now() where id = $1",
          [firstId],
        );
      });

      await withClaims("parent", async (cc) => {
        const afterResolved = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, reporter_id) values ('school_list', $1, 'outro', $2)",
          [school.listId, IDS.parent],
        );
        expect(afterResolved.error, afterResolved.error ?? undefined).toBeNull();
      });
    } finally {
      await cleanupReports([school.listId]);
    }
  });

  it("teto diário por denunciante (public.reports_max_per_day)", async () => {
    // reports_max_per_day não tem EXECUTE para authenticated (só chamada de dentro do gatilho, SECURITY
    // DEFINER); o valor de referência do teste vem de dentro do banco (superuser), não hardcoded aqui.
    const cap = await withSuperuser(async (c) => {
      const v = (await c.query<{ v: number }>("select public.reports_max_per_day() as v")).rows[0]!.v;
      expect(v).toBeGreaterThan(0);
      return v;
    });
    const schools = await withSuperuser(async (c) => {
      const out: string[] = [];
      for (const inep of CAP_INEPS) out.push((await seedInState(c, "published", { inep })).listId);
      return out;
    });
    try {
      await withClaims("parent", async (cc) => {
        for (let i = 0; i < cap; i++) {
          const r = await attemptH(
            cc,
            "insert into public.reports (target_type, target_id, reason, reporter_id) values ('school_list', $1, 'outro', $2)",
            [schools[i], IDS.parent],
          );
          expect(r.error, `denúncia ${i}`).toBeNull();
        }
        const overCap = await attemptH(
          cc,
          "insert into public.reports (target_type, target_id, reason, reporter_id) values ('school_list', $1, 'outro', $2)",
          [schools[cap], IDS.parent],
        );
        expect(overCap.error).not.toBeNull();
        expect(overCap.hint).toBe("daily_limit");
      });
    } finally {
      await cleanupReports(schools);
      await cleanupCommitted(CAP_INEPS);
    }
  }, 30_000);

  it("resolved_by é sempre o autor da SESSÃO (auth.uid()), mesmo que o cliente informe outro id", async () => {
    const school = await withSuperuser((c) => seedInState(c, "published", { inep: SEC_INEPS[3] }));
    const reportId = await withSuperuser((c) => insertOpen(c, school.listId));
    try {
      await inTx(async (c) => {
        await switchTo(c, "admin");
        // tenta atribuir a resolução a outro usuário (parent) — o gatilho deve ignorar e usar o próprio admin.
        const r = await attemptH(
          c,
          "update public.reports set status = 'resolved', resolution = 'upheld', resolved_by = $2, resolved_at = now() where id = $1",
          [reportId, IDS.parent],
        );
        expect(r.error, r.error ?? undefined).toBeNull();
        await backToSuper(c);
        // lido de volta como superuser, na MESMA transação (ainda não committada): resolved_by não é legível
        // por authenticated (ver teste seguinte), então a checagem em si precisa do papel elevado.
        const row = await c.query("select resolved_by from public.reports where id = $1", [reportId]);
        expect(row.rows[0]?.resolved_by).toBe(IDS.admin);
      });
    } finally {
      await cleanupReports([school.listId]);
    }
  });

  it("authenticated não lê resolved_by (nem o próprio denunciante, nem o admin)", async () => {
    const school = await withSuperuser((c) => seedInState(c, "published", { inep: SEC_INEPS[4] }));
    const reportId = await withSuperuser((c) => insertOpen(c, school.listId));
    try {
      await withClaims("admin", async (cc) => {
        const r = await attemptH(cc, "select resolved_by from public.reports where id = $1", [reportId]);
        expect(r.error).not.toBeNull();
      });
    } finally {
      await cleanupReports([school.listId]);
    }
  });

  it("authenticated não liga auto_publish_enabled nem edita routes em ai_settings, mesmo como admin", async () => {
    await withClaims("admin", async (cc) => {
      const r1 = await attemptH(cc, "update public.ai_settings set auto_publish_enabled = true where scope = 'default'");
      expect(r1.error).not.toBeNull();
      const r2 = await attemptH(cc, "update public.ai_settings set routes = routes || '{\"outro\":true}'::jsonb where scope = 'default'");
      expect(r2.error).not.toBeNull();
      // os campos com CHECK simples continuam editáveis pelo admin.
      const r3 = await attemptH(cc, "update public.ai_settings set pipeline_version = 'v-teste-seguranca' where scope = 'default'");
      expect(r3.error, r3.error ?? undefined).toBeNull();
    });
  });

  it("gatilhos de auditoria de lead_reviews/lead_disputes excluem comment/detail (dado pessoal fora do audit_log)", async () => {
    await withSuperuser(async (c) => {
      const stationeryId = await seedStationery(c);
      await c.query(
        "insert into public.stationery_members (stationery_id, profile_id, member_role) values ($1, $2, 'owner') on conflict do nothing",
        [stationeryId, IDS.stationery_member],
      );
      const reviewedLead = await seedLead(c, { stationeryId, status: "converted" });
      const reviewId = (
        await c.query<{ id: string }>(
          "select public.lead_review_create($1::uuid, $2::uuid, 5, '{}'::text[], $3::text) as id",
          [reviewedLead.id, IDS.parent, "Atendimento rápido e prestativo, recomendo"],
        )
      ).rows[0]!.id;
      const reviewAudit = await c.query<{ after: Record<string, unknown> }>(
        "select after from public.audit_log where entity_table = 'lead_reviews' and entity_id = $1 order by created_at desc limit 1",
        [reviewId],
      );
      expect(reviewAudit.rows[0]?.after).not.toHaveProperty("comment");

      const disputedLead = await seedLead(c, { stationeryId });
      const disputeId = (
        await c.query<{ id: string }>("select public.lead_dispute_open($1::uuid, $2::uuid, $3::text, $4::text) as id", [
          disputedLead.id,
          IDS.stationery_member,
          "wrong_number",
          "endereço da minha casa é Rua Teste 123",
        ])
      ).rows[0]!.id;
      const disputeAudit = await c.query<{ after: Record<string, unknown> }>(
        "select after from public.audit_log where entity_table = 'lead_disputes' and entity_id = $1 order by created_at desc limit 1",
        [disputeId],
      );
      expect(disputeAudit.rows[0]?.after).not.toHaveProperty("detail");
    });
  });
});
