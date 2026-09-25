/**
 * Semeia reivindicações demonstrativas (is_demo herdado da escola) nas escolas demo de Cuiabá: uma pendente por
 * documentos (com o PDF fictício no bucket privado) e uma recusada com motivo, de contas @listacerta.test.
 * NUNCA aprova. Idempotente: pedido existente só vale se o estado bate com o plano; senão erro claro.
 * Exige `pnpm import:inep tests/fixtures/inep-demo.csv --demo` antes e as contas do supabase/seed.sql.
 * Uso: pnpm seed:demo-claims (sem opções; não há flag para produção). Só roda em banco local ou no staging.
 */
import { readFile } from "node:fs/promises";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseEvidenceStorage } from "@/features/claims/evidence-storage";
import { sanitizeFileName, sniffEvidence } from "@/features/claims/files";
import { PRIVACY_TEXT_VERSION } from "@/features/claims/schemas";

import { assertSafeTarget } from "./import-inep-lib";
import {
  DEMO_ADMIN_EMAIL,
  DEMO_CLAIMANT_EMAIL,
  DEMO_CLAIM_PLANS,
  DEMO_EVIDENCE_FIXTURE,
  assertExistingClaimMatches,
  assertTestAccount,
  parseSeedArgs,
  type DemoClaimPlan,
} from "./seed-demo-claims-lib";

async function userIdByEmail(client: SupabaseClient, email: string): Promise<string> {
  assertTestAccount(email);
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error("Não foi possível listar usuários de teste.");
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`Conta ${email} não encontrada: rode o supabase/seed.sql (pnpm db:reset).`);
  return user.id;
}

async function createOne(client: SupabaseClient, plan: DemoClaimPlan, schoolId: string, claimantId: string, adminId: string, pdf: Uint8Array): Promise<void> {
  const storage = createSupabaseEvidenceStorage(client);
  const sniff = sniffEvidence(pdf, "application/pdf");
  if (!sniff.ok) throw new Error(`Fixture de evidência inválida (${sniff.reason}).`);
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn} falhou (${error.code})`);
    return data;
  };
  const claimId = String(
    await rpc("claim_create", {
      p_school_id: schoolId,
      p_claimant_id: claimantId,
      p_method: "documents",
      p_claimant_name: plan.claimantName,
      p_claimant_role_title: plan.claimantRoleTitle,
      p_evidence_note: plan.evidenceNote,
      p_privacy_text_version: PRIVACY_TEXT_VERSION,
    }),
  );
  const path = `${claimId}/${crypto.randomUUID()}.${sniff.ext}`;
  await storage.put(path, pdf, sniff.mime);
  await rpc("claim_add_evidence", {
    p_claim_id: claimId,
    p_actor_id: claimantId,
    p_storage_path: path,
    p_mime_type: sniff.mime,
    p_size_bytes: sniff.size,
    p_sha256: sniff.sha256,
    p_original_name: sanitizeFileName("comprovante-demo.pdf"),
  });
  await rpc("claim_submit_for_review", { p_claim_id: claimId, p_actor_id: claimantId, p_evidence_note: null });
  if (plan.expected === "rejected") {
    await rpc("claim_decide", { p_claim_id: claimId, p_to: "rejected", p_actor_id: adminId, p_reason: plan.rejectionReason ?? null });
  }
}

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente.");
  assertSafeTarget(url, { allowProduction: args.allowProduction });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const claimantId = await userIdByEmail(client, DEMO_CLAIMANT_EMAIL);
  const adminId = await userIdByEmail(client, DEMO_ADMIN_EMAIL);
  const pdf = new Uint8Array(await readFile(DEMO_EVIDENCE_FIXTURE));
  let created = 0;
  let skipped = 0;
  for (const plan of DEMO_CLAIM_PLANS) {
    const { data: school, error: se } = await client.from("schools").select("id, is_demo").eq("inep", plan.inep).maybeSingle();
    if (se) throw new Error(`Consulta de escola falhou (${se.code})`);
    if (!school?.is_demo) throw new Error(`Escola demo ${plan.inep} não encontrada: rode o import:inep --demo antes.`);
    const { data: existing, error: ce } = await client
      .from("claims")
      .select("id, status, decision_reason")
      .eq("school_id", school.id)
      .eq("claimant_id", claimantId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (ce) throw new Error(`Consulta de reivindicação falhou (${ce.code})`);
    const row = existing?.[0];
    if (row) {
      const { count, error: ee } = await client.from("claim_evidence").select("id", { count: "exact", head: true }).eq("claim_id", row.id);
      if (ee) throw new Error(`Consulta de evidências falhou (${ee.code})`);
      assertExistingClaimMatches(plan, { status: String(row.status), evidenceCount: count ?? 0, decisionReason: row.decision_reason });
      skipped++;
      continue;
    }
    await createOne(client, plan, school.id, claimantId, adminId, pdf);
    created++;
  }
  console.log(`Reivindicações demo criadas ${created} · já existiam ${skipped}`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
