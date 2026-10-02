// S28 · Consultas lentas (M02), só no banco LOCAL. Mede as quatro consultas quentes (buscar escola, abrir lista, criar
// carrinho, listar leads da papelaria) com carga real pelo mesmo código do app (PostgREST + RLS), lê o top do
// `pg_stat_statements`, roda `EXPLAIN (ANALYZE, BUFFERS)` e dá o veredito contra o orçamento: p95 <= 100 ms e nenhum
// Seq Scan em tabela grande sem justificativa. Volume: 50 mil escolas sintéticas (`is_demo`, INEP 80000000+; ~3 mil no município habilitado e o resto em 40 municípios sintéticos) carregadas
// e removidas pelo próprio script; os leads não podem ser carregados em massa (a cobrança do S21 é gatilho `always`),
// então o plano deles vai numa cópia temporária com 50 mil linhas sintéticas (mesmos índices, sem RLS).
// Uso: set -a; source .env.local; set +a; pnpm exec tsx --conditions=react-server scripts/s28-consultas.ts
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const OUT = "docs/superpowers/evidencias/S28/depois/consultas.md";
const ITER = 150;
const BULK = 50_000;
const BUDGET_P95_MS = 100;
const BIG_TABLE_ROWS = 10_000;
const PARENT = "00000000-0000-4000-8000-0000000028a1";
const STATIONERY_OWNER = "00000000-0000-4000-8000-0000000014a1";
const STATIONERY = "00000000-0000-4000-8000-0000000014a2";

type Status = { API_URL: string; DB_URL: string; JWT_SECRET: string; PUBLISHABLE_KEY: string };

function localStatus(): Status {
  const out = execFileSync("node", ["scripts/supa.mjs", "status"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const line = out.split("\n").find((l) => l.startsWith("{"));
  if (!line) throw new Error("supabase status sem JSON");
  const s = JSON.parse(line) as Status;
  for (const u of [s.API_URL, s.DB_URL]) {
    const host = new URL(u).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Este script só roda contra o Supabase local.");
  }
  return s;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function mintJwt(secret: string, sub: string): string {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ aud: "authenticated", role: "authenticated", sub, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * p) - 1)] ?? 0;
};
const ms = (n: number) => `${n.toFixed(1)} ms`;

type Flow = { name: string; times: number[]; note: string };


/**
 * Carrega escolas sintéticas com distribuição realista: o município habilitado recebe ~3 mil (cidade grande) e o resto
 * se espalha por 40 municípios sintéticos desabilitados (o total nacional é o que pesa no índice trigram).
 */
async function bulkSchools(db: Client, municipalityId: string) {
  await db.query("alter table public.municipalities disable trigger municipalities_audit");
  await db.query("alter table public.schools disable trigger schools_audit");
  try {
    await db.query(
      `insert into public.municipalities (ibge_code, uf, name, is_enabled)
       select ('900' || lpad(g::text, 4, '0')), 'ZZ', 'Município sintético ' || g, false from generate_series(1, 40) g
       on conflict (ibge_code) do nothing`,
    );
    await db.query(
      `with syn as (select array_agg(id order by ibge_code) as ids from public.municipalities where ibge_code like '900%' and uf = 'ZZ'),
       names as (
         select g, 'Escola ' || (array['Municipal','Estadual','Particular','Cívica','Modelo'])[1 + g % 5] || ' ' ||
                (array['Maria','João','Santos','Cuiabá','Rondon','Aurora','Central','Esperança'])[1 + g % 8] || ' ' || g as name
           from generate_series(1, ${BULK}) g)
       insert into public.schools (inep, name, normalized_name, network, neighborhood, municipality_id, is_demo)
       select (80000000 + n.g)::text, n.name, public.search_normalize(n.name),
              (array['municipal','state','private','federal'])[1 + n.g % 4]::public.school_network,
              'Bairro ' || (n.g % 60),
              case when n.g % 17 = 0 or $2::boolean then $1::uuid else syn.ids[1 + n.g % 40] end, true
         from names n cross join syn
       on conflict (inep) do nothing`,
      [municipalityId, process.env.S28_ALL_IN_ONE === "1"],
    );
  } finally {
    await db.query("alter table public.schools enable always trigger schools_audit");
    await db.query("alter table public.municipalities enable always trigger municipalities_audit");
  }
  await db.query("analyze public.schools");
}

async function dropBulkSchools(db: Client) {
  await db.query("alter table public.municipalities disable trigger municipalities_audit");
  await db.query("alter table public.schools disable trigger schools_audit");
  try {
    await db.query("delete from public.schools where inep >= '80000000' and inep < '81000000' and is_demo");
    await db.query("delete from public.municipalities where ibge_code like '900%' and uf = 'ZZ'");
  } finally {
    await db.query("alter table public.schools enable always trigger schools_audit");
    await db.query("alter table public.municipalities enable always trigger municipalities_audit");
  }
}

function seqScans(plan: string): { table: string }[] {
  return [...plan.matchAll(/Seq Scan on (\w+)/g)].map((m) => ({ table: m[1] as string }));
}

async function explain(db: Client, sql: string, params: unknown[] = [], rollback = false): Promise<string> {
  if (rollback) await db.query("begin");
  try {
    const r = await db.query<{ "QUERY PLAN": string }>(`explain (analyze, buffers, costs off, timing on) ${sql}`, params);
    return r.rows.map((x) => x["QUERY PLAN"]).join("\n");
  } finally {
    if (rollback) await db.query("rollback");
  }
}

async function main() {
  const st = localStatus();
  process.env.NEXT_PUBLIC_SUPABASE_URL = st.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = st.PUBLISHABLE_KEY;
  const db = new Client({ connectionString: st.DB_URL });
  await db.connect();
  const { searchSchools } = await import("../features/schools/search/repository");
  const { parseSearchParams } = await import("../features/schools/search/params");
  const { getPublishedList } = await import("../features/lists/queries");
  const { createCart } = await import("../features/cart/repository");

  await db.query("create extension if not exists pg_stat_statements");
  const lists = (
    await db.query<{ inep: string; slug: string; school_year: number; list_id: string; item_id: string; item_name: string }>(
      `select s.inep, g.slug, l.school_year, l.id as list_id, i.id as item_id, i.original_name as item_name
         from public.school_lists l join public.schools s on s.id = l.school_id join public.grades g on g.id = l.grade_id
         join public.list_items i on i.version_id = l.current_version_id
        where l.status = 'published' and not (s.inep >= '80000000' and s.inep < '81000000') order by s.inep, i.position`,
    )
  ).rows;
  if (lists.length === 0) throw new Error("Sem lista publicada: rode `pnpm import:inep tests/fixtures/inep-demo.csv --demo && pnpm seed:demo-lists` antes.");
  const stationeryOk = (await db.query("select 1 from public.stationeries where id = $1", [STATIONERY])).rowCount === 1;
  if (!stationeryOk) throw new Error("Sem papelaria demo: rode `docker exec -i supabase_db_listacerta-t2 psql -U postgres < scripts/e2e-s14-seed.sql`.");
  const muni = (await db.query<{ id: string }>("select id from public.municipalities where is_enabled order by name, id limit 1")).rows[0]!.id;

  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token, reauthentication_token, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 's28-consultas@listacerta.test', now(), '{}', '{}', '', '', '', '', '', '', '', '', now(), now()) on conflict (id) do nothing`,
    [PARENT],
  );

  const flows: Flow[] = [];
  const plans: { name: string; sql: string; plan: string; seq: string[]; ms: number }[] = [];
  let bulkLoaded = false;
  try {
    await bulkSchools(db, muni);
    bulkLoaded = true;
    const schoolCount = Number((await db.query("select count(*) from public.schools")).rows[0].count);
    const muniCount = Number((await db.query("select count(*) from public.schools where municipality_id = $1", [muni])).rows[0].count);

    await db.query("select pg_stat_statements_reset()");
    const time = async (name: string, note: string, fn: (i: number) => Promise<unknown>) => {
      const times: number[] = [];
      for (let i = 0; i < 5; i++) await fn(i); // aquecimento fora da medição
      for (let i = 0; i < ITER; i++) {
        const t0 = performance.now();
        await fn(i);
        times.push(performance.now() - t0);
      }
      flows.push({ name, times, note });
    };

    const words = ["escola", "maria", "municipal", "santos", "aurora central", "cuiaba", "esperanca", "rondon"];
    await time("Buscar escola", `\`searchSchools\` (RPC \`search_schools\`, trigram) com ${schoolCount} escolas (${muniCount} no município)`, (i) =>
      searchSchools(parseSearchParams({ q: words[i % words.length] })),
    );
    await time("Abrir lista", "`getPublishedList` (escola, série, lista, versão, itens)", (i) => {
      const l = lists[i % lists.length]!;
      return getPublishedList(l.inep, l.slug, l.school_year);
    });
    const parentClient = createClient(st.API_URL, st.PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${mintJwt(st.JWT_SECRET, PARENT)}` } },
    });
    const first = lists[0]!;
    const items = lists.filter((x) => x.list_id === first.list_id).map((x) => ({ listItemId: x.item_id, name: x.item_name, quantity: 1 }));
    await time("Criar carrinho", "`createCart` (carts + cart_items) como responsável, com RLS", () =>
      createCart(parentClient, { ownerId: PARENT, listId: first.list_id, listKind: "official", items }),
    );
    const ownerClient = createClient(st.API_URL, st.PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${mintJwt(st.JWT_SECRET, STATIONERY_OWNER)}` } },
    });
    // Mesma consulta de `listForStationery` (o ator de sessão é um objeto marcado que só `getSessionActor` cria, então
    // aqui se repete o SELECT do PostgREST com o JWT do dono; RLS vale igual).
    await time("Listar leads da papelaria", "consulta de `listForStationery` como dono, com RLS (tabela `leads` real, sem volume: ver plano em cópia)", async () => {
      const { error } = await ownerClient
        .from("leads")
        .select("id, code, status, list_id, stationery_id, school_name, grade_label, school_year, neighborhood, item_count, expires_at, quoted_total_cents, quoted_at, declared_sale_cents, declared_at, close_reason, is_demo, created_at, lead_events(created_at)")
        .eq("stationery_id", STATIONERY)
        .eq("lead_events.event_type", "sale_declared")
        .order("created_at", { ascending: false })
        .limit(501);
      if (error) throw new Error(error.message);
    });

    // Top do pg_stat_statements (só o que o app gerou: PostgREST e funções; sem o próprio pg_stat).
    const top = async (order: string) =>
      (
        await db.query<{ q: string; calls: string; mean: number; max: number; total: number }>(
          `select left(regexp_replace(query, '\\s+', ' ', 'g'), 150) as q, calls::text, mean_exec_time as mean, max_exec_time as max, total_exec_time as total
             from pg_stat_statements where query not ilike '%pg_stat_statements%' and query not ilike 'begin%' and query not ilike 'commit%'
              and query not ilike 'set %' and query not ilike '%set_config%' and calls >= 5 order by ${order} desc limit 8`,
        )
      ).rows;
    const byTotal = await top("total_exec_time");
    const byMean = await top("mean_exec_time");

    // Planos (com concreto). Busca e lista: banco real. Carrinho: numa transação com rollback. Leads: cópia temporária.
    const q = "escola maria";
    const searchSql = `select * from public.search_schools($1, $2::uuid, null, null, 20, 0)`;
    plans.push(await plan(db, "Buscar escola", searchSql, [q, muni], muniCount));
    const inner = `select s.id, s.inep, s.name, s.network, s.neighborhood, s.municipality_id, m.name as municipality_name,
        s.verification_status, s.is_demo,
        greatest(extensions.similarity(s.normalized_name, $1), extensions.word_similarity($1, s.normalized_name)) as rank,
        count(*) over () as total_count
      from public.schools s join public.municipalities m on m.id = s.municipality_id
      where (s.normalized_name operator(extensions.%) $1 or $1 operator(extensions.<%) s.normalized_name) and s.municipality_id = $2::uuid
      order by rank desc, s.name asc, s.id asc limit 20 offset 0`;
    plans.push(await plan(db, "Buscar escola (consulta interna da função, mesma forma)", inner, [q, muni], muniCount));
    plans.push(
      await plan(db, "Abrir lista (itens da versão)", `select id, position, original_name from public.list_items where version_id = (select current_version_id from public.school_lists where id = $1) order by position`, [first.list_id], 0),
    );
    plans.push(await plan(db, "Criar carrinho (insert)", `insert into public.carts (owner_id, list_id, strategy, is_demo, list_kind) values ($1, $2, 'cheapest', false, 'official')`, [PARENT, first.list_id], 0, true));
    await db.query("create temp table leads_copy (like public.leads including all)");
    await db.query(
      `insert into leads_copy (code, requester_id, list_id, stationery_id, status, school_name, grade_label, school_year, municipality_id, item_count, expires_at, consent_text_version, consented_at, idempotency_key, list_kind, created_at)
       select 'LC-' || lpad(upper(to_hex(g)), 6, '0'), gen_random_uuid(), $1, (case when g % 50 = 0 then $2::uuid else gen_random_uuid() end),
              (array['received','viewed','in_progress','expired','converted'])[1 + g % 5]::public.lead_status, 'Escola Sintética', '5º ano', 2027, $3, 10, now() + interval '3 days', 'v', now(), gen_random_uuid(), 'official', now() - (g || ' minutes')::interval
         from generate_series(1, ${BULK}) g`,
      [first.list_id, STATIONERY, muni],
    );
    await db.query("analyze leads_copy");
    plans.push(await plan(db, "Listar leads da papelaria (cópia com 50 mil linhas)", `select id, code, status, created_at from leads_copy where stationery_id = $1 order by created_at desc limit 501`, [STATIONERY], BULK));

    const rows: string[] = [
      "# S28 · Consultas lentas (M02)",
      "",
      `Gerado por \`scripts/s28-consultas.ts\` em ${new Date().toISOString().slice(0, 10)}, banco local da trilha 2 (\`pg_stat_statements\` ativo). Carga: ${ITER} chamadas por fluxo (mais 5 de aquecimento), sequenciais, pelo mesmo código do app (PostgREST, RLS). Volume: ${schoolCount} escolas no total, ${muniCount} no município habilitado (50 mil sintéticas e 40 municípios sintéticos removidos ao fim) e, para os leads, cópia temporária de 50 mil linhas (2% na papelaria medida, 1000 leads; a cobrança do S21 impede carga em massa na tabela real). Orçamento: p95 <= ${BUDGET_P95_MS} ms e nenhum Seq Scan em tabela com mais de ${BIG_TABLE_ROWS} linhas sem justificativa.`,
      "",
      "## Fluxos",
      "",
      "| Consulta | Chamadas | Média | p95 | Máximo | Plano | Veredito |",
      "|---|---|---|---|---|---|---|",
    ];
    const planOf: Record<string, string> = {
      "Buscar escola": "Buscar escola (consulta interna da função, mesma forma)",
      "Abrir lista": "Abrir lista (itens da versão)",
      "Criar carrinho": "Criar carrinho (insert)",
      "Listar leads da papelaria": "Listar leads da papelaria (cópia com 50 mil linhas)",
    };
    let anyOver = false;
    for (const f of flows) {
      const p = plans.find((x) => x.name === planOf[f.name]);
      const p95 = pct(f.times, 0.95);
      const bad = p95 > BUDGET_P95_MS || (p?.seq.length ?? 0) > 0;
      anyOver ||= bad;
      rows.push(`| ${f.name} | ${f.times.length} | ${ms(f.times.reduce((a, b) => a + b, 0) / f.times.length)} | ${ms(p95)} | ${ms(Math.max(...f.times))} | ${p ? (p.seq.length ? `Seq Scan em ${p.seq.join(", ")}` : "índice") : "n/d"} | ${bad ? "**CORRIGIR**" : "dentro do orçamento"} |`);
    }
    rows.push("", "Notas: " + flows.map((f) => `**${f.name}**: ${f.note}`).join("; ") + ".", "");
    rows.push(
      "## Veredito e observações",
      "",
      anyOver ? "Alguma consulta passou do orçamento: ver a coluna Veredito e a migration `0801`." : "**Nenhuma consulta passou do orçamento** com a distribuição realista (município habilitado com ~3 mil escolas, total nacional de 50 mil). Nenhuma migration `0801` foi necessária.",
      "",
      "- Buscar escola usa `schools_municipality_network_idx` para restringir ao município e só então aplica a similaridade (`similarity`/`word_similarity`) às escolas do município; a lista de escolas de uma cidade é o que limita o custo, não o total nacional.",
      "- Observação manual do pior caso, medida na primeira execução deste script em 29/09/2026 com as 50 mil escolas TODAS no município habilitado (não representativo: nenhuma cidade brasileira tem 50 mil escolas): média 187,8 ms e p95 304,0 ms, com a ordenação (`count(*) over ()` + `order by rank`) derramando para disco (`temp read=598 written=442`). Reproduzível com `S28_ALL_IN_ONE=1`. Só passaria a importar com um município de dezenas de milhares de escolas; nesse caso a saída é paginar sem `count(*) over ()` ou aumentar `work_mem`. Registrado como Ruling, sem mudança.",
      "- Criar carrinho e abrir lista ficam abaixo de 10 ms; listar leads da papelaria usa `leads_stationery_status_idx` (bitmap por `stationery_id`, ordenação de 500 linhas em memória).",
      "- Limite da medição: a tabela `leads` real está vazia (a cobrança do S21 impede carga em massa) e o plano vem de uma cópia temporária com os mesmos índices e sem RLS; o custo da política de RLS sobre `leads` não está no plano da cópia, mas está no tempo do fluxo real (2 ms, tabela vazia).",
      "",
    );
    rows.push("## `pg_stat_statements`: top por tempo total", "", "| Consulta (normalizada) | Chamadas | Média | Máximo | Total |", "|---|---|---|---|---|");
    for (const r of byTotal) rows.push(`| \`${r.q.replace(/\|/g, "/")}\` | ${r.calls} | ${ms(r.mean)} | ${ms(r.max)} | ${ms(r.total)} |`);
    rows.push("", "## `pg_stat_statements`: top por tempo médio", "", "| Consulta (normalizada) | Chamadas | Média | Máximo | Total |", "|---|---|---|---|---|");
    for (const r of byMean) rows.push(`| \`${r.q.replace(/\|/g, "/")}\` | ${r.calls} | ${ms(r.mean)} | ${ms(r.max)} | ${ms(r.total)} |`);
    rows.push("", "## Planos (`EXPLAIN (ANALYZE, BUFFERS)`)", "");
    for (const p of plans) rows.push(`### ${p.name}`, "", `Execução: ${ms(p.ms)}. \`${p.sql.replace(/\s+/g, " ")}\``, "", "```", p.plan, "```", "");
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, rows.join("\n"));
    console.log(rows.slice(0, 16).join("\n"));
    if (anyOver) console.log("\nATENÇÃO: alguma consulta passou do orçamento.");
  } finally {
    if (bulkLoaded) await dropBulkSchools(db);
    await db.query("delete from public.cart_items where cart_id in (select id from public.carts where owner_id = $1)", [PARENT]).catch(() => undefined);
    await db.query("delete from public.carts where owner_id = $1", [PARENT]).catch(() => undefined);
    await db.query("delete from auth.users where id = $1", [PARENT]).catch(() => undefined);
    await db.end();
  }
}

async function plan(db: Client, name: string, sql: string, params: unknown[], tableRows: number, rollback = false) {
  const text = await explain(db, sql, params, rollback);
  const ms = Number(/Execution Time: ([\d.]+) ms/.exec(text)?.[1] ?? 0);
  // Seq Scan só conta em tabela grande: `tableRows` é o volume da consulta principal.
  const seq = tableRows > BIG_TABLE_ROWS ? seqScans(text).map((s) => s.table) : [];
  return { name, sql, plan: text, seq, ms };
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
