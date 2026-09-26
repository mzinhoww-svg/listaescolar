import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { scanForForbidden } from "@/features/b2b/api/scan";

import { purgePartners, secret, seedKey, seedPartner, TEST_PEPPER } from "./b2b-fixtures";
import { withSuperuser, IDS, seedUsers } from "./helpers";
import { cleanupCommitted, seedCandidate, seedList, seedSchool, transition, publish } from "./list-fixtures";

// Aceite "nenhuma rota devolve dado pessoal" (S24, Step 4). Semeia o cenário sensível do Global Constraints e
// varre TODAS as respostas (sucesso, paginação, cada erro alcançável, openapi.json e o catch-all) com
// `scanForForbidden`. Roda em `pnpm test:db`.

function localEnv(): { url: string; publishable: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), publishable: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), secret: get("SUPABASE_SECRET_KEY") };
}

beforeAll(() => {
  const env = localEnv();
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.publishable;
  process.env.SUPABASE_SECRET_KEY = env.secret;
  process.env.OPENROUTER_KEY = "chave-de-teste-irrelevante-para-b2b";
  process.env.AI_MODEL_CHEAP = "modelo-de-teste";
  process.env.AI_MODEL_STRONG = "modelo-de-teste";
  process.env.B2B_API_KEY_PEPPER = TEST_PEPPER;
});

async function routes() {
  return {
    schoolsGET: (await import("@/app/v1/schools/route")).GET,
    schoolGET: (await import("@/app/v1/schools/[inep]/route")).GET,
    schoolListsGET: (await import("@/app/v1/schools/[inep]/lists/route")).GET,
    listGET: (await import("@/app/v1/lists/[id]/route")).GET,
    listItemsGET: (await import("@/app/v1/lists/[id]/items/route")).GET,
    cartsMatchPOST: (await import("@/app/v1/carts/match/route")).POST,
    openapiGET: (await import("@/app/v1/openapi.json/route")).GET,
    catchAllGET: (await import("@/app/v1/[...rest]/route")).GET,
  };
}
type Routes = Awaited<ReturnType<typeof routes>>;
let R: Routes;

async function call(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Response | Promise<Response>,
  path: string,
  opts: { key?: string; method?: string; body?: string; contentType?: string; params?: Record<string, string> } = {},
): Promise<Response> {
  const headers = new Headers();
  if (opts.key !== undefined) headers.set("x-listacerta-key", opts.key);
  if (opts.body !== undefined) headers.set("content-type", opts.contentType ?? "application/json");
  const req = new Request(`https://api.listacerta.example${path}`, { method: opts.method ?? "GET", headers, body: opts.body });
  return handler(req, { params: Promise.resolve(opts.params ?? {}) });
}

const partnerIds: string[] = [];
const ineps: string[] = [];
const FORBIDDEN_VALUES = new Set<string>();
const RESPONSES: { label: string; status: number; body: unknown; headers: Record<string, string> }[] = [];

async function record(label: string, res: Response): Promise<void> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // corpo não-JSON (405 sem corpo etc.): varre como string mesmo.
  }
  RESPONSES.push({ label, status: res.status, body, headers: Object.fromEntries(res.headers.entries()) });
}

let sensitiveSchoolInep: string;
let sensitiveListId: string;
let sensitiveVersion2Id: string;
let supersededVersion1Id: string;
let demoSchoolInep: string;
let demoListId: string;
let unpublishedListSchoolInep: string;
let suspendedSchoolInep: string;
let disabledMuniSchoolInep: string;
let partnerKeyPlaintext: string;
let scopedOutKeyPlaintext: string; // escopo insuficiente (só carts:match) para forçar 403 em schools/lists
let schoolsOnlyKeyPlaintext: string; // sem carts:match, para forçar 403 em carts.match

beforeAll(async () => {
  await seedUsers();
  R = await routes();

  // Escola com contato sensível (e-mail, telefone, endereço, CEP) e itens com alerts/confidence internos.
  sensitiveSchoolInep = await withSuperuser(async (c) => {
    const schoolId = await seedSchool(c, "5199" + String(Math.floor(Math.random() * 900 + 100)).padStart(4, "0"), true);
    await c.query(
      `update public.schools set email = 'diretoria@escola-sensivel.example.test', phone = '+5565988887777',
              address = 'Rua das Escolas, 123', cep = '78005999' where id = $1`,
      [schoolId],
    );
    const listId = await seedList(c, schoolId, "ef-1", 2027);
    sensitiveListId = listId;
    const v1 = await seedCandidate(c, listId, 2);
    for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
    await publish(c, listId, v1);
    supersededVersion1Id = v1;
    // marca a v1 com created_by/approved_by (campos internos proibidos na API; submission_id tem FK para
    // list_submissions e exigiria um envio completo só para este teste — fora de escopo aqui).
    await c.query("update public.list_versions set created_by = $1, approved_by = $2 where id = $3", [IDS.parent, IDS.admin, v1]);
    // publica uma v2: a v1 vira superseded (só a versão atual sai pela API).
    const v2 = await c.query("select version_id from public.list_create_candidate_version($1, 'admin', null, null)", [listId]);
    sensitiveVersion2Id = v2.rows[0].version_id;
    await c.query(
      `insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts)
       values ($1, 1, 'Caderno v2', 'caderno v2', 'papelaria', 3, 'un', 0.5, '["ambiguous_item"]'::jsonb)`,
      [sensitiveVersion2Id],
    );
    // a LISTA já está `published` (não repete a transição); só a versão nova precisa ser aprovada e publicada —
    // isso torna v1 automaticamente `superseded`.
    await publish(c, listId, sensitiveVersion2Id);
    const r = await c.query("select inep from public.schools where id = $1", [schoolId]);
    return r.rows[0].inep as string;
  });
  ineps.push(sensitiveSchoolInep);

  // Escola demo com sua própria lista publicada.
  demoSchoolInep = await withSuperuser(async (c) => {
    const schoolId = await seedSchool(c, "5198" + String(Math.floor(Math.random() * 900 + 100)).padStart(4, "0"), true);
    await c.query("update public.schools set is_demo = true where id = $1", [schoolId]);
    const listId = await seedList(c, schoolId, "ef-1", 2027);
    await c.query("update public.school_lists set is_demo = true where id = $1", [listId]);
    demoListId = listId;
    const v = await seedCandidate(c, listId, 1);
    for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
    await publish(c, listId, v);
    const r = await c.query("select inep from public.schools where id = $1", [schoolId]);
    return r.rows[0].inep as string;
  });
  ineps.push(demoSchoolInep);

  // Lista NÃO publicada (fica em draft): nunca deve aparecer.
  unpublishedListSchoolInep = await withSuperuser(async (c) => {
    const schoolId = await seedSchool(c, "5197" + String(Math.floor(Math.random() * 900 + 100)).padStart(4, "0"), true);
    await seedList(c, schoolId, "ef-1", 2027);
    const r = await c.query("select inep from public.schools where id = $1", [schoolId]);
    return r.rows[0].inep as string;
  });
  ineps.push(unpublishedListSchoolInep);

  // Escola suspensa com lista publicada: some da API mesmo assim.
  suspendedSchoolInep = await withSuperuser(async (c) => {
    const schoolId = await seedSchool(c, "5196" + String(Math.floor(Math.random() * 900 + 100)).padStart(4, "0"), true);
    // nome distinto do padrão de `seedSchool` (compartilhado com escolas legitimamente visíveis): senão o valor
    // "proibido" coincidiria com o nome de escolas que DEVEM aparecer, e a varredura acusaria falso positivo.
    await c.query("update public.schools set name = 'Escola Suspensa Sigilosa', normalized_name = 'escola suspensa sigilosa', verification_status = 'suspended' where id = $1", [schoolId]);
    const listId = await seedList(c, schoolId, "ef-1", 2027);
    const v = await seedCandidate(c, listId, 1);
    for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
    await publish(c, listId, v);
    const r = await c.query("select inep, name from public.schools where id = $1", [schoolId]);
    FORBIDDEN_VALUES.add(r.rows[0].name);
    return r.rows[0].inep as string;
  });
  ineps.push(suspendedSchoolInep);

  // Município desabilitado: some da API mesmo com lista publicada.
  disabledMuniSchoolInep = await withSuperuser(async (c) => {
    const schoolId = await seedSchool(c, "5195" + String(Math.floor(Math.random() * 900 + 100)).padStart(4, "0"), false);
    await c.query("update public.schools set name = 'Escola Fora Do Municipio Sigilosa', normalized_name = 'escola fora do municipio sigilosa' where id = $1", [schoolId]);
    const listId = await seedList(c, schoolId, "ef-1", 2027);
    const v = await seedCandidate(c, listId, 1);
    for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
    await publish(c, listId, v);
    const r = await c.query("select inep, name from public.schools where id = $1", [schoolId]);
    FORBIDDEN_VALUES.add(r.rows[0].name);
    return r.rows[0].inep as string;
  });
  ineps.push(disabledMuniSchoolInep);

  // Segundo parceiro com chave (nunca deve aparecer nas respostas do primeiro).
  const otherPartnerId = await withSuperuser((c) => seedPartner(c, { status: "active", ownerId: null }));
  partnerIds.push(otherPartnerId);
  const otherKey = await withSuperuser((c) => seedKey(c, otherPartnerId, { environment: "live" }));
  FORBIDDEN_VALUES.add(otherPartnerId).add(otherKey.publicId).add(otherKey.id);

  // Lead (LC-...) e papelaria: tabelas de outra trilha, nunca tocadas por /v1, mas entram na varredura de valores.
  const stationeryRow = await withSuperuser((c) =>
    c.query(
      `insert into public.stationeries (slug, trade_name, cnpj, status, municipality_id, address, cep, phone, email, offers_pickup, offers_delivery)
       select 'papelaria-leak-' || substr(md5(random()::text), 1, 8), 'Papelaria Vazamento', lpad((random()*99999999999999)::bigint::text, 14, '0'),
              'active', m.id, 'Rua Teste', '78000000', '+556533330000', 'contato@papelaria-leak.example.test', true, false
         from public.municipalities m order by m.ibge_code limit 1 returning id, email, phone, cnpj`,
    ),
  );
  const stationery = stationeryRow.rows[0];
  FORBIDDEN_VALUES.add(stationery.id).add(stationery.email).add(stationery.phone).add(stationery.cnpj);

  const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const leadCode = `LC-${Array.from({ length: 5 }, () => crockford[Math.floor(Math.random() * crockford.length)]).join("")}`;
  await withSuperuser((c) =>
    c.query(
      `insert into public.leads (code, requester_id, list_id, stationery_id, status, school_name, grade_label, school_year,
              municipality_id, neighborhood, item_count, consent_text_version, consented_at, idempotency_key, is_demo, expires_at)
       select $1, $2, gen_random_uuid(), $3, 'received', 'Escola Vazamento', '5º ano', 2027, m.id, 'centro', 1, 'v1', now(), gen_random_uuid(), true, now() + interval '7 days'
         from public.municipalities m order by m.ibge_code limit 1`,
      [leadCode, IDS.parent, stationery.id],
    ),
  );
  FORBIDDEN_VALUES.add(leadCode);

  // Perfil com nome e e-mail (nunca sai pela API).
  const profileRow = await withSuperuser((c) => c.query("select display_name from public.profiles where id = $1", [IDS.parent]));
  FORBIDDEN_VALUES.add(profileRow.rows[0].display_name).add(IDS.parent).add(IDS.admin);
  FORBIDDEN_VALUES.add("diretoria@escola-sensivel.example.test").add("+5565988887777").add("Rua das Escolas, 123").add("78005999");
  FORBIDDEN_VALUES.add(supersededVersion1Id).add(sensitiveVersion2Id);
  // Itens da v1 (superseded): só a v2 ("Caderno v2") pode aparecer pela API.
  FORBIDDEN_VALUES.add("Caderno 1").add("Caderno 2");

  // Parceiro real (o que vamos usar nas chamadas) + chaves com escopos diferentes.
  const realPartnerId = await withSuperuser((c) =>
    seedPartner(c, { status: "active", ownerId: null, limits: { testMinute: 1000, testDay: 100_000, liveMinute: 1000, liveDay: 100_000 } }),
  );
  partnerIds.push(realPartnerId);
  const s1 = secret();
  const fullKey = await withSuperuser((c) => seedKey(c, realPartnerId, { environment: "live", secret: s1, scopes: ["schools:read", "lists:read", "carts:match"] }));
  partnerKeyPlaintext = `lc_live_${fullKey.publicId}_${s1}`;
  const s2 = secret();
  const matchOnlyKey = await withSuperuser((c) => seedKey(c, realPartnerId, { environment: "live", secret: s2, scopes: ["carts:match"] }));
  scopedOutKeyPlaintext = `lc_live_${matchOnlyKey.publicId}_${s2}`;
  const s3 = secret();
  const schoolsOnlyKey = await withSuperuser((c) => seedKey(c, realPartnerId, { environment: "live", secret: s3, scopes: ["schools:read"] }));
  schoolsOnlyKeyPlaintext = `lc_live_${schoolsOnlyKey.publicId}_${s3}`;
});

afterAll(async () => {
  await purgePartners(partnerIds);
  await cleanupCommitted(ineps);
  await withSuperuser((c) => c.query("delete from public.leads where school_name = 'Escola Vazamento'"));
  await withSuperuser((c) => c.query("delete from public.stationeries where trade_name = 'Papelaria Vazamento'"));
});

describe("varredura de vazamento: coleta todas as respostas alcançáveis", () => {
  it("coleta sucesso, paginação e cada erro de cada endpoint (live e test), openapi.json e catch-all", async () => {
    const live = partnerKeyPlaintext;

    await record("schools.list live", await call(R.schoolsGET, "/v1/schools?limit=100", { key: live }));
    await record("schools.list unknown-query", await call(R.schoolsGET, "/v1/schools?nope=1", { key: live }));
    await record("schools.list no-key", await call(R.schoolsGET, "/v1/schools", {}));
    await record("schools.list wrong-scope", await call(R.schoolsGET, "/v1/schools", { key: scopedOutKeyPlaintext }));

    await record("schools.get sensitive", await call(R.schoolGET, `/v1/schools/${sensitiveSchoolInep}`, { key: live, params: { inep: sensitiveSchoolInep } }));
    await record("schools.get suspended-404", await call(R.schoolGET, `/v1/schools/${suspendedSchoolInep}`, { key: live, params: { inep: suspendedSchoolInep } }));
    await record("schools.get disabled-muni-404", await call(R.schoolGET, `/v1/schools/${disabledMuniSchoolInep}`, { key: live, params: { inep: disabledMuniSchoolInep } }));
    await record("schools.get malformed-400", await call(R.schoolGET, "/v1/schools/abc", { key: live, params: { inep: "abc" } }));

    await record(
      "schools.lists sensitive",
      await call(R.schoolListsGET, `/v1/schools/${sensitiveSchoolInep}/lists`, { key: live, params: { inep: sensitiveSchoolInep } }),
    );
    await record(
      "schools.lists unpublished-empty",
      await call(R.schoolListsGET, `/v1/schools/${unpublishedListSchoolInep}/lists`, { key: live, params: { inep: unpublishedListSchoolInep } }),
    );

    await record("lists.get current-version", await call(R.listGET, `/v1/lists/${sensitiveListId}`, { key: live, params: { id: sensitiveListId } }));
    // lista demo com chave `live`: 404 (ambiente errado), mesmo a escola/lista existindo de verdade.
    await record("lists.get demo-list-with-live-key-404", await call(R.listGET, `/v1/lists/${demoListId}`, { key: live, params: { id: demoListId } }));
    // o id de uma VERSÃO (nunca exposto pela API) não é um id de lista válido: 404, igual a qualquer id inexistente.
    await record("lists.get version-id-not-a-list", await call(R.listGET, `/v1/lists/${supersededVersion1Id}`, { key: live, params: { id: supersededVersion1Id } }));
    await record("lists.get random-404", await call(R.listGET, `/v1/lists/${randomUUID()}`, { key: live, params: { id: randomUUID() } }));

    await record(
      "lists.items current-version",
      await call(R.listItemsGET, `/v1/lists/${sensitiveListId}/items`, { key: live, params: { id: sensitiveListId } }),
    );
    // paginação página a página
    let cursor: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const qs = new URLSearchParams({ limit: "1", ...(cursor ? { cursor } : {}) });
      const res = await call(R.listItemsGET, `/v1/lists/${sensitiveListId}/items?${qs}`, { key: live, params: { id: sensitiveListId } });
      const clone = res.clone();
      await record(`lists.items page ${i}`, res);
      const body = await clone.json();
      cursor = body.next_cursor;
      if (!cursor) break;
    }

    await record(
      "carts.match sensitive",
      await call(R.cartsMatchPOST, "/v1/carts/match", { key: live, method: "POST", body: JSON.stringify({ list_id: sensitiveListId, skus: [{ sku: "X-1", name: "Caderno v2" }] }) }),
    );
    await record(
      "carts.match not-found",
      await call(R.cartsMatchPOST, "/v1/carts/match", { key: live, method: "POST", body: JSON.stringify({ list_id: randomUUID(), skus: [{ sku: "X-1", name: "Y" }] }) }),
    );
    await record(
      "carts.match too-large",
      await call(R.cartsMatchPOST, "/v1/carts/match", {
        key: live,
        method: "POST",
        body: JSON.stringify({ list_id: sensitiveListId, skus: Array.from({ length: 5000 }, (_, i) => ({ sku: `S${i}`, name: "x".repeat(190) })) }),
      }),
    );
    await record(
      "carts.match wrong-scope",
      await call(R.cartsMatchPOST, "/v1/carts/match", { key: schoolsOnlyKeyPlaintext, method: "POST", body: JSON.stringify({ list_id: sensitiveListId, skus: [{ sku: "X", name: "Y" }] }) }),
    );

    // 429: parceiro dedicado com limite mínimo, exaure e coleta a resposta.
    const smallPartnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: null, limits: { testMinute: 1, testDay: 1000 } }));
    partnerIds.push(smallPartnerId);
    const smallSecret = secret();
    const smallKey = await withSuperuser((c) => seedKey(c, smallPartnerId, { environment: "test", secret: smallSecret }));
    const smallPlaintext = `lc_test_${smallKey.publicId}_${smallSecret}`;
    await record("rate-limit ok", await call(R.schoolsGET, "/v1/schools?limit=1", { key: smallPlaintext }));
    await record("rate-limit 429", await call(R.schoolsGET, "/v1/schools?limit=1", { key: smallPlaintext }));

    await record("openapi.json", await call(R.openapiGET, "/v1/openapi.json"));
    await record("catch-all", await call(R.catchAllGET, "/v1/inexistente"));

    expect(RESPONSES.length).toBeGreaterThan(15);
  });

  it("zero achados em toda resposta coletada (corpo e cabeçalhos)", () => {
    const forbiddenValues = [...FORBIDDEN_VALUES].filter((v): v is string => typeof v === "string" && v.length > 0);
    const findings = RESPONSES.flatMap(({ label, body, headers }) => {
      const bodyFindings = scanForForbidden(body, { values: forbiddenValues }).map((f) => ({ ...f, where: `${label} body` }));
      const headerFindings = scanForForbidden(headers, { values: forbiddenValues }).map((f) => ({ ...f, where: `${label} headers` }));
      return [...bodyFindings, ...headerFindings];
    });
    expect(findings).toEqual([]);
  });

  it("os status esperados realmente ocorreram (a varredura não passou por não ter achado erro nenhum)", () => {
    const statuses = new Set(RESPONSES.map((r) => r.status));
    for (const expected of [200, 400, 401, 403, 404, 413, 429]) expect(statuses.has(expected)).toBe(true);
  });
});

describe("teste de controle: a varredura e o .strict() pegam um campo proibido injetado", () => {
  it("scanForForbidden acha o campo; um esquema .strict() rejeita o mesmo objeto", () => {
    function fakeEndpointResponse() {
      return { data: { inep: "51999999", name: "Escola Falsa", created_by: IDS.parent, contact_email: "vazou@exemplo.test" } };
    }
    const leaked = fakeEndpointResponse();
    const findings = scanForForbidden(leaked, { values: [IDS.parent, "vazou@exemplo.test"] });
    expect(findings.length).toBeGreaterThan(0);

    const schema = z.object({ data: z.object({ inep: z.string(), name: z.string() }).strict() }).strict();
    expect(schema.safeParse(leaked).success).toBe(false);
  });
});

