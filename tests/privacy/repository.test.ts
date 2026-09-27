// Job de retenção (D-012, S17) ponta a ponta: roda em `pnpm test:db` contra o Supabase local (Storage real,
// função de banco real via HTTP). O comportamento das funções SQL (`retention_candidates`/`retention_purge`) já
// está coberto em `tests/db/lgpd-privacy.test.ts`; aqui cobrimos a orquestração de `runRetention` (Storage +
// banco, ordem, idempotência).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteAccount, exportAccountData, getDeletionBlockers } from "@/features/privacy/repository";
import { runRetention } from "@/features/privacy/retention";

import { addEvidence, createClaim, decide, seedClaimSchool, submit } from "../db/claim-fixtures";
import { cleanupUsers, seedStationery, seedUsers, withSuperuser } from "../db/helpers";

function localEnv(): { url: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("só roda contra Supabase local");
  return { url, secret: get("SUPABASE_SECRET_KEY") };
}

const SCHOOL = "00000000-0000-4000-8000-0000000f0002";
let admin: SupabaseClient;

beforeAll(async () => {
  const env = localEnv();
  admin = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  await seedUsers();
});
afterAll(cleanupUsers);

afterAll(async () => {
  await withSuperuser(async (c) => {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    await c.query("delete from public.school_members where school_id = $1", [SCHOOL]);
    await c.query("delete from public.claim_tokens where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
    await c.query("delete from public.claim_status_events where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
    await c.query("delete from public.claim_evidence where claim_id in (select id from public.claims where school_id = $1)", [SCHOOL]);
    await c.query("delete from public.claims where school_id = $1", [SCHOOL]);
    await c.query("delete from public.schools where id = $1", [SCHOOL]);
    await c.query("commit");
  });
});

describe("runRetention", () => {
  it("remove evidência vencida do Storage e do banco; idempotente", async () => {
    const { claimId, evidenceId, path } = await withSuperuser(async (c) => {
      const schoolId = await seedClaimSchool(c, { inep: "51999806", status: "registered" });
      await c.query("update public.schools set id = $1 where id = $2", [SCHOOL, schoolId]);
      const claim = await createClaim(c, SCHOOL);
      const ev = await addEvidence(c, claim);
      await submit(c, claim);
      await decide(c, claim, "rejected", "teste de retenção (D-012)");
      await c.query("update public.claims set decided_at = now() - interval '200 days' where id = $1", [claim]);
      return { claimId: claim, evidenceId: ev.id, path: ev.path };
    });

    const up = await admin.storage.from("claim-evidence").upload(path, new Uint8Array([1, 2, 3, 4]), {
      upsert: true,
      contentType: "application/pdf",
    });
    expect(up.error).toBeNull();
    const before = await admin.storage.from("claim-evidence").list(claimId);
    expect(before.data?.length ?? 0).toBeGreaterThan(0);

    const outcomes = await runRetention(admin, 50);
    const evidenceOutcome = outcomes.find((o) => o.resource === "claim_evidence");
    expect(evidenceOutcome?.purged).toBeGreaterThanOrEqual(1);
    expect(evidenceOutcome?.storageFailed).toBe(0);

    const after = await admin.storage.from("claim-evidence").list(claimId);
    expect(after.data?.length ?? 0).toBe(0); // objeto removido de verdade, não só a linha

    const row = await withSuperuser((c) => c.query("select 1 from public.claim_evidence where id = $1", [evidenceId]));
    expect(row.rowCount).toBe(0);

    // idempotente: rodar de novo não acha mais candidato nem falha
    const again = await runRetention(admin, 50);
    expect(again.find((o) => o.resource === "claim_evidence")?.purged).toBe(0);
  });

  it("nunca toca survey_* (ADR-005)", async () => {
    const before = await withSuperuser((c) => c.query<{ n: number }>("select count(*)::int as n from public.survey_responses"));
    await runRetention(admin, 50);
    const after = await withSuperuser((c) => c.query<{ n: number }>("select count(*)::int as n from public.survey_responses"));
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});

describe("exportAccountData / deleteAccount", () => {
  const PASSWORD = "senha-de-teste-local-s17-123";
  const userIds: string[] = [];

  afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  });

  it("exportAccountData devolve só os dados do próprio perfil", async () => {
    const email = `s17-export-${Date.now()}@teste.invalid`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
    const userId = created.data.user.id;
    userIds.push(userId);

    await withSuperuser((c) =>
      c.query("insert into public.consents (profile_id, purpose, text_version) values ($1, 'list_upload', 'v1')", [userId]),
    );

    const data = await exportAccountData(admin, userId);
    expect((data.perfil as { id: string }).id).toBe(userId);
    expect((data.consentimentos as unknown[]).length).toBe(1);
  });

  it("deleteAccount remove o usuário de auth.users de verdade; idempotente sobre perfil já excluído", async () => {
    const email = `s17-delete-${Date.now()}@teste.invalid`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
    const userId = created.data.user.id;

    await deleteAccount(admin, userId);

    const gone = await withSuperuser((c) => c.query("select 1 from auth.users where id = $1", [userId]));
    expect(gone.rowCount).toBe(0);

    // idempotente: excluir de novo (perfil já não existe) não lança (404 é tratado como sucesso)
    await expect(deleteAccount(admin, userId)).resolves.toBeUndefined();
  });

  it("dono de papelaria ativa: deleteAccount recusa ANTES de tentar qualquer coisa (revisão de segurança)", async () => {
    const email = `s17-blocked-${Date.now()}@teste.invalid`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
    const userId = created.data.user.id;
    let stationeryId = "";
    try {
      stationeryId = await withSuperuser((c) => seedStationery(c, { status: "active", ownerId: userId }));

      const blockers = await getDeletionBlockers(admin, userId);
      expect(blockers).toContain("stationery_owner_active");
      await expect(deleteAccount(admin, userId)).rejects.toMatchObject({ code: "stationery_owner_active" });

      // não tentou nada: o perfil continua existindo
      const still = await withSuperuser((c) => c.query("select 1 from auth.users where id = $1", [userId]));
      expect(still.rowCount).toBe(1);
    } finally {
      await withSuperuser(async (c) => {
        await c.query("begin");
        await c.query("set local session_replication_role = replica");
        await c.query("delete from public.stationery_members where stationery_id = $1", [stationeryId]);
        await c.query("delete from public.stationeries where id = $1", [stationeryId]);
        await c.query("commit");
      });
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });
});
