import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupUsers, inTx, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

const DISABLED_IBGE = "5208707"; // Goiânia, desabilitada (fixture)
const dbRole = (who: Identity) => (who === "anon" ? "anon" : who === "system" ? "service_role" : "authenticated");

type Row = {
  id: string;
  inep: string;
  name: string;
  network: string;
  neighborhood: string | null;
  municipality_id: string;
  municipality_name: string;
  verification_status: string;
  is_demo: boolean;
  rank: number;
  total_count: string | number;
};

// [inep, nome, nome normalizado, rede, bairro, ibge]
const SCHOOLS: [string, string, string, string, string | null, string][] = [
  ["51900001", "Escola Municipal Professor Antônio Silva", "escola municipal professor antonio silva", "municipal", "Centro Sul", "5103403"],
  ["51900002", "Colégio Estadual Maria Auxiliadora", "colegio estadual maria auxiliadora", "state", "Jardim Tropical", "5103403"],
  ["51900003", "Colégio Objetivo Cuiabá", "colegio objetivo cuiaba", "private", "Goiabeiras", "5103403"],
  ["51900004", "Escola Federal Tecnológica", "escola federal tecnologica", "federal", "Coxipó", "5103403"],
  ["51900005", "Escola 100% Alegria", "escola 100 alegria", "private", "Centro Norte", "5103403"],
  ["51900006", "Colégio Objetivo Goiânia", "colegio objetivo goiania", "private", "Setor Oeste", DISABLED_IBGE],
  ["51900007", "Escola Municipal Antônio Silva Neto", "escola municipal antonio silva neto", "municipal", "Centro Sul", DISABLED_IBGE],
];

async function seed(c: Client, who: Identity): Promise<void> {
  await c.query("reset role");
  await c.query(
    `insert into public.municipalities (ibge_code, uf, name, is_enabled) values ($1, 'GO', 'Goiânia', false)
     on conflict do nothing`,
    [DISABLED_IBGE],
  );
  for (const [inep, name, norm, network, hood, ibge] of SCHOOLS) {
    await c.query(
      `insert into public.schools (inep, name, normalized_name, network, neighborhood, email, phone, address, municipality_id)
       select $1, $2, $3, $4::public.school_network, $5, 'secreto@escola.invalid', '65999990000', 'Rua Secreta 1', m.id
       from public.municipalities m where m.ibge_code = $6`,
      [inep, name, norm, network, hood, ibge],
    );
  }
  await c.query(`set local role ${dbRole(who)}`);
}

async function search(
  who: Identity,
  args: { q?: string | null; muni?: string | null; network?: string | null; hood?: string | null; limit?: number | null; offset?: number | null },
): Promise<Row[]> {
  return withClaims(who, async (c) => {
    await seed(c, who);
    return runSearch(c, args);
  });
}

async function runSearch(c: Client, a: Parameters<typeof search>[1]): Promise<Row[]> {
  const r = await c.query<Row>(
    `select * from public.search_schools($1::text, $2::uuid, $3::public.school_network, $4::text, $5::int, $6::int)`,
    [a.q ?? null, a.muni ?? null, a.network ?? null, a.hood ?? null, a.limit ?? null, a.offset ?? null],
  );
  return r.rows;
}

const names = (rows: Row[]) => rows.map((r) => r.name);

describe("search_schools: schema", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await withSuperuser((c) => c.query("delete from public.municipalities where ibge_code = $1", [DISABLED_IBGE]));
    await cleanupUsers();
  });

  it("pg_trgm e unaccent ficam no schema extensions", async () => {
    const r = await withSuperuser((c) =>
      c.query<{ extname: string; nspname: string }>(
        `select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
         where e.extname in ('pg_trgm', 'unaccent') order by 1`,
      ),
    );
    expect(r.rows).toEqual([
      { extname: "pg_trgm", nspname: "extensions" },
      { extname: "unaccent", nspname: "extensions" },
    ]);
  });

  it("índices GIN trigram e o índice (municipality_id, network) existem", async () => {
    const r = await withSuperuser((c) =>
      c.query<{ indexname: string; indexdef: string }>(
        `select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'schools'`,
      ),
    );
    const defs = r.rows.map((x) => x.indexdef);
    expect(defs.some((d) => /USING gin \(normalized_name (extensions\.)?gin_trgm_ops\)/.test(d))).toBe(true);
    expect(defs.some((d) => /USING gin/.test(d) && /neighborhood/.test(d) && /gin_trgm_ops/.test(d))).toBe(true);
    expect(defs.some((d) => /\(municipality_id, network\)/.test(d))).toBe(true);
  });

  it("função é SECURITY INVOKER, stable, search_path vazio, e não devolve email/phone/address", async () => {
    const r = await withSuperuser((c) =>
      c.query<{ prosecdef: boolean; provolatile: string; proconfig: string[] | null; cols: string[] }>(
        `select p.prosecdef, p.provolatile, p.proconfig,
                (select array_agg(a) from unnest(p.proargnames) a) as cols
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'search_schools'`,
      ),
    );
    expect(r.rows).toHaveLength(1);
    const f = r.rows[0]!;
    expect(f.prosecdef).toBe(false);
    expect(f.provolatile).toBe("s");
    expect(f.proconfig).toContain('search_path=""');
    for (const bad of ["email", "phone", "address", "cep"]) expect(f.cols).not.toContain(bad);
  });

  it("EXECUTE: anon, authenticated e service_role podem; public não", async () => {
    const r = await withSuperuser((c) =>
      c.query<{ a: boolean; u: boolean; s: boolean }>(
        `select has_function_privilege('anon', f, 'execute') a, has_function_privilege('authenticated', f, 'execute') u,
                has_function_privilege('service_role', f, 'execute') s
         from (select 'public.search_schools(text,uuid,public.school_network,text,int,int)'::regprocedure as f) x`,
      ),
    );
    expect(r.rows[0]).toEqual({ a: true, u: true, s: true });
  });
});

describe("search_schools: busca", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await withSuperuser((c) => c.query("delete from public.municipalities where ibge_code = $1", [DISABLED_IBGE]));
    await cleanupUsers();
  });

  it("por nome exato, sem acento e em outra caixa", async () => {
    for (const q of ["Professor Antônio Silva", "professor antonio silva", "PROFESSOR ANTONIO SILVA"]) {
      const rows = await search("anon", { q });
      expect(names(rows)[0], q).toBe("Escola Municipal Professor Antônio Silva");
    }
  });

  it("tolera erro de digitação", async () => {
    const rows = await search("anon", { q: "colegio objetivvo cuiaba" });
    expect(names(rows)[0]).toBe("Colégio Objetivo Cuiabá");
    const rows2 = await search("anon", { q: "maria auxiliadra" });
    expect(names(rows2)[0]).toBe("Colégio Estadual Maria Auxiliadora");
  });

  it("aceita palavra parcial/abreviada (prefixo)", async () => {
    const rows = await search("anon", { q: "prof antonio" });
    expect(names(rows)).toContain("Escola Municipal Professor Antônio Silva");
  });

  it("filtra por bairro (com acento diferente e erro leve)", async () => {
    expect(names(await search("anon", { hood: "coxipo" }))).toEqual(["Escola Federal Tecnológica"]);
    expect(names(await search("anon", { hood: "Jardim Tropical" }))).toEqual(["Colégio Estadual Maria Auxiliadora"]);
  });

  it("filtra por rede", async () => {
    const rows = await search("anon", { network: "private" });
    expect(names(rows).sort()).toEqual(["Colégio Objetivo Cuiabá", "Escola 100% Alegria"]);
  });

  it("filtra por município (habilitado) e combina filtros", async () => {
    const cuiaba = (await withSuperuser((c) => c.query<{ id: string }>("select id from public.municipalities where ibge_code = '5103403'"))).rows[0]!.id;
    const rows = await search("anon", { muni: cuiaba, network: "municipal" });
    expect(names(rows)).toEqual(["Escola Municipal Professor Antônio Silva"]);
    const rows2 = await search("anon", { q: "objetivo", muni: cuiaba });
    expect(names(rows2)).toEqual(["Colégio Objetivo Cuiabá"]);
  });

  it("ordena por similaridade e depois nome; rank é decrescente", async () => {
    const rows = await search("admin", { q: "escola municipal antonio silva" });
    const ranks = rows.map((r) => Number(r.rank));
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    expect(names(rows)).toEqual(
      expect.arrayContaining(["Escola Municipal Professor Antônio Silva", "Escola Municipal Antônio Silva Neto"]),
    );
    expect(names(rows).indexOf("Escola Municipal Antônio Silva Neto")).toBeLessThan(
      names(rows).indexOf("Escola Municipal Professor Antônio Silva"),
    );
  });

  it("colunas de retorno são as públicas seguras e total_count vem do banco", async () => {
    const rows = await search("anon", { network: "private" });
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ["id", "inep", "is_demo", "municipality_id", "municipality_name", "name", "neighborhood", "network", "rank", "total_count", "verification_status"].sort(),
    );
    expect(rows[0]!.municipality_name).toBe("Cuiabá");
    expect(rows.every((r) => Number(r.total_count) === 2)).toBe(true);
  });

  it("q nulo lista por filtros; sem filtro lista todas as visíveis", async () => {
    expect(await search("anon", { q: null, network: "federal" })).toHaveLength(1);
    const all = await search("anon", {});
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.every((r) => Number(r.rank) === 0)).toBe(true);
  });

  it("INEP não é pesquisado pela função", async () => {
    expect(await search("anon", { q: "51900001" })).toHaveLength(0);
  });
});

describe("search_schools: paginação e limites", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  async function bulk(fn: (c: Client) => Promise<Row[]>): Promise<Row[]> {
    return withClaims("anon", async (c) => {
      await c.query("reset role");
      await c.query(
        `insert into public.schools (inep, name, normalized_name, network, municipality_id)
         select lpad((70000000 + g)::text, 8, '0'), 'Escola Modelo ' || g, 'escola modelo ' || g, 'municipal', m.id
         from generate_series(1, 120) g, public.municipalities m where m.ibge_code = '5103403'`,
      );
      await c.query("set local role anon");
      return fn(c);
    });
  }

  it("limite máximo 50, padrão 20, mínimo 1; total_count ignora o limite", async () => {
    const big = await bulk((c) => runSearch(c, { limit: 1000 }));
    expect(big).toHaveLength(50);
    expect(Number(big[0]!.total_count)).toBeGreaterThanOrEqual(120);
    expect(await bulk((c) => runSearch(c, {}))).toHaveLength(20);
    expect(await bulk((c) => runSearch(c, { limit: 0 }))).toHaveLength(1);
    expect(await bulk((c) => runSearch(c, { limit: -5 }))).toHaveLength(1);
  });

  it("offset pagina sem repetir nem pular; offset negativo vira 0", async () => {
    const p1 = await bulk((c) => runSearch(c, { q: "escola modelo", limit: 10, offset: 0 }));
    const p2 = await bulk((c) => runSearch(c, { q: "escola modelo", limit: 10, offset: 10 }));
    expect(new Set([...p1, ...p2].map((r) => r.inep)).size).toBe(20);
    const neg = await bulk((c) => runSearch(c, { q: "escola modelo", limit: 10, offset: -3 }));
    expect(neg.map((r) => r.inep)).toEqual(p1.map((r) => r.inep));
  });
});

describe("search_schools: RLS", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await withSuperuser((c) => c.query("delete from public.municipalities where ibge_code = $1", [DISABLED_IBGE]));
    await cleanupUsers();
  });

  for (const who of ["anon", "authenticated_parent", "school_member"] as const) {
    it(`${who}: só escolas de município habilitado`, async () => {
      const rows = await search(who === "authenticated_parent" ? "parent" : who, { q: "objetivo" });
      expect(names(rows)).toEqual(["Colégio Objetivo Cuiabá"]);
      expect(names(await search(who === "authenticated_parent" ? "parent" : who, { network: "municipal" }))).toEqual([
        "Escola Municipal Professor Antônio Silva",
      ]);
    });
  }

  it("admin vê também as de município desabilitado", async () => {
    const rows = await search("admin", { q: "objetivo" });
    expect(names(rows).sort()).toEqual(["Colégio Objetivo Cuiabá", "Colégio Objetivo Goiânia"]);
  });

  it("filtrar por município desabilitado como anon devolve vazio", async () => {
    const rows = await withClaims("anon", async (c) => {
      await seed(c, "anon");
      await c.query("reset role");
      const id = (await c.query<{ id: string }>("select id from public.municipalities where ibge_code = $1", [DISABLED_IBGE])).rows[0]!.id;
      await c.query("set local role anon");
      return runSearch(c, { muni: id });
    });
    expect(rows).toHaveLength(0);
  });
});

describe("search_schools: entradas hostis", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await withSuperuser((c) => c.query("delete from public.municipalities where ibge_code = $1", [DISABLED_IBGE]));
    await cleanupUsers();
  });

  it("%, _, \\, aspas, só espaços e 10 mil caracteres não erram nem retornam tudo", async () => {
    const hostile = ["%", "%%%", "_", "___", "\\", "\\\\%", "'", "\"; drop table schools; --", "   ", "\t\n", "a", "🙂🙂", "%".repeat(10_000), "x".repeat(10_000), "  ".repeat(5_000)];
    for (const q of hostile) {
      const rows = await search("anon", { q });
      expect(rows.length, JSON.stringify(q.slice(0, 20))).toBe(0);
    }
  });

  it("10 mil caracteres com palavra válida no começo ainda responde sem erro", async () => {
    const rows = await search("anon", { q: "objetivo " + "y".repeat(10_000) });
    expect(Array.isArray(rows)).toBe(true);
  });

  it("filtros hostis (bairro com curinga, limite/offset extremos) não erram", async () => {
    expect((await search("anon", { hood: "%" })).length).toBe(0);
    expect((await search("anon", { hood: "_" })).length).toBe(0);
    expect((await search("anon", { hood: "x".repeat(10_000) })).length).toBe(0);
    expect(Array.isArray(await search("anon", { limit: 2147483647, offset: 2147483647 }))).toBe(true);
  });
});

describe("search_schools: desempenho", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("com 5.000 escolas o plano usa o índice trigram e a busca responde rápido", async () => {
    await inTx(async (c) => {
      await c.query(
        `insert into public.schools (inep, name, normalized_name, network, neighborhood, municipality_id)
         select lpad((60000000 + g)::text, 8, '0'),
                'Escola Teste ' || md5(g::text), 'escola teste ' || md5(g::text), 'municipal',
                'Bairro ' || (g % 50), m.id
         from generate_series(1, 5000) g, public.municipalities m where m.ibge_code = '5103403'`,
      );
      await c.query("analyze public.schools");
      // tolerante: força o planner a preferir índice e checa que ele PODE usar o GIN trigram (nome e bairro).
      await c.query("set local enable_seqscan = off");
      for (const [col, val] of [
        ["normalized_name", "escola teste abc"],
        ["lower(public.immutable_unaccent(neighborhood))", "bairro 7"],
      ] as const) {
        const plan = await c.query<{ "QUERY PLAN": string }>(
          `explain select id from public.schools where ${col} operator(extensions.%) $1`,
          [val],
        );
        const text = plan.rows.map((r) => r["QUERY PLAN"]).join("\n");
        expect(text, col).toMatch(/Bitmap Index Scan|Index Scan/);
        expect(text, col).toMatch(/gin|trgm|idx/i);
      }
      await c.query("reset enable_seqscan");
      const t0 = Date.now();
      const r = await c.query("select * from public.search_schools('escola teste 1a2b', null, null, null, 20, 0)");
      expect(Date.now() - t0).toBeLessThan(1500);
      expect(r.rows.length).toBeLessThanOrEqual(20);
    });
  });
});
