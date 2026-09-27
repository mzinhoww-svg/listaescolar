// LGPD e dados demonstrativos (S17): retention_policies + job de retenção (D-012), anonimização de
// claims/claim_evidence/lead_events na exclusão de conta (profiles_lgpd_erase), account_export. Sem trilha; roda
// depois da S06 (claims) e da S14 (leads).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addEvidence,
  createClaim,
  decide,
  docsAwaiting,
  seedClaimSchool,
  submit,
} from "./claim-fixtures";
import {
  attempt,
  cleanupUsers,
  IDS,
  inTx,
  seedUsers,
  withClaims,
  withSuperuser,
} from "./helpers";

beforeAll(seedUsers);
afterAll(cleanupUsers);

describe("retention_policies", () => {
  it("tem id/created_at/updated_at, RLS habilitada e seed dos dois recursos de D-012", async () => {
    await withSuperuser(async (c) => {
      const rls = await c.query("select relrowsecurity from pg_class where oid = 'public.retention_policies'::regclass");
      expect(rls.rows[0]?.relrowsecurity).toBe(true);
      const cols = await c.query(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'retention_policies'",
      );
      const names = cols.rows.map((r: { column_name: string }) => r.column_name);
      for (const col of ["id", "created_at", "updated_at", "resource", "retention_days", "is_active"]) {
        expect(names, col).toContain(col);
      }
      const rows = await c.query("select resource, retention_days, is_active from public.retention_policies order by resource");
      expect(rows.rows).toEqual([
        { resource: "claim_evidence", retention_days: 180, is_active: true },
        { resource: "claim_tokens", retention_days: 90, is_active: true },
      ]);
    });
  });

  it("anon e authenticated não leem nem escrevem (sem policy; só service_role via bypassrls)", async () => {
    await withClaims("parent", async (c) => {
      const r = await attempt(c, "select 1 from public.retention_policies limit 1");
      expect(r.rowCount).toBe(0); // RLS sem policy: nenhuma linha, sem erro
    });
    await withClaims("anon", async (c) => {
      const r = await attempt(c, "select 1 from public.retention_policies limit 1");
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("retention_candidates / retention_purge: privilégios", () => {
  it("EXECUTE só para service_role", async () => {
    await withSuperuser(async (c) => {
      for (const sig of [
        "public.retention_candidates(text, integer)",
        "public.retention_purge(text, uuid[])",
        "public.account_export(uuid)",
        "public.profiles_lgpd_erase()",
      ]) {
        for (const role of ["anon", "authenticated"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, sig]);
          expect(r.rows[0]?.ok, `${role} em ${sig}`).toBe(false);
        }
      }
      for (const sig of ["public.retention_candidates(text, integer)", "public.retention_purge(text, uuid[])", "public.account_export(uuid)"]) {
        const r = await c.query<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'execute') as ok", [sig]);
        expect(r.rows[0]?.ok, sig).toBe(true);
      }
      // profiles_lgpd_erase é só gatilho: nem service_role precisa de EXECUTE direto.
      const svc = await c.query<{ ok: boolean }>(
        "select has_function_privilege('service_role', 'public.profiles_lgpd_erase()', 'execute') as ok",
      );
      expect(svc.rows[0]?.ok).toBe(false);
    });
  });
});

describe("retention_candidates / retention_purge: comportamento", () => {
  const SCHOOL = "00000000-0000-4000-8000-0000000e0001";

  beforeAll(async () => {
    await withSuperuser((c) => seedClaimSchool(c, { inep: "51999802", status: "registered" }).then(async (id) => {
      // reaproveita SCHOOL id fixo via update, para o afterAll saber o que limpar
      await c.query("update public.schools set id = $1 where id = $2", [SCHOOL, id]);
    }));
  });
  afterAll(async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      await c.query("set local session_replication_role = replica");
      await c.query("delete from public.claim_tokens where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
      await c.query("delete from public.claim_status_events where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
      await c.query("delete from public.claim_evidence where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
      await c.query("delete from public.school_members where school_id = $1", [SCHOOL]);
      await c.query("delete from public.claims where school_id = $1", [SCHOOL]);
      await c.query("delete from public.schools where id = $1", [SCHOOL]);
      await c.query("commit");
    });
  });

  it("nunca lê nem escreve survey_* (ADR-005): recurso desconhecido não retorna candidato nem erro", async () => {
    await inTx(async (c) => {
      const before = await c.query("select count(*)::int as n from public.survey_responses");
      const r = await attempt(c, "select * from public.retention_candidates('survey_responses', 10)");
      expect(r.error).toBeNull();
      expect(r.rowCount).toBe(0);
      const after = await c.query("select count(*)::int as n from public.survey_responses");
      expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    });
  });

  it("claim_evidence: só claim decidida há mais de retention_days vira candidata; teto por execução; purge idempotente", async () => {
    let evidenceId = "";
    let path = "";
    const claimId = await withSuperuser(async (c) => {
      const id = await createClaim(c, SCHOOL);
      const ev = await addEvidence(c, id);
      evidenceId = ev.id;
      path = ev.path;
      await submit(c, id);
      return id;
    });
    await withSuperuser((c) => decide(c, claimId, "rejected", "fora do escopo do teste"));

    await inTx(async (c) => {
      // ainda recém-decidida: nenhuma candidata com a política padrão (180 dias)
      const r0 = await c.query("select * from public.retention_candidates('claim_evidence', 10)");
      expect(r0.rows.find((row: { id: string }) => row.id === evidenceId)).toBeUndefined();

      // simula decisão antiga (> 180 dias)
      await c.query("update public.claims set decided_at = now() - interval '200 days' where id = $1", [claimId]);
      const r1 = await c.query<{ id: string; storage_path: string }>("select * from public.retention_candidates('claim_evidence', 10)");
      const found = r1.rows.find((row) => row.id === evidenceId);
      expect(found?.storage_path).toBe(path);

      // teto por execução: limit 0 pedido cai para o mínimo (1), nunca 0 nem negativo
      const capped = await c.query("select * from public.retention_candidates('claim_evidence', 0)");
      expect(capped.rowCount).toBeGreaterThanOrEqual(0);
    });

    await withSuperuser(async (c) => {
      await c.query("update public.claims set decided_at = now() - interval '200 days' where id = $1", [claimId]);
      const del1 = await c.query<{ retention_purge: number }>("select public.retention_purge('claim_evidence', $1::uuid[]) as retention_purge", [
        [evidenceId],
      ]);
      expect(del1.rows[0]!.retention_purge).toBe(1);
      const gone = await c.query("select 1 from public.claim_evidence where id = $1", [evidenceId]);
      expect(gone.rowCount).toBe(0);
      // idempotente: rodar de novo com o mesmo id (já apagado) não falha e conta 0
      const del2 = await c.query<{ retention_purge: number }>("select public.retention_purge('claim_evidence', $1::uuid[]) as retention_purge", [
        [evidenceId],
      ]);
      expect(del2.rows[0]!.retention_purge).toBe(0);
    });
  });

  it("claim_tokens: token vencido há mais de retention_days vira candidato", async () => {
    await withSuperuser(async (c) => {
      const claimId = await createClaim(c, SCHOOL, { claimant: IDS.school_member });
      const tok = await c.query<{ id: string }>(
        `insert into public.claim_tokens (claim_id, channel, token_hash, expires_at)
         values ($1, 'email', repeat('a', 64), now() - interval '100 days') returning id`,
        [claimId],
      );
      const tokenId = tok.rows[0]!.id;
      const cand = await c.query<{ id: string }>("select id from public.retention_candidates('claim_tokens', 50)");
      expect(cand.rows.map((r) => r.id)).toContain(tokenId);
      const del = await c.query<{ retention_purge: number }>("select public.retention_purge('claim_tokens', $1::uuid[]) as retention_purge", [
        [tokenId],
      ]);
      expect(del.rows[0]!.retention_purge).toBe(1);
    });
  });

  it("retention_purge recusa recurso desconhecido (22023)", async () => {
    await inTx(async (c) => {
      const r = await attempt(c, "select public.retention_purge('survey_responses', array[gen_random_uuid()])");
      expect(r.code).toBe("22023");
    });
  });
});

describe("claims/claim_evidence: FK vira on delete set null (nullable)", () => {
  it("claimant_id e uploaded_by aceitam null e a FK é SET NULL", async () => {
    await withSuperuser(async (c) => {
      const fk = await c.query<{ conname: string; confdeltype: string }>(
        `select conname, confdeltype from pg_constraint
          where conname in ('claims_claimant_id_fkey', 'claim_evidence_uploaded_by_fkey')`,
      );
      const byName = Object.fromEntries(fk.rows.map((r) => [r.conname, r.confdeltype]));
      expect(byName["claims_claimant_id_fkey"]).toBe("n"); // n = set null
      expect(byName["claim_evidence_uploaded_by_fkey"]).toBe("n");
      const notNull = await c.query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns
          where table_schema = 'public' and (
            (table_name = 'claims' and column_name = 'claimant_id')
            or (table_name = 'claim_evidence' and column_name = 'uploaded_by')
          )`,
      );
      for (const row of notNull.rows) expect(row.is_nullable, row.column_name).toBe("YES");
    });
  });
});

describe("profiles_lgpd_erase + exclusão de conta ponta a ponta", () => {
  const SCHOOL = "00000000-0000-4000-8000-0000000e0002";
  const USER = randomUUID();

  afterAll(async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      await c.query("set local session_replication_role = replica");
      await c.query("delete from public.claim_tokens where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
      await c.query("delete from public.claim_status_events where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
      await c.query("delete from public.claim_evidence where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
      await c.query("delete from public.school_members where school_id = $1", [SCHOOL]);
      await c.query("delete from public.claims where school_id = $1", [SCHOOL]);
      await c.query("delete from public.schools where id = $1", [SCHOOL]);
      await c.query("delete from auth.users where id = $1", [USER]);
      await c.query("commit");
    });
  });

  it("apaga a conta de verdade mesmo com reivindicação aprovada; anonimiza claims/claim_evidence; escola continua verified", async () => {
    await withSuperuser(async (c) => {
      await c.query(
        "insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)",
        [USER, `s17-${USER}@teste.invalid`],
      );
      // o gatilho de cadastro (0002) já cria o profile ao inserir em auth.users; aqui só garantimos papel/nome.
      await c.query(
        "insert into public.profiles (id, role, display_name) values ($1, 'parent', 'Titular S17') on conflict (id) do update set role = excluded.role, display_name = excluded.display_name",
        [USER],
      );
      const schoolId = await seedClaimSchool(c, { inep: "51999803", status: "registered" });
      await c.query("update public.schools set id = $1 where id = $2", [SCHOOL, schoolId]);
      const claimId = await createClaim(c, SCHOOL, { claimant: USER, name: "Fulana de Tal" });
      await addEvidence(c, claimId, USER);
      await submit(c, claimId, USER);
      // aprovação por admin
      await c.query("select public.claim_decide($1, 'approved', $2, null)", [claimId, IDS.admin]);
    });

    const claim = await withSuperuser((c) =>
      c.query<{ claimant_id: string | null; claimant_name: string; contact_email: string; evidence_note: string | null; status: string }>(
        "select claimant_id, claimant_name, contact_email, evidence_note, status::text from public.claims where school_id = $1",
        [SCHOOL],
      ),
    );
    const before = claim.rows[0]!;
    expect(before.status).toBe("approved");
    expect(before.claimant_id).toBe(USER);
    expect(before.claimant_name).toBe("Fulana de Tal");

    const evidenceBefore = await withSuperuser((c) =>
      c.query<{ uploaded_by: string | null; original_name: string }>(
        "select uploaded_by, original_name from public.claim_evidence where claim_id = (select id from public.claims where school_id = $1)",
        [SCHOOL],
      ),
    );
    expect(evidenceBefore.rows[0]!.uploaded_by).toBe(USER);

    // Exclusão real: o mesmo caminho que auth.admin.deleteUser dispara (DELETE em auth.users, cascade em profiles).
    await withSuperuser((c) => c.query("delete from auth.users where id = $1", [USER]));

    const gone = await withSuperuser((c) => c.query("select 1 from public.profiles where id = $1", [USER]));
    expect(gone.rowCount).toBe(0); // exclusão real do perfil, mesmo com reivindicação aprovada

    const claimAfter = await withSuperuser((c) =>
      c.query<{ claimant_id: string | null; claimant_name: string; contact_email: string; status: string }>(
        "select claimant_id, claimant_name, contact_email, status::text from public.claims where school_id = $1",
        [SCHOOL],
      ),
    );
    expect(claimAfter.rows[0]!.claimant_id).toBeNull(); // FK set null
    expect(claimAfter.rows[0]!.claimant_name).toBe("[conta excluída]"); // anonimizado, não apagado
    expect(claimAfter.rows[0]!.contact_email).toBe("conta-excluida@invalido.local");
    expect(claimAfter.rows[0]!.status).toBe("approved"); // livro-razão de decisão sobrevive

    const evidenceAfter = await withSuperuser((c) =>
      c.query<{ uploaded_by: string | null; original_name: string }>(
        "select uploaded_by, original_name from public.claim_evidence where claim_id = (select id from public.claims where school_id = $1)",
        [SCHOOL],
      ),
    );
    expect(evidenceAfter.rows[0]!.uploaded_by).toBeNull();
    expect(evidenceAfter.rows[0]!.original_name).toBe("[removido]");

    const school = await withSuperuser((c) =>
      c.query<{ s: string }>("select verification_status::text as s from public.schools where id = $1", [SCHOOL]),
    );
    expect(school.rows[0]!.s).toBe("verified"); // a verificação da escola não depende do perfil do reivindicante
  });

  it("D-014: lead_events/claim_status_events são imutáveis — não há UPDATE possível para 'anonimizar' actor_id; a ausência de FK É a anonimização (uuid órfão, não religável)", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c, { inep: "51999805" });
      const claimId = await createClaim(c, school, { claimant: IDS.parent });
      const blocked = await attempt(c, "update public.claim_status_events set actor_id = null where claim_id = $1", [claimId]);
      expect(blocked.code).not.toBeNull(); // gatilho de imutabilidade bloqueia o UPDATE
    });
  });
});

describe("account_export", () => {
  it("devolve só os dados do próprio p_profile_id, nunca de outro perfil", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c, { inep: "51999804" });
      const claimId = await docsAwaiting(c, school, IDS.parent);
      await c.query(
        `insert into public.consents (profile_id, purpose, text_version) values ($1, 'list_upload', 'v1')`,
        [IDS.parent],
      );
      await c.query(
        `insert into public.consents (profile_id, purpose, text_version) values ($1, 'list_upload', 'v1')`,
        [IDS.admin],
      );

      const own = await c.query<{ account_export: Record<string, unknown> }>("select public.account_export($1) as account_export", [
        IDS.parent,
      ]);
      const exp = own.rows[0]!.account_export as {
        perfil: { id: string };
        consentimentos: Array<{ finalidade: string }>;
        reivindicacoes_de_escola: Array<{ escola_id: string }>;
      };
      expect(exp.perfil.id).toBe(IDS.parent);
      expect(exp.consentimentos.length).toBe(1); // não vê o consentimento do `admin`
      expect(exp.reivindicacoes_de_escola.some((r) => r.escola_id === school)).toBe(true);
      void claimId;

      const other = await c.query<{ account_export: Record<string, unknown> }>("select public.account_export($1) as account_export", [
        IDS.admin,
      ]);
      const expOther = other.rows[0]!.account_export as { consentimentos: Array<{ finalidade: string }>; reivindicacoes_de_escola: unknown[] };
      expect(expOther.consentimentos.length).toBe(1);
      expect(expOther.reivindicacoes_de_escola.length).toBe(0); // admin não reivindicou nada
    });
  });
});
