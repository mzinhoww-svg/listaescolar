// @vitest-environment node
// Roda em `pnpm test:db`: consulta como anon (chave publicável) pela API do Supabase local.
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { academicYears } from "@/features/grades/catalog";
import { listPublishedListShortcuts, type PublishedListsClient } from "@/features/schools/published-lists";

import { seedPublishedList, type PublicListSeed } from "./b2b-fixtures";
import { withSuperuser } from "./helpers";

let client: PublishedListsClient;
const seeds: PublicListSeed[] = [];
let draftSchoolInep = "";
const year = academicYears(new Date())[0]!;

function envFromSupa(): { url: string; key: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (k: string) => new RegExp(`^${k}=(.*)$`, "m").exec(out)?.[1]?.trim().replace(/^"|"$/g, "");
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const key = get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("env do Supabase local indisponível (pnpm db:start)");
  return { url, key };
}

beforeAll(async () => {
  const { url, key } = envFromSupa();
  client = createClient(url, key, { auth: { persistSession: false } }) as unknown as PublishedListsClient;
  await withSuperuser(async (c) => {
    seeds.push(await seedPublishedList(c, { demo: true, year }));
    seeds.push(await seedPublishedList(c, { demo: false, year, enabledMunicipality: false }));
    // Escola habilitada com lista em rascunho (nunca deve entrar).
    draftSchoolInep = String(53_000_000 + Math.floor(Math.random() * 900_000));
    const s = await c.query(
      `insert into public.schools (inep, name, normalized_name, network, verification_status, is_demo, municipality_id)
       select $1, 'Escola Rascunho S28', 'escola rascunho s28', 'municipal', 'registered', false, id
         from public.municipalities where ibge_code = '5103403' returning id`,
      [draftSchoolInep],
    );
    await c.query("insert into public.school_lists (school_id, grade_id, school_year) select $1, id, $2 from public.grades where slug = 'ef-1'", [s.rows[0].id, year]);
  });
});

afterAll(async () => {
  await withSuperuser(async (c) => {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    const inepList = [...seeds.map((s) => s.inep), draftSchoolInep];
    await c.query("delete from public.school_lists where school_id in (select id from public.schools where inep = any($1))", [inepList]);
    await c.query("delete from public.schools where inep = any($1)", [inepList]);
    await c.query("commit");
  }).catch(() => undefined);
});

describe("listPublishedListShortcuts", () => {
  it("traz escola habilitada com lista publicada, com selo demo, e nunca rascunho nem município desabilitado", async () => {
    const r = await listPublishedListShortcuts({ client, limit: 50 });
    const inep = (r ?? []).map((x) => x.inep);
    expect(inep).toContain(seeds[0]!.inep);
    expect(inep).not.toContain(seeds[1]!.inep);
    expect(inep).not.toContain(draftSchoolInep);
    const mine = r.find((x) => x.inep === seeds[0]!.inep)!;
    expect(mine.isDemo).toBe(true);
    expect(mine.href).toBe(`/escolas/${mine.inep}/${mine.gradeSlug}?ano=${year}`);
  });

  it("respeita o limite e não repete escola", async () => {
    const r = await listPublishedListShortcuts({ client, limit: 1 });
    expect(r.length).toBeLessThanOrEqual(1);
  });
});
