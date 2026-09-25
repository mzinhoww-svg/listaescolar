// @vitest-environment node
// Roda em `pnpm test:db`: consulta o banco real como anon, pela API (PostgREST), com a chave publicável.
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDefaultMunicipalityId, getSchoolByInep, searchSchools, type PublicClient } from "@/features/schools/search/repository";
import { parseSearchParams } from "@/features/schools/search/params";
import { withSuperuser } from "../../db/helpers";

const ENABLED_IBGE = "5103403";
const DISABLED_IBGE = "5208707";
const PFX = "5199";
const EMAIL = "secreto-s04t2@escola.example";
// [inep, nome, normalizado, rede, status, ibge, demo]
const SCHOOLS: [string, string, string, string, string, string, boolean][] = [
  ["51990001", "Escola Municipal Zeferino Vaz S04", "escola municipal zeferino vaz s04", "municipal", "registered", ENABLED_IBGE, false],
  ["51990002", "Colégio Zeferino Particular S04", "colegio zeferino particular s04", "private", "verified", ENABLED_IBGE, false],
  ["51990003", "Escola Zeferino Demo S04", "escola zeferino demo s04", "state", "claimed", ENABLED_IBGE, true],
  ["51990004", "Escola Zeferino Oculta S04", "escola zeferino oculta s04", "municipal", "verified", DISABLED_IBGE, false],
];

let client: PublicClient;
let enabledId: string;

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
  client = createClient(url, key, { auth: { persistSession: false } });
  await withSuperuser(async (c) => {
    await c.query("delete from public.schools where inep like $1", [`${PFX}%`]);
    await c.query(
      `insert into public.municipalities (ibge_code, uf, name, is_enabled) values ($1,'GO','Goiânia',false) on conflict do nothing`,
      [DISABLED_IBGE],
    );
    const m = await c.query("select id from public.municipalities where ibge_code = $1", [ENABLED_IBGE]);
    enabledId = m.rows[0].id;
    for (const [inep, name, norm, network, status, ibge, demo] of SCHOOLS) {
      await c.query(
        `insert into public.schools (inep, name, normalized_name, network, verification_status, is_demo, email, phone, municipality_id)
         select $1,$2,$3,$4::public.school_network,$5::public.verification_status,$6,$7,'6533334444',id
           from public.municipalities where ibge_code = $8`,
        [inep, name, norm, network, status, demo, EMAIL, ibge],
      );
    }
  });
});

afterAll(async () => {
  await withSuperuser(async (c) => {
    await c.query("delete from public.schools where inep like $1", [`${PFX}%`]);
    await c.query(
      `delete from public.municipalities m where m.ibge_code = $1
         and not exists (select 1 from public.schools s where s.municipality_id = m.id)`,
      [DISABLED_IBGE],
    );
  });
});

describe("searchSchools (banco real, anon)", () => {
  it("encontra por nome, com total do banco, sem escola de município desabilitado", async () => {
    const r = await searchSchools(parseSearchParams({ q: "zeferino s04" }), { client });
    expect(r.kind).toBe("results");
    if (r.kind !== "results") return;
    const ineps = r.schools.map((s) => s.inep).sort();
    expect(ineps).toEqual(["51990001", "51990002", "51990003"]);
    expect(r.total).toBe(3);
    expect(r.pageCount).toBe(1);
    expect(r.schools.find((s) => s.inep === "51990003")?.isDemo).toBe(true);
  });

  it("página fora do intervalo é distinta de busca vazia", async () => {
    const out = await searchSchools(parseSearchParams({ q: "zeferino s04", pagina: "2" }), { client });
    expect(out).toEqual({ kind: "page_out_of_range", page: 2 });
    const empty = await searchSchools(parseSearchParams({ q: "nadaencontrado zzzz" }), { client });
    expect(empty).toMatchObject({ kind: "results", total: 0, schools: [] });
  });

  it("erro de digitação e filtro de rede", async () => {
    const r = await searchSchools(parseSearchParams({ q: "Zeferno", rede: "privada" }), { client });
    if (r.kind !== "results") throw new Error("esperava results");
    expect(r.schools.map((s) => s.inep)).toEqual(["51990002"]);
  });

  it("município desabilitado pedido explicitamente não retorna nada", async () => {
    const { rows } = await withSuperuser((c) => c.query("select id from public.municipalities where ibge_code = $1", [DISABLED_IBGE]));
    const r = await searchSchools(parseSearchParams({ q: "zeferino oculta", municipio: rows[0].id }), { client });
    if (r.kind !== "results") throw new Error("esperava results");
    expect(r.schools).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("e-mail nunca retorna na lista", async () => {
    const r = await searchSchools(parseSearchParams({ q: "zeferino s04" }), { client });
    expect(JSON.stringify(r)).not.toContain(EMAIL);
    expect(JSON.stringify(r)).not.toMatch(/email|phone/i);
  });

  it("consulta hostil não erra nem lista tudo", async () => {
    for (const q of ["%", "_", "\\", "'; drop table schools;--", "😀"]) {
      const r = await searchSchools(parseSearchParams({ q }), { client });
      if (r.kind !== "results") throw new Error("esperava results");
      expect(r.schools).toEqual([]);
    }
  });

  it("INEP de 8 dígitos existente redireciona; inexistente vira busca vazia", async () => {
    expect(await searchSchools(parseSearchParams({ q: "51990001" }), { client })).toEqual({ kind: "redirect", inep: "51990001" });
    const miss = await searchSchools(parseSearchParams({ q: "51990004" }), { client }); // município desabilitado
    expect(miss).toMatchObject({ kind: "results", schools: [], total: 0 });
    const none = await searchSchools(parseSearchParams({ q: "12345678" }), { client });
    expect(none).toMatchObject({ kind: "results", schools: [], total: 0 });
  });

  it("padrão de município: primeiro habilitado, sem hardcode", async () => {
    expect(await getDefaultMunicipalityId({ client })).toBe(enabledId);
  });
});

describe("getSchoolByInep", () => {
  it("devolve perfil sem e-mail", async () => {
    const s = await getSchoolByInep("51990002", { client });
    expect(s).toMatchObject({
      inep: "51990002",
      name: "Colégio Zeferino Particular S04",
      network: "private",
      verificationStatus: "verified",
      isDemo: false,
      municipalityName: "Cuiabá",
      uf: "MT",
      phone: "6533334444",
    });
    expect(JSON.stringify(s)).not.toContain(EMAIL);
    expect(s).not.toHaveProperty("email");
  });

  it("município desabilitado e INEP inexistente/inválido dão null", async () => {
    expect(await getSchoolByInep("51990004", { client })).toBeNull();
    expect(await getSchoolByInep("00000000", { client })).toBeNull();
    expect(await getSchoolByInep("abc", { client })).toBeNull();
    expect(await getSchoolByInep("51990001' or 1=1", { client })).toBeNull();
  });
});
