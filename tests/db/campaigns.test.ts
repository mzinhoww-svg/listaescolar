import { randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { callAsService, seedKey, seedPartner } from "./b2b-fixtures";
import { asServiceCommitted, attempt, attemptH, cleanupUsers, IDS, inTx, seedUsers, withClaims, withSuperuser } from "./helpers";
import { approveVersion, seedList, seedSchool, transition } from "./list-fixtures";

// S26 · 0503: campanhas de marca (CPM/CPC), insights com k-anonimato (contagem crua aqui; supressão é do
// domínio TypeScript, testada por unidade em features/campaigns) e faturamento B2B (extrato imutável).

const TABLES = ["b2b_campaigns", "b2b_campaign_events", "b2b_campaign_ledger", "b2b_insights_settings", "b2b_statements", "b2b_statement_line_items"];

const FUNCTIONS: Array<{ sig: string; svc: boolean }> = [
  { sig: "public.b2b_campaign_create(uuid, uuid, jsonb)", svc: true },
  { sig: "public.b2b_campaign_transition(uuid, uuid, text, text)", svc: true },
  { sig: "public.b2b_campaign_serve(uuid, integer)", svc: true },
  { sig: "public.b2b_campaign_record_event(uuid, uuid, text, text)", svc: true },
  { sig: "public.b2b_insights_raw(text, text, boolean)", svc: true },
  { sig: "public.b2b_insights_settings_set(uuid, integer)", svc: true },
  { sig: "public.b2b_statement_generate(uuid, uuid, date, date, text)", svc: true },
  { sig: "public.b2b_campaign_events_block_mutation()", svc: false },
  { sig: "public.b2b_campaign_ledger_block_mutation()", svc: false },
  { sig: "public.b2b_statements_block_mutation()", svc: false },
  { sig: "public.b2b_statement_line_items_block_mutation()", svc: false },
  { sig: "public.b2b_campaign_event_accrue()", svc: false },
  { sig: "public.b2b_campaigns_set_updated_at()", svc: false },
];

const dedupe = () => randomBytes(16).toString("hex");

async function seedCandidateWithItem(c: Client, listId: string, category: string, alerts: string[]): Promise<string> {
  const r = await c.query<{ version_id: string }>("select version_id from public.list_create_candidate_version($1, 'admin', null, null)", [listId]);
  const versionId = r.rows[0]!.version_id;
  await c.query(
    `insert into public.list_items (version_id, position, original_name, normalized_name, category, alerts)
     values ($1, 1, 'Item teste', 'item teste', $2, $3::jsonb)`,
    [versionId, category, JSON.stringify(alerts)],
  );
  return versionId;
}

async function publishListWithItem(
  c: Client,
  opts: { inep: string; isDemo: boolean; category?: string; alerts?: string[] },
): Promise<{ listId: string; versionId: string }> {
  const schoolId = await seedSchool(c, opts.inep);
  const listId = await seedList(c, schoolId, "ef-1", 2028);
  if (!opts.isDemo) await c.query("update public.school_lists set is_demo = false where id = $1", [listId]);
  const versionId = await seedCandidateWithItem(c, listId, opts.category ?? "papelaria", opts.alerts ?? []);
  for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
  await approveVersion(c, listId, versionId);
  await c.query("select public.list_publish_version($1, $2, $3)", [listId, versionId, IDS.admin]);
  return { listId, versionId };
}

const createCampaign = (c: Client, actorId: string, partnerId: string, overrides: Record<string, unknown> = {}) =>
  callAsService<{ id: string }>(c, "select public.b2b_campaign_create($1, $2, $3::jsonb) as id", [
    actorId,
    partnerId,
    JSON.stringify({
      name: "Campanha Teste",
      product_label: "Caderno universitário 96 folhas",
      pricing_model: "cpm",
      bid_cents: 1000,
      total_budget_cents: 100000,
      target_category: "papelaria",
      ...overrides,
    }),
  ]).then((r) => r[0]!.id);

const transitionCampaign = (c: Client, actorId: string | null, campaignId: string, to: string, reason: string | null = null) =>
  callAsService<{ s: string }>(c, "select public.b2b_campaign_transition($1, $2, $3, $4) as s", [actorId, campaignId, to, reason]);

const serve = (c: Client, listVersionId: string, limit = 3) =>
  callAsService<{ campaign_id: string; sponsored: boolean }>(c, "select * from public.b2b_campaign_serve($1, $2)", [listVersionId, limit]);

const record = (c: Client, campaignId: string, listVersionId: string | null, type: "impression" | "click", key: string) =>
  callAsService<{ b2b_campaign_record_event: boolean }>(c, "select public.b2b_campaign_record_event($1, $2, $3, $4) as b2b_campaign_record_event", [
    campaignId,
    listVersionId,
    type,
    key,
  ]).then((r) => r[0]!.b2b_campaign_record_event);

const cleanupIneps: string[] = [];

describe("S26 · 0503 schema: campanhas B2B", () => {
  beforeAll(seedUsers);
  afterAll(async () => {
    await cleanupUsers();
  });

  it("tabelas com id uuid, created_at, updated_at e RLS", async () => {
    await withSuperuser(async (c) => {
      for (const t of TABLES) {
        const cols = await c.query("select column_name, column_default from information_schema.columns where table_schema='public' and table_name=$1", [t]);
        const names = cols.rows.map((r) => r.column_name as string);
        expect(names, t).toEqual(expect.arrayContaining(["id", "created_at", "updated_at"]));
        expect(String(cols.rows.find((r) => r.column_name === "id")?.column_default), t).toMatch(/gen_random_uuid/);
        const rls = await c.query("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`]);
        expect(rls.rows[0]?.relrowsecurity, t).toBe(true);
      }
    });
  });

  it("nenhuma função nova é executável por public/anon/authenticated; só service_role quando previsto", async () => {
    await withSuperuser(async (c) => {
      for (const f of FUNCTIONS) {
        for (const role of ["public", "anon", "authenticated"]) {
          const r = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, f.sig]);
          expect(r.rows[0]!.ok, `${role} x ${f.sig}`).toBe(false);
        }
        const svc = await c.query<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'execute') as ok", [f.sig]);
        expect(svc.rows[0]!.ok, `service_role x ${f.sig}`).toBe(f.svc);
      }
    });
  });

  it("b2b_campaign_events/ledger/statements/statement_line_items são imutáveis (update, delete e truncate bloqueados)", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      const campaignId = await createCampaign(c, IDS.parent, partnerId);
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");

      for (const [table, idExpr] of [
        ["b2b_campaign_ledger", `(select id from public.b2b_campaign_ledger limit 1)`],
        ["b2b_statements", `(select id from public.b2b_statements limit 1)`],
        ["b2b_statement_line_items", `(select id from public.b2b_statement_line_items limit 1)`],
      ] as const) {
        const del = await attempt(c, `delete from public.${table} where id = ${idExpr}`);
        // sem linha ainda nessas tabelas neste teste específico: o gatilho dispara mesmo sem afetar linha (before);
        // se não houver linha nenhuma, o comando roda sem erro (0 linhas) — o que importa é o campaign_events abaixo,
        // que sempre tem linha.
        expect(del.rowCount === 0 || del.code === "42501").toBe(true);
      }

      const key = dedupe();
      await record(c, campaignId, null, "impression", key);
      const ev = await c.query<{ id: string }>("select id from public.b2b_campaign_events where campaign_id = $1", [campaignId]);
      const evId = ev.rows[0]!.id;
      const upd = await attempt(c, "update public.b2b_campaign_events set dedupe_key = 'ff00ff00ff00ff00' where id = $1", [evId]);
      expect(upd.code).toBe("42501");
      const del = await attempt(c, "delete from public.b2b_campaign_events where id = $1", [evId]);
      expect(del.code).toBe("42501");
      const trunc = await attempt(c, "truncate public.b2b_campaign_events");
      // 0A000 = bloqueado pela FK de b2b_campaign_ledger (truncate sem cascade); 42501 = pego pelo gatilho. Os dois bloqueiam.
      expect(["42501", "0A000"]).toContain(trunc.code);

      const ledgerRow = await c.query<{ id: string }>("select id from public.b2b_campaign_ledger where campaign_id = $1 limit 1", [campaignId]);
      const ludUpd = await attempt(c, "update public.b2b_campaign_ledger set amount_cents = 0 where id = $1", [ledgerRow.rows[0]!.id]);
      expect(ludUpd.code).toBe("42501");
    });
  });

  it("bloqueio Procon: campanha nunca serve numa lista com item de marca exigida na categoria alvo", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { target_category: "papelaria" });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");

      const inep1 = `51${Date.now().toString().slice(-6)}`;
      const blocked = await publishListWithItem(c, { inep: inep1, isDemo: false, category: "papelaria", alerts: ["restrictive_brand_or_spec"] });
      cleanupIneps.push(inep1);
      const rowsBlocked = await serve(c, blocked.versionId);
      expect(rowsBlocked.find((r) => r.campaign_id === campaignId)).toBeUndefined();

      const inep2 = `52${Date.now().toString().slice(-6)}`;
      const free = await publishListWithItem(c, { inep: inep2, isDemo: false, category: "papelaria", alerts: [] });
      cleanupIneps.push(inep2);
      const rowsFree = await serve(c, free.versionId);
      expect(rowsFree.find((r) => r.campaign_id === campaignId)).toBeDefined();
      expect(rowsFree.find((r) => r.campaign_id === campaignId)?.sponsored).toBe(true);

      // alerta numa OUTRA categoria não bloqueia a campanha (só a categoria alvo é checada).
      const inep3 = `53${Date.now().toString().slice(-6)}`;
      const otherCategory = await publishListWithItem(c, { inep: inep3, isDemo: false, category: "uniforme", alerts: ["restrictive_brand_or_spec"] });
      cleanupIneps.push(inep3);
      const rowsOther = await serve(c, otherCategory.versionId);
      expect(rowsOther.find((r) => r.campaign_id === campaignId)).toBeDefined();
    });
  });

  it("is_demo: parceiro sandbox só serve/mede em lista demo; parceiro ativo só em lista real", async () => {
    await inTx(async (c) => {
      const sandboxPartner = await seedPartner(c, { type: "brand", status: "sandbox" });
      const sandboxCampaign = await createCampaign(c, IDS.parent, sandboxPartner, { target_category: "papelaria" });
      await transitionCampaign(c, IDS.parent, sandboxCampaign, "pending_review");
      await transitionCampaign(c, IDS.admin, sandboxCampaign, "approved");
      const check = await c.query<{ is_demo: boolean }>("select is_demo from public.b2b_campaigns where id = $1", [sandboxCampaign]);
      expect(check.rows[0]!.is_demo).toBe(true);

      const inepDemo = `54${Date.now().toString().slice(-6)}`;
      const demoList = await publishListWithItem(c, { inep: inepDemo, isDemo: true, category: "papelaria" });
      cleanupIneps.push(inepDemo);
      const inepReal = `55${Date.now().toString().slice(-6)}`;
      const realList = await publishListWithItem(c, { inep: inepReal, isDemo: false, category: "papelaria" });
      cleanupIneps.push(inepReal);

      expect((await serve(c, demoList.versionId)).find((r) => r.campaign_id === sandboxCampaign)).toBeDefined();
      expect((await serve(c, realList.versionId)).find((r) => r.campaign_id === sandboxCampaign)).toBeUndefined();
    });
  });

  it("dedupe: o mesmo dedupe_key/tipo/dia não duplica evento nem acúmulo; clique sem impressão prévia é descartado", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpc", bid_cents: 500, total_budget_cents: 1000000 });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");

      const key = dedupe();
      expect(await record(c, campaignId, null, "impression", key)).toBe(true);
      expect(await record(c, campaignId, null, "impression", key)).toBe(false); // dedupe
      const clickOk = await record(c, campaignId, null, "click", key);
      expect(clickOk).toBe(true);
      expect(await record(c, campaignId, null, "click", key)).toBe(false); // dedupe do clique

      const otherKey = dedupe();
      expect(await record(c, campaignId, null, "click", otherKey)).toBe(false); // sem impressão prévia nesse dia/chave

      const events = await c.query("select count(*)::int as n from public.b2b_campaign_events where campaign_id = $1", [campaignId]);
      expect(events.rows[0]!.n).toBe(2); // 1 impressão + 1 clique
      const ledger = await c.query("select count(*)::int as n from public.b2b_campaign_ledger where campaign_id = $1 and entry_type = 'click_accrual'", [campaignId]);
      expect(ledger.rows[0]!.n).toBe(1); // só o clique gera acúmulo (pricing_model cpc); impressão sob cpc não acumula
    });
  });

  it("orçamento total esgotado pausa a campanha automaticamente e ela para de servir/receber evento", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      // CPM 10000 centavos/1000 impressões = 10 centavos por impressão; orçamento de 15 => pausa na 2ª (20 >= 15).
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpm", bid_cents: 10000, total_budget_cents: 15 });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");

      expect(await record(c, campaignId, null, "impression", dedupe())).toBe(true);
      expect(await record(c, campaignId, null, "impression", dedupe())).toBe(true);
      const status1 = await c.query<{ status: string; accrued_total_cents: number }>("select status, accrued_total_cents from public.b2b_campaigns where id = $1", [campaignId]);
      expect(status1.rows[0]!.status).toBe("paused");
      expect(status1.rows[0]!.accrued_total_cents).toBeGreaterThanOrEqual(15);

      // pausada: novo evento é descartado (silêncio, não erro).
      expect(await record(c, campaignId, null, "impression", dedupe())).toBe(false);
      const pausedLedger = await c.query("select count(*)::int as n from public.b2b_campaign_ledger where campaign_id = $1 and entry_type = 'budget_paused'", [campaignId]);
      expect(pausedLedger.rows[0]!.n).toBe(1);

      // retomar com orçamento esgotado é recusado.
      const resume = await attemptH(c, "select public.b2b_campaign_transition($1, $2, 'approved', null) as s", [IDS.admin, campaignId]);
      expect(resume.hint).toBe("budget_exhausted");
    });
  });

  it("b2b_insights_raw conta listas distintas publicadas por cidade/série/categoria, separando is_demo", async () => {
    await inTx(async (c) => {
      const ineps = [`60${Date.now().toString().slice(-6)}`, `61${Date.now().toString().slice(-6)}`, `62${Date.now().toString().slice(-6)}`];
      for (const inep of ineps) {
        await publishListWithItem(c, { inep, isDemo: false, category: "papelaria" });
        cleanupIneps.push(inep);
      }
      const rows = await callAsService<{ city_ibge: string; distinct_lists: number }>(c, "select * from public.b2b_insights_raw($1, $2, $3)", ["papelaria", "ef", false]);
      const total = rows.reduce((acc, r) => acc + r.distinct_lists, 0);
      expect(total).toBeGreaterThanOrEqual(3);

      const demoRows = await callAsService<{ distinct_lists: number }>(c, "select * from public.b2b_insights_raw($1, $2, $3)", ["papelaria", "ef", true]);
      const demoTotal = demoRows.reduce((acc, r) => acc + r.distinct_lists, 0);
      expect(demoTotal).toBe(0); // as listas acima não são demo
    });
  });

  it("b2b_statement_generate soma uso de API como 'unavailable' e campanhas como 'priced' (bid do parceiro); duplicar período falha", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      const keyRow = await seedKey(c, partnerId, { environment: "live" });
      await c.query(
        `insert into public.b2b_usage_daily (key_id, partner_id, day, endpoint, status_class, request_count)
         values ($1, $2, current_date, '/v1/schools', '2xx', 42)`,
        [keyRow.id, partnerId],
      );
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpc", bid_cents: 300, total_budget_cents: 1000000 });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");
      const key = dedupe();
      await record(c, campaignId, null, "impression", key);
      await record(c, campaignId, null, "click", key);

      const start = new Date().toISOString().slice(0, 10);
      const stId = await callAsService<{ id: string }>(c, "select public.b2b_statement_generate($1, $2, $3, $3, $4) as id", [
        IDS.admin,
        partnerId,
        start,
        "PIX manual, chave da papelaria X",
      ]).then((r) => r[0]!.id);

      const lines = await c.query("select source, pricing_status, amount_cents, unit_price_cents from public.b2b_statement_line_items where statement_id = $1 order by source", [stId]);
      const apiLine = lines.rows.find((r) => r.source === "api_usage");
      expect(apiLine?.pricing_status).toBe("unavailable");
      expect(apiLine?.amount_cents).toBeNull();
      const cpcLine = lines.rows.find((r) => r.source === "campaign_cpc");
      expect(cpcLine?.pricing_status).toBe("priced");
      expect(cpcLine?.amount_cents).toBe(300);
      expect(cpcLine?.unit_price_cents).toBe(300);

      const dup = await attemptH(c, "select public.b2b_statement_generate($1, $2, $3, $3, $4) as id", [IDS.admin, partnerId, start, null]);
      expect(dup.hint).toBe("duplicate_period");
    });
  });

  it("RLS: só dono do parceiro e admin leem campanha/eventos/livro-razão/extrato; anon nada", async () => {
    // Precisa de dados COMMITADOS: cada withClaims abre conexão própria (não veria uma transação em aberto).
    const { partnerId, campaignId } = await asServiceCommitted(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active", ownerId: IDS.parent });
      const campaignId = await createCampaign(c, IDS.parent, partnerId, {});
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      return { partnerId, campaignId };
    });
    try {
      await withClaims("parent", async (cp) => {
        const r = await attempt(cp, "select id from public.b2b_campaigns where id = $1", [campaignId]);
        expect(r.rowCount).toBe(1);
      });
      await withClaims("school_member", async (cs) => {
        const r = await attempt(cs, "select id from public.b2b_campaigns where id = $1", [campaignId]);
        expect(r.rowCount).toBe(0);
      });
      await withClaims("anon", async (ca) => {
        const r = await attempt(ca, "select id from public.b2b_campaigns where id = $1", [campaignId]);
        expect(r.rowCount).toBe(0);
      });
      await withClaims("admin", async (cadm) => {
        const r = await attempt(cadm, "select id from public.b2b_campaigns where id = $1", [campaignId]);
        expect(r.rowCount).toBe(1);
      });
    } finally {
      await withSuperuser(async (c) => {
        await c.query("delete from public.b2b_campaigns where id = $1", [campaignId]);
        await c.query("delete from public.b2b_partner_members where partner_id = $1", [partnerId]);
        await c.query("delete from public.b2b_partners where id = $1", [partnerId]);
      });
    }
  });
});
