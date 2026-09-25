/**
 * Semeia listas demonstrativas (is_demo = true) nas escolas demo de Cuiabá. Idempotente por chave natural
 * (escola, série, ano): lista existente é ignorada. Exige `pnpm import:inep tests/fixtures/inep-demo.csv --demo` antes.
 * Uso: pnpm seed:demo-lists [--i-know-this-is-production]
 * Exige NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY; só roda em banco local ou no staging.
 */
import { createClient } from "@supabase/supabase-js";

import { defaultAcademicYear } from "@/features/grades/catalog";
import { createListsRepository } from "@/features/lists/repository";

import { assertSafeTarget } from "./import-inep-lib";
import { DEMO_ACTOR_ID, DEMO_LIST_PLANS, parseSeedArgs } from "./seed-demo-lists-lib";

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente.");
  assertSafeTarget(url, args);

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const repo = createListsRepository(client);
  const year = defaultAcademicYear(new Date());
  const actorId = DEMO_ACTOR_ID;
  let created = 0;
  let skipped = 0;

  for (const plan of DEMO_LIST_PLANS) {
    const { data: school, error: se } = await client.from("schools").select("id, is_demo").eq("inep", plan.inep).maybeSingle();
    if (se) throw new Error(`Consulta de escola falhou (${se.code})`);
    if (!school?.is_demo) throw new Error(`Escola demo ${plan.inep} não encontrada: rode o import:inep --demo antes.`);
    const { data: grade, error: ge } = await client.from("grades").select("id").eq("slug", plan.gradeSlug).maybeSingle();
    if (ge || !grade) throw new Error(`Série ${plan.gradeSlug} não encontrada.`);
    const { data: existing, error: le } = await client
      .from("school_lists")
      .select("id")
      .eq("school_id", school.id)
      .eq("grade_id", grade.id)
      .eq("school_year", year)
      .maybeSingle();
    if (le) throw new Error(`Consulta de lista falhou (${le.code})`);
    if (existing) {
      skipped++;
      continue;
    }

    const listId = await repo.createDraftList({ schoolId: school.id, gradeId: grade.id, schoolYear: year, isDemo: true });
    const [first, ...rest] = plan.versions;
    if (!first) continue;
    const v1 = await repo.createCandidateVersion({ listId, source: "admin" });
    await repo.addItems(v1.versionId, first);
    for (const to of ["submitted", "processing", "approved"] as const) await repo.transition({ listId, to, actorId });
    if (plan.publish) {
      await repo.approveVersion({ listId, versionId: v1.versionId, actorId });
      await repo.publishVersion({ listId, versionId: v1.versionId, actorId });
      for (const items of rest) {
        const v = await repo.createCandidateVersion({ listId, source: "admin" });
        await repo.addItems(v.versionId, items);
        await repo.approveVersion({ listId, versionId: v.versionId, actorId });
        await repo.publishVersion({ listId, versionId: v.versionId, actorId });
      }
    }
    created++;
  }
  console.log(`Ano letivo ${year} · listas criadas ${created} · já existiam ${skipped}`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
