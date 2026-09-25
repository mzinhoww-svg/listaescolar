import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, seedUsers, withClaims, withSuperuser } from "./helpers";
import { CONSENT, insertJob, insertSubmission, purgeQueues, SUB } from "./s07-fixtures";

const ENUMS: Record<string, string[]> = {
  submission_source: ["parent", "school"],
  notify_channel: ["none", "browser", "email", "whatsapp"],
};

describe("S07 schema", () => {
  for (const [name, values] of Object.entries(ENUMS)) {
    it(`enum ${name}`, async () => {
      const rows = await withSuperuser(async (c) =>
        (await c.query<{ enumlabel: string }>(
          `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = $1 and t.typnamespace = 'public'::regnamespace order by e.enumsortorder`,
          [name],
        )).rows.map((r) => r.enumlabel),
      );
      expect(rows).toEqual(values);
    });
  }

  const COLUMNS: Record<string, string[]> = {
    consents: ["id", "profile_id", "purpose", "text_version", "granted_at", "revoked_at", "created_at", "updated_at"],
    list_submissions: [
      "id", "submitted_by", "source", "school_id", "grade", "school_year", "storage_path", "file_name",
      "mime_type", "size_bytes", "consent_id", "status", "is_demo", "created_at", "updated_at",
    ],
    jobs: [
      "id", "kind", "payload", "status", "attempts", "max_attempts", "last_error", "run_after", "locked_at",
      "idempotency_key", "notify_channel", "notify_target", "submission_id", "created_at", "updated_at",
    ],
    ocr_jobs: ["id", "job_id", "submission_id", "result", "duration_ms", "created_at", "updated_at"],
  };
  for (const [table, cols] of Object.entries(COLUMNS)) {
    it(`tabela ${table}: colunas, RLS habilitada`, async () => {
      await withSuperuser(async (c) => {
        const r = await c.query<{ column_name: string }>(
          "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
          [table],
        );
        expect(r.rows.map((x) => x.column_name).sort()).toEqual([...cols].sort());
        const rls = await c.query<{ relrowsecurity: boolean }>(
          "select relrowsecurity from pg_class where oid = $1::regclass",
          [`public.${table}`],
        );
        expect(rls.rows[0]?.relrowsecurity).toBe(true);
      });
    });
  }

  it("list_submissions.school_id não tem FK (ADR-004)", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select 1 from pg_constraint where conrelid = 'public.list_submissions'::regclass and contype = 'f'
           and conkey @> array[(select attnum from pg_attribute where attrelid = 'public.list_submissions'::regclass and attname = 'school_id')]`,
      );
      expect(r.rowCount).toBe(0);
    });
  });

  it("jobs.max_attempts default 5, status queued, notify_channel none", async () => {
    await seedUsers();
    try {
      await withSuperuser(async (c) => {
        const id = await insertJob(c, null, "defaults");
        const r = await c.query("select max_attempts, status::text, notify_channel::text, attempts from public.jobs where id = $1", [id]);
        expect(r.rows[0]).toEqual({ max_attempts: 5, status: "queued", notify_channel: "none", attempts: 0 });
      });
    } finally {
      await withSuperuser((c) => c.query("delete from public.jobs where idempotency_key = 'defaults'"));
      await cleanupUsers();
    }
  });
});

describe("S07 RLS: consents, list_submissions, jobs, ocr_jobs", () => {
  beforeAll(async () => {
    await seedUsers();
    await withSuperuser(async (c) => {
      const s = await insertSubmission(c, "parent");
      await insertSubmission(c, "schoolMember");
      const job = await insertJob(c, s, "rls-job-parent", { channel: "email", target: "pai@exemplo.invalid" });
      await c.query("insert into public.ocr_jobs (job_id, submission_id, result, duration_ms) values ($1, $2, '{}'::jsonb, 5)", [job, s]);
    });
  });
  afterAll(async () => {
    await withSuperuser(async (c) => {
      await purgeQueues(c);
    });
    await cleanupUsers();
  });

  it("dono lê só o próprio envio, consentimento, job e ocr_job", async () => {
    await withClaims("parent", async (c) => {
      expect((await c.query("select id from public.list_submissions")).rows.map((r) => r.id)).toEqual([SUB.parent]);
      expect((await c.query("select id from public.consents")).rows.map((r) => r.id)).toEqual([CONSENT.parent]);
      expect((await c.query("select id from public.jobs")).rowCount).toBe(1);
      expect((await c.query("select id from public.ocr_jobs")).rowCount).toBe(1);
    });
  });

  it("outro usuário não vê envio, job, ocr_job nem notify_target do dono", async () => {
    await withClaims("school_member", async (c) => {
      expect((await c.query("select id from public.list_submissions")).rows.map((r) => r.id)).toEqual([SUB.schoolMember]);
      expect((await c.query("select notify_target from public.jobs")).rowCount).toBe(0);
      expect((await c.query("select id from public.ocr_jobs")).rowCount).toBe(0);
      expect((await c.query("select id from public.consents")).rows.map((r) => r.id)).toEqual([CONSENT.schoolMember]);
    });
    await withClaims("stationery_member", async (c) => {
      for (const t of ["list_submissions", "jobs", "ocr_jobs", "consents"]) {
        expect((await c.query(`select id from public.${t}`)).rowCount).toBe(0);
      }
    });
  });

  it("admin e system leem tudo (inclusive notify_target)", async () => {
    for (const who of ["admin", "system"] as const) {
      await withClaims(who, async (c) => {
        expect((await c.query("select id from public.list_submissions")).rowCount).toBe(2);
        const j = await c.query("select notify_target from public.jobs");
        expect(j.rows[0]?.notify_target).toBe("pai@exemplo.invalid");
        expect((await c.query("select id from public.ocr_jobs")).rowCount).toBe(1);
      });
    }
  });

  it("anon não lê nem escreve nada", async () => {
    await withClaims("anon", async (c) => {
      for (const t of ["list_submissions", "jobs", "ocr_jobs", "consents"]) {
        const r = await attempt(c, `select id from public.${t}`);
        expect(r.error !== null || r.rowCount === 0).toBe(true);
      }
      const ins = await attempt(c, "insert into public.consents (profile_id, purpose, text_version) values ($1, 'list_upload', 'v1')", [IDS.parent]);
      expect(ins.error).not.toBeNull();
    });
  });

  const insConsent = "insert into public.consents (profile_id, purpose, text_version) values ($1, 'list_upload', 'v1')";

  it("authenticated não insere em consents, list_submissions; service_role insere (envio é feito pelo servidor)", async () => {
    await withClaims("parent", async (c) => {
      const ins = await attempt(c, insConsent, [IDS.parent]);
      expect(ins.error).not.toBeNull();
      const sub = await attempt(c, ...newSub("30000000-0000-4000-8000-0000000000a1", IDS.parent, CONSENT.parent));
      expect(sub.error).not.toBeNull();
    });
    await withClaims("system", async (c) => {
      expect((await attempt(c, insConsent, [IDS.parent])).error).toBeNull();
      expect((await attempt(c, ...newSub("30000000-0000-4000-8000-0000000000a2", IDS.parent, CONSENT.parent))).error).toBeNull();
    });
  });

  it("consentimento: dono não consegue revogar nem alterar direto (sem UPDATE)", async () => {
    await withClaims("parent", async (c) => {
      for (const sql of ["update public.consents set revoked_at = now()", "update public.consents set revoked_at = null", "update public.consents set purpose = 'outro'"]) {
        expect((await attempt(c, sql)).error, sql).not.toBeNull();
      }
    });
  });

  it("consents_revoke: revoga uma única vez (idempotente) e só para o dono", async () => {
    await withClaims("system", async (c) => {
      await c.query("select public.consents_revoke($1, $2)", [CONSENT.parent, IDS.school_member]); // não é o dono
      const none = await c.query("select revoked_at from public.consents where id = $1", [CONSENT.parent]);
      expect(none.rows[0]!.revoked_at).toBeNull();
      await c.query("update public.consents set revoked_at = null where id = $1", [CONSENT.parent]);
      await c.query("select public.consents_revoke($1, $2)", [CONSENT.parent, IDS.parent]);
      const first = (await c.query("select revoked_at from public.consents where id = $1", [CONSENT.parent])).rows[0]!.revoked_at as Date;
      expect(first).not.toBeNull();
      await c.query("select pg_sleep(0.05)");
      await c.query("select public.consents_revoke($1, $2)", [CONSENT.parent, IDS.parent]);
      const second = (await c.query("select revoked_at from public.consents where id = $1", [CONSENT.parent])).rows[0]!.revoked_at as Date;
      expect(second.getTime()).toBe(first.getTime());
    });
  });

  it("consents: trigger impede restaurar revogado e mudar profile_id/purpose/text_version/granted_at (até como service_role/owner)", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query("select public.consents_revoke($1, $2)", [CONSENT.parent, IDS.parent]);
        for (const set of ["revoked_at = null", "revoked_at = now() + interval '1 day'", "purpose = 'outro'", "text_version = 'v9'", `profile_id = '${IDS.school_member}'`, "granted_at = now() - interval '1 year'"]) {
          expect((await attempt(c, `update public.consents set ${set} where id = $1`, [CONSENT.parent])).error, set).not.toBeNull();
        }
      } finally {
        await c.query("rollback");
      }
    });
  });

  const newSub = (id: string, owner: string, consent: string, extra = { source: "parent", status: "submitted", mime: "application/pdf", size: 1000 }): [string, unknown[]] =>
    [
      `insert into public.list_submissions (id, submitted_by, source, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id, status)
       values ($1::uuid, $2::uuid, $3::public.submission_source, '1o ano', 2027, $2::text || '/' || $1::text || '/a.pdf', 'a.pdf', $4, $5, $6::uuid, $7::public.list_status)`,
      [id, owner, extra.source, extra.mime, extra.size, consent, extra.status],
    ];

  it("servidor cria envio com o consentimento do dono; consentimento alheio, status avançado e dono alheio são recusados", async () => {
    const id = "30000000-0000-4000-8000-000000000001";
    await withClaims("system", async (c) => {
      const ok = await attempt(c, ...newSub(id, IDS.parent, CONSENT.parent));
      expect(ok.error).toBeNull();
      const foreignConsent = await attempt(c, ...newSub("30000000-0000-4000-8000-000000000002", IDS.parent, CONSENT.schoolMember));
      expect(foreignConsent.error).not.toBeNull();
      const advanced = await attempt(c, ...newSub("30000000-0000-4000-8000-000000000003", IDS.parent, CONSENT.parent, { source: "parent", status: "published", mime: "application/pdf", size: 1000 }));
      expect(advanced.error).not.toBeNull();
      const otherOwner = await attempt(c, ...newSub("30000000-0000-4000-8000-000000000004", IDS.school_member, CONSENT.parent));
      expect(otherOwner.error).not.toBeNull();
    });
  });

  it("consentimento revogado (via consents_revoke) não sustenta novo envio", async () => {
    await withClaims("system", async (c) => {
      await c.query("select public.consents_revoke($1, $2)", [CONSENT.parent, IDS.parent]);
      const r = await attempt(c, ...newSub("30000000-0000-4000-8000-000000000005", IDS.parent, CONSENT.parent));
      expect(r.error).not.toBeNull();
    });
  });

  it("source 'school' só para school_member/admin; mime e tamanho fora do limite violam CHECK", async () => {
    await withClaims("system", async (c) => {
      const r = await attempt(c, ...newSub("30000000-0000-4000-8000-000000000006", IDS.parent, CONSENT.parent, { source: "school", status: "submitted", mime: "application/pdf", size: 1000 }));
      expect(r.error).not.toBeNull();
      const ok = await attempt(c, ...newSub("30000000-0000-4000-8000-000000000007", IDS.school_member, CONSENT.schoolMember, { source: "school", status: "submitted", mime: "application/pdf", size: 1000 }));
      expect(ok.error).toBeNull();
      const exe = await attempt(c, ...newSub("30000000-0000-4000-8000-000000000008", IDS.parent, CONSENT.parent, { source: "parent", status: "submitted", mime: "application/x-msdownload", size: 1000 }));
      expect(exe.error).not.toBeNull();
      const big = await attempt(c, ...newSub("30000000-0000-4000-8000-000000000009", IDS.parent, CONSENT.parent, { source: "parent", status: "submitted", mime: "application/pdf", size: 10485761 }));
      expect(big.error).not.toBeNull();
      const zero = await attempt(c, ...newSub("30000000-0000-4000-8000-00000000000a", IDS.parent, CONSENT.parent, { source: "parent", status: "submitted", mime: "application/pdf", size: 0 }));
      expect(zero.error).not.toBeNull();
    });
  });

  it("storage_path deve seguir {profile}/{submission}/arquivo (sem ../)", async () => {
    await withClaims("system", async (c) => {
      const id = "30000000-0000-4000-8000-00000000000b";
      const r = await attempt(
        c,
        `insert into public.list_submissions (id, submitted_by, source, grade, school_year, storage_path, file_name, mime_type, size_bytes, consent_id)
         values ($1, $2, 'parent', '1o ano', 2027, '../etc/passwd', 'a.pdf', 'application/pdf', 10, $3)`,
        [id, IDS.parent, CONSENT.parent],
      );
      expect(r.error).not.toBeNull();
    });
  });

  it("dono não altera nem apaga envios; só notify_* do próprio job", async () => {
    await withClaims("parent", async (c) => {
      expect((await attempt(c, "update public.list_submissions set status = 'published'")).rowCount).toBe(0);
      expect((await attempt(c, "delete from public.list_submissions")).rowCount).toBe(0);
      const ok = await attempt(c, "update public.jobs set notify_channel = 'whatsapp', notify_target = '+5565999990000'");
      expect(ok.error).toBeNull();
      expect(ok.rowCount).toBe(1);
      const status = await attempt(c, "update public.jobs set status = 'succeeded'");
      expect(status.error).not.toBeNull();
      const noTarget = await attempt(c, "update public.jobs set notify_channel = 'email', notify_target = null");
      expect(noTarget.error).not.toBeNull();
    });
    await withClaims("school_member", async (c) => {
      expect((await attempt(c, "update public.jobs set notify_channel = 'browser'")).rowCount).toBe(0);
    });
  });

  it("ninguém autenticado escreve em ocr_jobs; jobs só via função", async () => {
    await withClaims("admin", async (c) => {
      expect((await attempt(c, "insert into public.ocr_jobs (job_id, submission_id) select id, submission_id from public.jobs")).error).not.toBeNull();
      expect((await attempt(c, "insert into public.jobs (kind, idempotency_key) values ('ocr_jobs', 'x')")).error).not.toBeNull();
    });
  });

  it("updated_at é mantido por trigger", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      await c.query("update public.jobs set updated_at = now() - interval '1 day' where idempotency_key = 'rls-job-parent'");
      await c.query("update public.jobs set last_error = 'x' where idempotency_key = 'rls-job-parent'");
      const r = await c.query<{ fresh: boolean }>("select updated_at > now() - interval '1 minute' as fresh from public.jobs where idempotency_key = 'rls-job-parent'");
      await c.query("rollback");
      expect(r.rows[0]?.fresh).toBe(true);
    });
  });
});
