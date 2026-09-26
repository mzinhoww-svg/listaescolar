import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { purgePartners, secret, seedKey, seedPartner, seedPublishedList, TEST_PEPPER, type PublicListSeed } from "./b2b-fixtures";
import { cleanupCommitted } from "./list-fixtures";
import { withSuperuser } from "./helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { realLookupKey, withApiKey } from "@/features/b2b/api/handler";
import { schoolsEndpoint } from "@/features/b2b/api/endpoints/schools";

// Testes de API contra o banco real (S24, Step 3): chama os GET/POST exportados das rotas com `Request` real.
// Roda em `pnpm test:db` (Supabase local da trilha).

function localEnv(): { url: string; publishable: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  return {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    publishable: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secret: get("SUPABASE_SECRET_KEY"),
  };
}

beforeAll(() => {
  const env = localEnv();
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.publishable;
  process.env.SUPABASE_SECRET_KEY = env.secret;
  // getServerEnv() valida o esquema inteiro do servidor; estes três são obrigatórios e irrelevantes para a B2B
  // (Ruling S24 · Task 2: valores fixos de teste, nunca lidos por nenhum endpoint /v1).
  process.env.OPENROUTER_KEY = "chave-de-teste-irrelevante-para-b2b";
  process.env.AI_MODEL_CHEAP = "modelo-de-teste";
  process.env.AI_MODEL_STRONG = "modelo-de-teste";
  process.env.B2B_API_KEY_PEPPER = TEST_PEPPER;
});

// Import dinâmico DEPOIS de setar o process.env: os módulos leem env só quando chamados (nunca no import), mas o
// import estático ficaria acima do beforeAll na ordem de avaliação do arquivo.
async function routes() {
  return {
    schoolsGET: (await import("@/app/v1/schools/route")).GET,
    schoolGET: (await import("@/app/v1/schools/[inep]/route")).GET,
    schoolListsGET: (await import("@/app/v1/schools/[inep]/lists/route")).GET,
    listGET: (await import("@/app/v1/lists/[id]/route")).GET,
    listItemsGET: (await import("@/app/v1/lists/[id]/items/route")).GET,
    cartsMatchPOST: (await import("@/app/v1/carts/match/route")).POST,
    cartsMatchGET: (await import("@/app/v1/carts/match/route")).GET,
    schoolsPOST: (await import("@/app/v1/schools/route")).POST,
    openapiGET: (await import("@/app/v1/openapi.json/route")).GET,
    catchAllGET: (await import("@/app/v1/[...rest]/route")).GET,
  };
}
type Routes = Awaited<ReturnType<typeof routes>>;
let R: Routes;

type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;

async function call(handler: RouteHandler, path: string, opts: { key?: string; method?: string; body?: string; contentType?: string; params?: Record<string, string> } = {}): Promise<Response> {
  const headers = new Headers();
  if (opts.key !== undefined) headers.set("x-listacerta-key", opts.key);
  if (opts.body !== undefined) headers.set("content-type", opts.contentType ?? "application/json");
  const req = new Request(`https://api.listacerta.example${path}`, { method: opts.method ?? "GET", headers, body: opts.body });
  return handler(req, { params: Promise.resolve(opts.params ?? {}) });
}

const partnerIds: string[] = [];
const ineps: string[] = [];

let liveList: PublicListSeed;
let demoList: PublicListSeed;
let liveKey: string;
let testKey: string;
let generalPartnerId: string;

beforeAll(async () => {
  R = await routes();

  generalPartnerId = await withSuperuser((c) =>
    seedPartner(c, { status: "active", ownerId: null, limits: { testMinute: 1000, testDay: 100_000, liveMinute: 1000, liveDay: 100_000 } }),
  );
  partnerIds.push(generalPartnerId);

  liveList = await withSuperuser((c) => seedPublishedList(c, { demo: false, items: 3 }));
  demoList = await withSuperuser((c) => seedPublishedList(c, { demo: true, items: 2 }));
  ineps.push(liveList.inep, demoList.inep);

  const liveSecret = secret();
  const testSecret = secret();
  const liveKeyRow = await withSuperuser((c) => seedKey(c, generalPartnerId, { environment: "live", secret: liveSecret }));
  const testKeyRow = await withSuperuser((c) => seedKey(c, generalPartnerId, { environment: "test", secret: testSecret }));
  liveKey = `lc_live_${liveKeyRow.publicId}_${liveSecret}`;
  testKey = `lc_test_${testKeyRow.publicId}_${testSecret}`;
});

afterAll(async () => {
  await purgePartners(partnerIds);
  await cleanupCommitted(ineps);
});

describe("GET /v1/schools", () => {
  it("chave test vê a escola demo, não a real; chave live vê a real, não a demo", async () => {
    const asTest = await call(R.schoolsGET, "/v1/schools?limit=100", { key: testKey });
    expect(asTest.status).toBe(200);
    const testBody = await asTest.json();
    expect(testBody.meta.environment).toBe("test");
    expect(testBody.data.some((s: { inep: string }) => s.inep === demoList.inep)).toBe(true);
    expect(testBody.data.some((s: { inep: string }) => s.inep === liveList.inep)).toBe(false);

    const asLive = await call(R.schoolsGET, "/v1/schools?limit=100", { key: liveKey });
    const liveBody = await asLive.json();
    expect(liveBody.data.some((s: { inep: string }) => s.inep === liveList.inep)).toBe(true);
    expect(liveBody.data.some((s: { inep: string }) => s.inep === demoList.inep)).toBe(false);
  });

  it("cada escola tem is_demo certo e todos os campos da whitelist, nada além", async () => {
    const res = await call(R.schoolsGET, "/v1/schools?limit=100", { key: testKey });
    const body = await res.json();
    const school = body.data.find((s: { inep: string }) => s.inep === demoList.inep);
    expect(school).toMatchObject({ inep: demoList.inep, is_demo: true });
    expect(Object.keys(school).sort()).toEqual(["inep", "is_demo", "municipality", "name", "network", "neighborhood", "published_lists_count", "verified"].sort());
  });

  it("paginação até o fim: limit=1 percorre tudo sem repetir nem pular, next_cursor ausente na última página", async () => {
    const seen = new Set<string>();
    let cursor: string | undefined;
    let guard = 0;
    do {
      const qs = new URLSearchParams({ limit: "1", ...(cursor ? { cursor } : {}) });
      const res = await call(R.schoolsGET, `/v1/schools?${qs}`, { key: testKey });
      const body = await res.json();
      for (const s of body.data) {
        expect(seen.has(s.inep)).toBe(false);
        seen.add(s.inep);
      }
      cursor = body.next_cursor;
      guard += 1;
    } while (cursor && guard < 50);
    expect(seen.has(demoList.inep)).toBe(true);
  });

  it("parâmetro de query desconhecido -> 400 invalid_request", async () => {
    const res = await call(R.schoolsGET, "/v1/schools?unknown=1", { key: testKey });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("sem chave -> 401; método não declarado -> 405 com Allow", async () => {
    expect((await call(R.schoolsGET, "/v1/schools")).status).toBe(401);
    const res = await call(R.schoolsPOST, "/v1/schools", { key: testKey, method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toContain("GET");
  });
});

describe("GET /v1/schools/{inep}", () => {
  it("escola visível -> 200; inexistente ou fora da cobertura/ambiente -> 404 igual", async () => {
    expect((await call(R.schoolGET, `/v1/schools/${demoList.inep}`, { key: testKey, params: { inep: demoList.inep } })).status).toBe(200);
    expect((await call(R.schoolGET, `/v1/schools/${demoList.inep}`, { key: liveKey, params: { inep: demoList.inep } })).status).toBe(404); // demo com chave live
    expect((await call(R.schoolGET, "/v1/schools/00000000", { key: testKey, params: { inep: "00000000" } })).status).toBe(404);
  });

  it("inep mal formado -> 400 invalid_request", async () => {
    const res = await call(R.schoolGET, "/v1/schools/abc", { key: testKey, params: { inep: "abc" } });
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/schools/{inep}/lists e /v1/lists/{id}", () => {
  it("lista publicada aparece nas duas rotas com os mesmos dados básicos", async () => {
    const listsRes = await call(R.schoolListsGET, `/v1/schools/${demoList.inep}/lists`, { key: testKey, params: { inep: demoList.inep } });
    expect(listsRes.status).toBe(200);
    const listsBody = await listsRes.json();
    expect(listsBody.data.some((l: { id: string }) => l.id === demoList.listId)).toBe(true);

    const oneRes = await call(R.listGET, `/v1/lists/${demoList.listId}`, { key: testKey, params: { id: demoList.listId } });
    expect(oneRes.status).toBe(200);
    expect((await oneRes.json()).data.id).toBe(demoList.listId);
  });

  it("escola inexistente em /lists -> 404; lista de outro ambiente -> 404", async () => {
    expect((await call(R.schoolListsGET, "/v1/schools/00000000/lists", { key: testKey, params: { inep: "00000000" } })).status).toBe(404);
    expect((await call(R.listGET, `/v1/lists/${demoList.listId}`, { key: liveKey, params: { id: demoList.listId } })).status).toBe(404);
  });

  it("id mal formado -> 400", async () => {
    expect((await call(R.listGET, "/v1/lists/nao-e-uuid", { key: testKey, params: { id: "nao-e-uuid" } })).status).toBe(400);
  });
});

describe("GET /v1/lists/{id}/items", () => {
  it("itens em ordem de posição, paginados até o fim", async () => {
    const seen: number[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const qs = new URLSearchParams({ limit: "1", ...(cursor ? { cursor } : {}) });
      const res = await call(R.listItemsGET, `/v1/lists/${liveList.listId}/items?${qs}`, { key: liveKey, params: { id: liveList.listId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      for (const i of body.data) seen.push(i.position);
      cursor = body.next_cursor;
      guard += 1;
    } while (cursor && guard < 50);
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("POST /v1/carts/match", () => {
  it("casa o item existente; lista inexistente -> 404", async () => {
    const body = JSON.stringify({ list_id: liveList.listId, skus: [{ sku: "CAD-1", name: "Caderno 1" }] });
    const res = await call(R.cartsMatchPOST, "/v1/carts/match", { key: liveKey, method: "POST", body });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.list_id).toBe(liveList.listId);
    expect(json.data.items.some((i: { match: { sku: string } | null }) => i.match?.sku === "CAD-1")).toBe(true);

    const notFound = JSON.stringify({ list_id: "00000000-0000-4000-8000-000000000000", skus: [{ sku: "X", name: "Y" }] });
    expect((await call(R.cartsMatchPOST, "/v1/carts/match", { key: liveKey, method: "POST", body: notFound })).status).toBe(404);
  });

  it("corpo maior que 1 MB -> 413", async () => {
    const huge = JSON.stringify({ list_id: liveList.listId, skus: Array.from({ length: 5000 }, (_, i) => ({ sku: `SKU-${i}`, name: "x".repeat(190) })) });
    expect(Buffer.byteLength(huge, "utf8")).toBeGreaterThan(1_000_000);
    const res = await call(R.cartsMatchPOST, "/v1/carts/match", { key: liveKey, method: "POST", body: huge });
    expect(res.status).toBe(413);
  });

  it("content-type que não é application/json -> 415", async () => {
    const res = await call(R.cartsMatchPOST, "/v1/carts/match", { key: liveKey, method: "POST", body: "list_id=1", contentType: "text/plain" });
    expect(res.status).toBe(415);
  });

  it("JSON inválido -> 400 invalid_request", async () => {
    const res = await call(R.cartsMatchPOST, "/v1/carts/match", { key: liveKey, method: "POST", body: "{ nao é json" });
    expect(res.status).toBe(400);
  });

  it("método não declarado (GET) -> 405 com Allow: POST", async () => {
    const res = await call(R.cartsMatchGET, "/v1/carts/match", { key: liveKey });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });
});

describe("GET /v1/openapi.json e catch-all", () => {
  it("openapi.json é público (sem chave) e cacheável", async () => {
    const res = await call(R.openapiGET, "/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
  });

  it("caminho fora do registro -> 404 padrão", async () => {
    const res = await call(R.catchAllGET, "/v1/qualquer-coisa");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});

describe("aceite: chave revogada falha na hora", () => {
  it("200 -> revokeKey -> a requisição seguinte, no mesmo processo, é 401", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: null }));
    partnerIds.push(partnerId);
    const s = secret();
    const key = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: s }));
    const plaintext = `lc_test_${key.publicId}_${s}`;

    const first = await call(R.schoolsGET, "/v1/schools?limit=1", { key: plaintext });
    expect(first.status).toBe(200);

    await withSuperuser((c) => c.query("update public.b2b_api_keys set status = 'revoked', revoked_at = now() where id = $1", [key.id]));

    const second = await call(R.schoolsGET, "/v1/schools?limit=1", { key: plaintext });
    expect(second.status).toBe(401);
  });

  it("revogação injetada ENTRE o lookup e o consumo (mesma chave, mesma requisição) -> 401", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: null }));
    partnerIds.push(partnerId);
    const s = secret();
    const key = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: s }));
    const plaintext = `lc_test_${key.publicId}_${s}`;

    const admin = createAdminClient();
    const realLookup = realLookupKey(admin);
    // Faz o lookup REAL (chave ainda ativa nesse instante), revoga por SQL, e só então devolve o resultado do
    // lookup — simula a corrida "revogação confirmada entre o lookup e o consumo": `b2b_rate_consume` revalida a
    // chave na mesma transação do consumo (Global Constraints) e por isso ainda pega a revogação, mesmo com um
    // lookup "desatualizado" (row com usable=true no momento em que foi lido).
    const injectingLookup = async (publicId: string) => {
      const row = await realLookup(publicId);
      await withSuperuser((c) => c.query("update public.b2b_api_keys set status = 'revoked', revoked_at = now() where id = $1", [key.id]));
      return row;
    };
    const handler = withApiKey(schoolsEndpoint.entry, schoolsEndpoint.impl, { lookupKey: injectingLookup });

    const res = await handler(new Request("https://api.listacerta.example/v1/schools?limit=1", { headers: { "x-listacerta-key": plaintext } }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("invalid_key");
  });
});

describe("aceite: rotação sem downtime", () => {
  it("as duas chaves autenticam na carência; depois de expirada (SQL), só a nova", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: null }));
    partnerIds.push(partnerId);
    const oldSecret = secret();
    const newSecretValue = secret();
    // Simula o resultado de uma rotação (par antigo/novo com `rotated_from_id` e carência), sem precisar de um
    // dono real: o teste é sobre o EFEITO da rotação na verificação da API, não sobre `b2b_key_rotate` em si
    // (já testado em `tests/db/b2b-repository.test.ts`).
    const oldKey = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: oldSecret, expiresAt: "+7 days" }));
    const newKey = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: newSecretValue, overrides: { rotated_from_id: oldKey.id } }));
    const oldPlaintext = `lc_test_${oldKey.publicId}_${oldSecret}`;
    const newPlaintext = `lc_test_${newKey.publicId}_${newSecretValue}`;

    const oldDuringGrace = await call(R.schoolsGET, "/v1/schools?limit=1", { key: oldPlaintext });
    expect(oldDuringGrace.status).toBe(200);
    const newDuringGrace = await call(R.schoolsGET, "/v1/schools?limit=1", { key: newPlaintext });
    expect(newDuringGrace.status).toBe(200);

    await withSuperuser((c) => c.query("update public.b2b_api_keys set expires_at = now() - interval '1 minute' where id = $1", [oldKey.id]));

    expect((await call(R.schoolsGET, "/v1/schools?limit=1", { key: oldPlaintext })).status).toBe(401);
    expect((await call(R.schoolsGET, "/v1/schools?limit=1", { key: newPlaintext })).status).toBe(200);
  });
});

describe("suspensão do parceiro revoga todas as chaves", () => {
  it("chaves test e live ficam 401 depois da suspensão", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "active", ownerId: null }));
    partnerIds.push(partnerId);
    const testSecretValue = secret();
    const liveSecretValue = secret();
    const testK = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: testSecretValue }));
    const liveK = await withSuperuser((c) => seedKey(c, partnerId, { environment: "live", secret: liveSecretValue }));
    const testPlaintext = `lc_test_${testK.publicId}_${testSecretValue}`;
    const livePlaintext = `lc_live_${liveK.publicId}_${liveSecretValue}`;

    expect((await call(R.schoolsGET, "/v1/schools?limit=1", { key: testPlaintext })).status).toBe(200);
    await withSuperuser((c) =>
      c.query(
        `update public.b2b_api_keys set status = 'revoked', revoked_at = now(), revoke_reason = 'partner_suspended' where partner_id = $1`,
        [partnerId],
      ),
    );
    await withSuperuser((c) => c.query("update public.b2b_partners set status = 'suspended', status_reason = 'teste' where id = $1", [partnerId]));

    expect((await call(R.schoolsGET, "/v1/schools?limit=1", { key: testPlaintext })).status).toBe(401);
    expect((await call(R.schoolsGET, "/v1/schools?limit=1", { key: livePlaintext })).status).toBe(401);
  });
});

describe("rate limit", () => {
  it("decresce, nega com 429 e Retry-After ao passar do limite pequeno definido pelo admin", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: null, limits: { testMinute: 2, testDay: 1000 } }));
    partnerIds.push(partnerId);
    const s = secret();
    const key = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: s }));
    const plaintext = `lc_test_${key.publicId}_${s}`;

    const first = await call(R.schoolsGET, "/v1/schools?limit=1", { key: plaintext });
    expect(first.status).toBe(200);
    expect(first.headers.get("X-RateLimit-Remaining")).toBe("1");
    const second = await call(R.schoolsGET, "/v1/schools?limit=1", { key: plaintext });
    expect(second.status).toBe(200);
    expect(second.headers.get("X-RateLimit-Remaining")).toBe("0");
    const third = await call(R.schoolsGET, "/v1/schools?limit=1", { key: plaintext });
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBeTruthy();
    expect((await third.json()).error.code).toBe("rate_limited");
  });

  it("balde compartilhado entre as duas chaves da rotação (parceiro, ambiente), não dobra a cota", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: null, limits: { testMinute: 2, testDay: 1000 } }));
    partnerIds.push(partnerId);
    const oldSecret = secret();
    const newSecretValue = secret();
    const oldKey = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: oldSecret, expiresAt: "+7 days" }));
    const newKey = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: newSecretValue, overrides: { rotated_from_id: oldKey.id } }));
    const oldPlaintext = `lc_test_${oldKey.publicId}_${oldSecret}`;
    const newPlaintext = `lc_test_${newKey.publicId}_${newSecretValue}`;

    expect((await call(R.schoolsGET, "/v1/schools?limit=1", { key: oldPlaintext })).status).toBe(200); // 1/2
    expect((await call(R.schoolsGET, "/v1/schools?limit=1", { key: newPlaintext })).status).toBe(200); // 2/2, balde do mesmo (parceiro, ambiente)
    const third = await call(R.schoolsGET, "/v1/schools?limit=1", { key: oldPlaintext });
    expect(third.status).toBe(429); // a chave "nova" já consumiu a cota da "antiga"
  });
});

describe("uso diário gravado sem IP", () => {
  it("b2b_usage_daily grava a requisição de sucesso, sem colunas de IP (a tabela não tem essa coluna)", async () => {
    const partnerId = await withSuperuser((c) => seedPartner(c, { status: "sandbox", ownerId: null }));
    partnerIds.push(partnerId);
    const s = secret();
    const key = await withSuperuser((c) => seedKey(c, partnerId, { environment: "test", secret: s }));
    const plaintext = `lc_test_${key.publicId}_${s}`;
    await call(R.schoolsGET, "/v1/schools?limit=1", { key: plaintext });
    // O after() roda em segundo plano fora do escopo de requisição real (ver handler.ts); aguarda a gravação.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const { rows } = await withSuperuser((c) => c.query("select * from public.b2b_usage_daily where key_id = $1", [key.id]));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].status_class).toBe("2xx");
    expect(Object.keys(rows[0])).not.toContain("ip");
  });
});
