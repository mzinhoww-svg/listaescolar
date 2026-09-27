import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { scanForForbidden } from "@/features/b2b/api/scan";
import { ENDPOINTS } from "@/features/b2b/api/endpoints";

import { purgePartners, secret, seedKey, seedPartner, TEST_PEPPER } from "./b2b-fixtures";
import { withSuperuser, IDS, seedUsers } from "./helpers";
import { cleanupCommitted, seedCandidate, seedList, seedSchool, transition, publish } from "./list-fixtures";

// Aceite "nenhuma rota devolve dado pessoal" (S24, Step 4). Semeia o cenário sensível do Global Constraints e
// varre, PARA CADA ENTRADA DO REGISTRO (`ENDPOINTS`), com `live` e `test`: sucesso (+ paginação até o fim quando
// paginado), sem chave (401), escopo errado (403, quando o endpoint declara `insufficient_scope`), id/parâmetro
// inexistente (404, quando declara `not_found`) e parâmetro/corpo inválido (400, quando declara `invalid_request`)
// — mais os erros específicos de `carts.match` (413/415) e o rate limit (429). Um endpoint NOVO no registro sem
// fixture aqui faz o teste FALHAR alto (não passa em silêncio): é exatamente o risco "rota fora do registro escapa
// da varredura" do Review Focus. Roda em `pnpm test:db`.

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

type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;

async function routes(): Promise<Record<string, RouteHandler>> {
  return {
    "schools.list": (await import("@/app/v1/schools/route")).GET,
    "schools.get": (await import("@/app/v1/schools/[inep]/route")).GET,
    "schools.lists": (await import("@/app/v1/schools/[inep]/lists/route")).GET,
    "lists.get": (await import("@/app/v1/lists/[id]/route")).GET,
    "lists.items": (await import("@/app/v1/lists/[id]/items/route")).GET,
    "carts.match": (await import("@/app/v1/carts/match/route")).POST,
  };
}
let HANDLERS: Record<string, RouteHandler>;
let openapiGET: RouteHandler;
let catchAllGET: RouteHandler;

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

// ---------------------------------------------------------------------------
// Construção genérica de requisições a partir de `entry.path` (placeholders `{param}`) — nenhuma URL escrita à
// mão por endpoint; só os VALORES (parâmetros/corpo) vêm da fixture.
// ---------------------------------------------------------------------------
type CaseSpec = { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; rawBody?: string; contentType?: string };

function requestFor(path: string, method: string, spec: CaseSpec, key: string | undefined): { req: Request; params: Record<string, string> } {
  let resolvedPath = path;
  for (const [k, v] of Object.entries(spec.params ?? {})) resolvedPath = resolvedPath.replace(`{${k}}`, encodeURIComponent(v));
  const qs = spec.query ? new URLSearchParams(spec.query).toString() : "";
  const url = `https://api.listacerta.example${resolvedPath}${qs ? `?${qs}` : ""}`;
  const headers = new Headers();
  if (key !== undefined) headers.set("x-listacerta-key", key);
  const hasBody = spec.rawBody !== undefined || spec.body !== undefined;
  if (hasBody) headers.set("content-type", spec.contentType ?? "application/json");
  const bodyText = spec.rawBody !== undefined ? spec.rawBody : spec.body !== undefined ? JSON.stringify(spec.body) : undefined;
  return { req: new Request(url, { method, headers, body: bodyText }), params: spec.params ?? {} };
}

async function callEntry(handler: RouteHandler, path: string, method: string, spec: CaseSpec, key: string | undefined): Promise<Response> {
  const { req, params } = requestFor(path, method, spec, key);
  return handler(req, { params: Promise.resolve(params) });
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
let liveFullKeyPlaintext: string; // ambiente live, os 3 escopos
let testFullKeyPlaintext: string; // ambiente test, os 3 escopos
let scopedOutKeyPlaintext: string; // só carts:match — para forçar 403 em schools.*/lists.*
let schoolsOnlyKeyPlaintext: string; // só schools:read — para forçar 403 em carts.match

beforeAll(async () => {
  await seedUsers();
  HANDLERS = await routes();
  openapiGET = (await import("@/app/v1/openapi.json/route")).GET;
  catchAllGET = (await import("@/app/v1/[...rest]/route")).GET;

  // Escola com contato sensível (e-mail, telefone, endereço, CEP) e itens com alerts/confidence internos.
  sensitiveSchoolInep = await withSuperuser(async (c) => {
    const schoolId = await seedSchool(c, "5199" + String(Math.floor(Math.random() * 900 + 100)).padStart(4, "0"), true);
    await c.query(
      `update public.schools set email = 'diretoria@escola-sensivel.example.test', phone = '+5565988887777',
              address = 'Rua das Escolas, 123', cep = '78005999' where id = $1`,
      [schoolId],
    );
    const listId = await seedList(c, schoolId, "ef-1", 2027);
    // `seedList` sempre insere `is_demo = true` (fixture genérica); esta lista representa o cenário REAL (chave
    // `live`), então precisa ser marcada como não-demo explicitamente — sem isto, `b2b_v1_visible_lists` a
    // esconde da chave `live` (regra: live = escola E lista não-demo) e todo o cenário "sensível" fica invisível
    // sob `live`, sem nenhum teste notar (bug encontrado ao endurecer a varredura nesta correção).
    await c.query("update public.school_lists set is_demo = false where id = $1", [listId]);
    sensitiveListId = listId;
    // NÃO usa `seedCandidate` (nomeia os itens "Caderno 1"/"Caderno 2" — nome genérico reusado por outras listas
    // legítimas, como a demo, o que geraria falso positivo na varredura). Nomes distintos e únicos aqui.
    const v1Row = await c.query("select version_id from public.list_create_candidate_version($1, 'admin', null, null)", [listId]);
    const v1 = v1Row.rows[0].version_id as string;
    await c.query(
      `insert into public.list_items (version_id, position, original_name, normalized_name, category, quantity, unit, confidence, alerts) values
       ($1, 1, 'Caderno Sigiloso V1 A', 'caderno sigiloso v1 a', 'papelaria', 2, 'un', 0.9, '["low_confidence_item"]'::jsonb),
       ($1, 2, 'Caderno Sigiloso V1 B', 'caderno sigiloso v1 b', 'papelaria', 2, 'un', 0.9, '["low_confidence_item"]'::jsonb)`,
      [v1],
    );
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

  // Escola demo com sua própria lista publicada (usada para exercitar TODOS os endpoints com chave `test`).
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
  FORBIDDEN_VALUES.add("Caderno Sigiloso V1 A").add("Caderno Sigiloso V1 B");

  // Parceiro real (o que vamos usar nas chamadas) + chaves com escopos diferentes, nos dois ambientes.
  const realPartnerId = await withSuperuser((c) =>
    seedPartner(c, { status: "active", ownerId: null, limits: { testMinute: 1000, testDay: 100_000, liveMinute: 1000, liveDay: 100_000 } }),
  );
  partnerIds.push(realPartnerId);
  const s1 = secret();
  const liveFullKey = await withSuperuser((c) => seedKey(c, realPartnerId, { environment: "live", secret: s1, scopes: ["schools:read", "lists:read", "carts:match"] }));
  liveFullKeyPlaintext = `lc_live_${liveFullKey.publicId}_${s1}`;
  const s4 = secret();
  const testFullKey = await withSuperuser((c) => seedKey(c, realPartnerId, { environment: "test", secret: s4, scopes: ["schools:read", "lists:read", "carts:match"] }));
  testFullKeyPlaintext = `lc_test_${testFullKey.publicId}_${s4}`;
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

// ---------------------------------------------------------------------------
// Fixture por endpoint (chave: `entry.id`). Um endpoint do registro sem entrada aqui faz o teste lançar (ver loop
// principal) — nenhum endpoint escapa da varredura em silêncio.
// ---------------------------------------------------------------------------
type EndpointFixture = {
  success: (env: "live" | "test") => CaseSpec;
  notFound?: () => CaseSpec;
  invalidRequest?: () => CaseSpec;
  tooLarge?: () => CaseSpec;
  wrongMediaType?: () => CaseSpec;
  paginated?: boolean;
};

function fixtures(): Record<string, EndpointFixture> {
  return {
    "schools.list": {
      success: () => ({ query: { limit: "100" } }),
      invalidRequest: () => ({ query: { limit: "100", nope: "1" } }),
      paginated: true,
    },
    "schools.get": {
      success: (env) => ({ params: { inep: env === "live" ? sensitiveSchoolInep : demoSchoolInep } }),
      notFound: () => ({ params: { inep: "00000000" } }),
      invalidRequest: () => ({ params: { inep: "abc" } }),
    },
    "schools.lists": {
      success: (env) => ({ params: { inep: env === "live" ? sensitiveSchoolInep : demoSchoolInep } }),
      notFound: () => ({ params: { inep: "00000000" } }),
      invalidRequest: () => ({ params: { inep: sensitiveSchoolInep }, query: { nope: "1" } }),
      paginated: true,
    },
    "lists.get": {
      success: (env) => ({ params: { id: env === "live" ? sensitiveListId : demoListId } }),
      notFound: () => ({ params: { id: randomUUID() } }),
      invalidRequest: () => ({ params: { id: "nao-e-uuid" } }),
    },
    "lists.items": {
      success: (env) => ({ params: { id: env === "live" ? sensitiveListId : demoListId } }),
      notFound: () => ({ params: { id: randomUUID() } }),
      invalidRequest: () => ({ params: { id: sensitiveListId }, query: { nope: "1" } }),
      paginated: true,
    },
    "carts.match": {
      success: (env) => ({ body: { list_id: env === "live" ? sensitiveListId : demoListId, skus: [{ sku: "SKU-X", name: "Produto Qualquer" }] } }),
      notFound: () => ({ body: { list_id: randomUUID(), skus: [{ sku: "X", name: "Y" }] } }),
      invalidRequest: () => ({ body: { list_id: sensitiveListId } }), // falta "skus" -> 400
      tooLarge: () => ({ body: { list_id: sensitiveListId, skus: Array.from({ length: 5000 }, (_, i) => ({ sku: `S${i}`, name: "x".repeat(190) })) } }),
      wrongMediaType: () => ({ rawBody: "list_id=1", contentType: "text/plain" }),
    },
  };
}

async function paginateAndRecord(label: string, handler: RouteHandler, path: string, baseSpec: CaseSpec, key: string): Promise<void> {
  let cursor: string | undefined;
  for (let i = 0; i < 10; i += 1) {
    const spec: CaseSpec = { ...baseSpec, query: { ...(baseSpec.query ?? {}), limit: "1", ...(cursor ? { cursor } : {}) } };
    const res = await callEntry(handler, path, "GET", spec, key);
    const clone = res.clone();
    await record(`${label} page ${i}`, res);
    if (res.status !== 200) break;
    const json = (await clone.json()) as { next_cursor?: string };
    cursor = json.next_cursor;
    if (!cursor) break;
  }
}

describe("varredura de vazamento: registro completo (ENDPOINTS x {live, test} x casos alcançáveis)", () => {
  it("coleta sucesso (+ paginação), 401, 403, 404, 400 e os erros específicos de cada endpoint do registro", async () => {
    const fx = fixtures();

    for (const { entry } of ENDPOINTS) {
      const fixture = fx[entry.id];
      if (!fixture) throw new Error(`b2b-api-leak.test.ts: endpoint "${entry.id}" está em ENDPOINTS sem fixture na varredura — adicione um em fixtures() antes de mesclar.`);
      const handler = HANDLERS[entry.id];
      if (!handler) throw new Error(`b2b-api-leak.test.ts: sem handler HTTP mapeado para "${entry.id}".`);

      for (const env of ["live", "test"] as const) {
        const key = env === "live" ? liveFullKeyPlaintext : testFullKeyPlaintext;
        const spec = fixture.success(env);
        const res = await callEntry(handler, entry.path, entry.method, spec, key);
        await record(`${entry.id} success ${env}`, res);
        if (fixture.paginated) await paginateAndRecord(`${entry.id} ${env}`, handler, entry.path, spec, key);
      }

      // 401: sem chave (nunca toca params/query/body — a mesma "success" serve de veículo).
      await record(`${entry.id} no-key`, await callEntry(handler, entry.path, entry.method, fixture.success("live"), undefined));

      // 403: escopo insuficiente.
      if (entry.errors.includes("insufficient_scope")) {
        const wrongScopeKey = entry.scope === "carts:match" ? schoolsOnlyKeyPlaintext : scopedOutKeyPlaintext;
        await record(`${entry.id} wrong-scope`, await callEntry(handler, entry.path, entry.method, fixture.success("live"), wrongScopeKey));
      }

      // 404.
      if (entry.errors.includes("not_found")) {
        if (!fixture.notFound) throw new Error(`"${entry.id}" declara not_found nos erros mas a fixture não tem notFound().`);
        await record(`${entry.id} not-found`, await callEntry(handler, entry.path, entry.method, fixture.notFound(), liveFullKeyPlaintext));
      }

      // 400.
      if (entry.errors.includes("invalid_request")) {
        if (!fixture.invalidRequest) throw new Error(`"${entry.id}" declara invalid_request nos erros mas a fixture não tem invalidRequest().`);
        await record(`${entry.id} invalid-request`, await callEntry(handler, entry.path, entry.method, fixture.invalidRequest(), liveFullKeyPlaintext));
      }

      // 413.
      if (entry.errors.includes("payload_too_large")) {
        if (!fixture.tooLarge) throw new Error(`"${entry.id}" declara payload_too_large nos erros mas a fixture não tem tooLarge().`);
        await record(`${entry.id} too-large`, await callEntry(handler, entry.path, entry.method, fixture.tooLarge(), liveFullKeyPlaintext));
      }

      // 415.
      if (entry.errors.includes("unsupported_media_type")) {
        if (!fixture.wrongMediaType) throw new Error(`"${entry.id}" declara unsupported_media_type nos erros mas a fixture não tem wrongMediaType().`);
        await record(`${entry.id} wrong-media-type`, await callEntry(handler, entry.path, entry.method, fixture.wrongMediaType(), liveFullKeyPlaintext));
      }
    }

    // 429: parceiro dedicado com limite mínimo (o corpo/cabeçalho de 429 não varia por endpoint — a janela é do
    // balde (parceiro, ambiente), não do endpoint; testar uma vez basta para a varredura de forma/conteúdo).
    const smallPartnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: null, limits: { testMinute: 1, testDay: 1000 } }));
    partnerIds.push(smallPartnerId);
    const smallSecret = secret();
    const smallKey = await withSuperuser((c) => seedKey(c, smallPartnerId, { environment: "test", secret: smallSecret }));
    const smallPlaintext = `lc_test_${smallKey.publicId}_${smallSecret}`;
    await record("rate-limit ok", await callEntry(HANDLERS["schools.list"]!, "/v1/schools", "GET", { query: { limit: "1" } }, smallPlaintext));
    await record("rate-limit 429", await callEntry(HANDLERS["schools.list"]!, "/v1/schools", "GET", { query: { limit: "1" } }, smallPlaintext));

    // Regras de negócio específicas (adicionais ao loop genérico: mesma família de erro — 404 —, mas provando
    // CADA motivo de invisibilidade, não só "id inexistente").
    await record(
      "schools.lists unpublished-empty",
      await callEntry(HANDLERS["schools.lists"]!, "/v1/schools/{inep}/lists", "GET", { params: { inep: unpublishedListSchoolInep } }, liveFullKeyPlaintext),
    );
    await record(
      "schools.get suspended-404",
      await callEntry(HANDLERS["schools.get"]!, "/v1/schools/{inep}", "GET", { params: { inep: suspendedSchoolInep } }, liveFullKeyPlaintext),
    );
    await record(
      "schools.get disabled-muni-404",
      await callEntry(HANDLERS["schools.get"]!, "/v1/schools/{inep}", "GET", { params: { inep: disabledMuniSchoolInep } }, liveFullKeyPlaintext),
    );
    await record(
      "lists.get demo-list-with-live-key-404",
      await callEntry(HANDLERS["lists.get"]!, "/v1/lists/{id}", "GET", { params: { id: demoListId } }, liveFullKeyPlaintext),
    );
    await record(
      "lists.get version-id-not-a-list-404",
      await callEntry(HANDLERS["lists.get"]!, "/v1/lists/{id}", "GET", { params: { id: supersededVersion1Id } }, liveFullKeyPlaintext),
    );

    await record("openapi.json", await callEntry(openapiGET, "/v1/openapi.json", "GET", {}, undefined));
    await record("catch-all", await callEntry(catchAllGET, "/v1/inexistente", "GET", {}, undefined));

    // Todo endpoint do registro precisa ter gerado ao menos um "success" por ambiente: se um endpoint novo entrar
    // sem call real (bug na própria varredura), este count não cresce o suficiente.
    expect(RESPONSES.length).toBeGreaterThanOrEqual(ENDPOINTS.length * 2 + 10);
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
    for (const expected of [200, 400, 401, 403, 404, 413, 415, 429]) expect(statuses.has(expected)).toBe(true);
  });

  it("todo endpoint do registro tem ao menos um success live e um success test coletados", () => {
    for (const { entry } of ENDPOINTS) {
      const live = RESPONSES.find((r) => r.label === `${entry.id} success live`);
      const test = RESPONSES.find((r) => r.label === `${entry.id} success test`);
      expect(live?.status).toBe(200);
      expect(test?.status).toBe(200);
    }
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
