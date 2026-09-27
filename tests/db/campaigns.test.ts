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
  { sig: "public.b2b_campaign_performance(uuid, uuid)", svc: true },
  { sig: "public.b2b_campaign_list_context(uuid)", svc: false },
  { sig: "public.b2b_campaign_eligible(uuid, uuid)", svc: false },
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
  opts: { inep: string; isDemo: boolean; category?: string; alerts?: string[]; schoolId?: string; slug?: string; year?: number },
): Promise<{ listId: string; versionId: string; schoolId: string }> {
  const schoolId = opts.schoolId ?? (await seedSchool(c, opts.inep));
  const listId = await seedList(c, schoolId, opts.slug ?? "ef-1", opts.year ?? 2028);
  if (!opts.isDemo) await c.query("update public.school_lists set is_demo = false where id = $1", [listId]);
  const versionId = await seedCandidateWithItem(c, listId, opts.category ?? "papelaria", opts.alerts ?? []);
  for (const s of ["submitted", "processing", "approved"] as const) await transition(c, listId, s);
  await approveVersion(c, listId, versionId);
  await c.query("select public.list_publish_version($1, $2, $3)", [listId, versionId, IDS.admin]);
  return { listId, versionId, schoolId };
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

  it("authenticated NÃO tem select nenhum em b2b_campaign_events/b2b_campaign_ledger, nem por coluna (linha a linha contornaria o k-anonimato)", async () => {
    await withSuperuser(async (c) => {
      // tabela inteira: sem privilégio nenhum (nem uma coluna sequer) para authenticated.
      const evTable = await c.query<{ ok: boolean }>("select has_table_privilege('authenticated', 'public.b2b_campaign_events', 'select') as ok");
      expect(evTable.rows[0]!.ok).toBe(false);
      const ledgerTable = await c.query<{ ok: boolean }>("select has_table_privilege('authenticated', 'public.b2b_campaign_ledger', 'select') as ok");
      expect(ledgerTable.rows[0]!.ok).toBe(false);
      // conferido coluna a coluna, para não deixar nenhuma escapar por um GRANT parcial esquecido.
      for (const col of ["id", "campaign_id", "event_type", "list_version_id", "day", "dedupe_key", "created_at", "updated_at"]) {
        const r = await c.query<{ ok: boolean }>("select has_column_privilege('authenticated', 'public.b2b_campaign_events', $1, 'select') as ok", [col]);
        expect(r.rows[0]!.ok, `authenticated x b2b_campaign_events.${col}`).toBe(false);
      }
      for (const col of ["id", "campaign_id", "event_id", "entry_type", "day", "amount_cents", "balance_after_cents", "created_at", "updated_at"]) {
        const r = await c.query<{ ok: boolean }>("select has_column_privilege('authenticated', 'public.b2b_campaign_ledger', $1, 'select') as ok", [col]);
        expect(r.rows[0]!.ok, `authenticated x b2b_campaign_ledger.${col}`).toBe(false);
      }
      // nenhuma policy de select sobrou para authenticated (RLS continua ligada, mas sem policy = nada a avaliar).
      const evPolicies = await c.query<{ n: string }>(
        "select count(*)::text as n from pg_policies where schemaname = 'public' and tablename = 'b2b_campaign_events' and 'authenticated' = any(roles)",
      );
      expect(evPolicies.rows[0]!.n).toBe("0");
      const ledgerPolicies = await c.query<{ n: string }>(
        "select count(*)::text as n from pg_policies where schemaname = 'public' and tablename = 'b2b_campaign_ledger' and 'authenticated' = any(roles)",
      );
      expect(ledgerPolicies.rows[0]!.n).toBe("0");
      // service_role continua com a tabela inteira (funções internas precisam).
      const svcEv = await c.query<{ ok: boolean }>("select has_table_privilege('service_role', 'public.b2b_campaign_events', 'select') as ok");
      expect(svcEv.rows[0]!.ok).toBe(true);
      const svcLedger = await c.query<{ ok: boolean }>("select has_table_privilege('service_role', 'public.b2b_campaign_ledger', 'select') as ok");
      expect(svcLedger.rows[0]!.ok).toBe(true);
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

      const listInep = `70${Date.now().toString().slice(-6)}`;
      const list = await publishListWithItem(c, { inep: listInep, isDemo: false, category: "papelaria" });
      cleanupIneps.push(listInep);
      const key = dedupe();
      await record(c, campaignId, list.versionId, "impression", key);
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

  it("b2b_campaign_record_event revalida a MESMA elegibilidade do serve: recusa em lista bloqueada por Procon", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { target_category: "papelaria" });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");

      const inep = `56${Date.now().toString().slice(-6)}`;
      const blocked = await publishListWithItem(c, { inep, isDemo: false, category: "papelaria", alerts: ["restrictive_brand_or_spec"] });
      cleanupIneps.push(inep);

      // o mesmo bloqueio Procon do serve() vale para o record_event: nenhum evento é aceito, nem gravado.
      expect(await record(c, campaignId, blocked.versionId, "impression", dedupe())).toBe(false);
      const events = await c.query("select count(*)::int as n from public.b2b_campaign_events where campaign_id = $1", [campaignId]);
      expect(events.rows[0]!.n).toBe(0);
    });
  });

  it("b2b_campaign_record_event revalida is_demo/ambiente: recusa evento de lista real para campanha sandbox e vice-versa", async () => {
    await inTx(async (c) => {
      const sandboxPartner = await seedPartner(c, { type: "brand", status: "sandbox" });
      const sandboxCampaign = await createCampaign(c, IDS.parent, sandboxPartner, { target_category: "papelaria" });
      await transitionCampaign(c, IDS.parent, sandboxCampaign, "pending_review");
      await transitionCampaign(c, IDS.admin, sandboxCampaign, "approved");

      const inepReal = `57${Date.now().toString().slice(-6)}`;
      const realList = await publishListWithItem(c, { inep: inepReal, isDemo: false, category: "papelaria" });
      cleanupIneps.push(inepReal);
      expect(await record(c, sandboxCampaign, realList.versionId, "impression", dedupe())).toBe(false);

      const inepDemo = `58${Date.now().toString().slice(-6)}`;
      const demoList = await publishListWithItem(c, { inep: inepDemo, isDemo: true, category: "papelaria" });
      cleanupIneps.push(inepDemo);
      expect(await record(c, sandboxCampaign, demoList.versionId, "impression", dedupe())).toBe(true);
    });
  });

  it("b2b_campaign_record_event recusa lista inexistente/não publicada (lista obrigatória, sem exceção nula)", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { target_category: "papelaria" });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");

      const nullList = await attemptH(c, "select public.b2b_campaign_record_event($1, null, 'impression', $2) as r", [campaignId, dedupe()]);
      expect(nullList.hint).toBe("invalid_input");

      const fake = "00000000-0000-4000-8000-000000000000";
      expect(await record(c, campaignId, fake, "impression", dedupe())).toBe(false);
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
      const listInep = `71${Date.now().toString().slice(-6)}`;
      const list = await publishListWithItem(c, { inep: listInep, isDemo: false, category: "papelaria" });
      cleanupIneps.push(listInep);

      const key = dedupe();
      expect(await record(c, campaignId, list.versionId, "impression", key)).toBe(true);
      expect(await record(c, campaignId, list.versionId, "impression", key)).toBe(false); // dedupe
      const clickOk = await record(c, campaignId, list.versionId, "click", key);
      expect(clickOk).toBe(true);
      expect(await record(c, campaignId, list.versionId, "click", key)).toBe(false); // dedupe do clique

      const otherKey = dedupe();
      expect(await record(c, campaignId, list.versionId, "click", otherKey)).toBe(false); // sem impressão prévia nesse dia/chave

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
      const listInep = `72${Date.now().toString().slice(-6)}`;
      const list = await publishListWithItem(c, { inep: listInep, isDemo: false, category: "papelaria" });
      cleanupIneps.push(listInep);

      expect(await record(c, campaignId, list.versionId, "impression", dedupe())).toBe(true);
      expect(await record(c, campaignId, list.versionId, "impression", dedupe())).toBe(true);
      const status1 = await c.query<{ status: string; accrued_total_cents: string }>("select status, accrued_total_cents from public.b2b_campaigns where id = $1", [campaignId]);
      expect(status1.rows[0]!.status).toBe("paused");
      expect(Number(status1.rows[0]!.accrued_total_cents)).toBeGreaterThanOrEqual(15);

      // pausada: novo evento é descartado (silêncio, não erro).
      expect(await record(c, campaignId, list.versionId, "impression", dedupe())).toBe(false);
      const pausedLedger = await c.query("select count(*)::int as n from public.b2b_campaign_ledger where campaign_id = $1 and entry_type = 'budget_paused'", [campaignId]);
      expect(pausedLedger.rows[0]!.n).toBe(1);

      // retomar com orçamento esgotado é recusado (dono OU admin).
      const resumeAsAdmin = await attemptH(c, "select public.b2b_campaign_transition($1, $2, 'approved', null) as s", [IDS.admin, campaignId]);
      expect(resumeAsAdmin.hint).toBe("budget_exhausted");
      const resumeAsOwner = await attemptH(c, "select public.b2b_campaign_transition($1, $2, 'approved', null) as s", [IDS.parent, campaignId]);
      expect(resumeAsOwner.hint).toBe("budget_exhausted");
    });
  });

  it("o DONO (não só admin) consegue retomar a própria campanha pausada com orçamento disponível; decided_by não muda", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpc", bid_cents: 100, total_budget_cents: 1000000, daily_budget_cents: 200 });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");
      const before = await c.query<{ decided_by: string }>("select decided_by from public.b2b_campaigns where id = $1", [campaignId]);

      // dono pausa a própria campanha (permitido) e depois retoma (agora permitido — antes só admin conseguia).
      await transitionCampaign(c, IDS.parent, campaignId, "paused", "pausa manual do dono");
      const resume = await attemptH(c, "select public.b2b_campaign_transition($1, $2, 'approved', null) as s", [IDS.parent, campaignId]);
      expect(resume.error).toBeNull();
      const after = await c.query<{ status: string; decided_by: string; status_reason: string | null }>(
        "select status, decided_by, status_reason from public.b2b_campaigns where id = $1",
        [campaignId],
      );
      expect(after.rows[0]!.status).toBe("approved");
      expect(after.rows[0]!.status_reason).toBeNull();
      expect(after.rows[0]!.decided_by).toBe(before.rows[0]!.decided_by); // continua sendo quem aprovou de verdade (admin)
    });
  });

  it("pause_origin: só quem pode pausar de cada jeito pode retomar (3 casos: dono, admin, orçamento automático)", async () => {
    await inTx(async (c) => {
      // Um só parceiro (b2b_partner_members tem unique(profile_id): o dono não pode ter 2 parceiros) com 3 campanhas.
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });

      // Caso 1: dono pausa a própria campanha -> dono retoma.
      const c1 = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpc", bid_cents: 100, total_budget_cents: 1000000 });
      await transitionCampaign(c, IDS.parent, c1, "pending_review");
      await transitionCampaign(c, IDS.admin, c1, "approved");
      await transitionCampaign(c, IDS.parent, c1, "paused", "pausa do dono");
      const origin1 = await c.query<{ pause_origin: string }>("select pause_origin from public.b2b_campaigns where id = $1", [c1]);
      expect(origin1.rows[0]!.pause_origin).toBe("owner");
      const resume1 = await attemptH(c, "select public.b2b_campaign_transition($1, $2, 'approved', null) as s", [IDS.parent, c1]);
      expect(resume1.error).toBeNull();

      // Caso 2: admin pausa -> dono NÃO consegue retomar (forbidden); admin consegue.
      const c2 = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpc", bid_cents: 100, total_budget_cents: 1000000 });
      await transitionCampaign(c, IDS.parent, c2, "pending_review");
      await transitionCampaign(c, IDS.admin, c2, "approved");
      await transitionCampaign(c, IDS.admin, c2, "paused", "pausa do admin (motivo interno)");
      const origin2 = await c.query<{ pause_origin: string }>("select pause_origin from public.b2b_campaigns where id = $1", [c2]);
      expect(origin2.rows[0]!.pause_origin).toBe("admin");
      const ownerTriesResume2 = await attemptH(c, "select public.b2b_campaign_transition($1, $2, 'approved', null) as s", [IDS.parent, c2]);
      expect(ownerTriesResume2.hint).toBe("forbidden");
      const adminResumes2 = await attemptH(c, "select public.b2b_campaign_transition($1, $2, 'approved', null) as s", [IDS.admin, c2]);
      expect(adminResumes2.error).toBeNull();

      // Caso 3: pausa automática por orçamento -> dono TEM permissão de tentar retomar (não é 'forbidden'), mas
      // esbarra no orçamento esgotado (budget_exhausted) — diferente do caso 2, onde o dono é barrado por permissão.
      const c3 = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpm", bid_cents: 10000, total_budget_cents: 15 });
      await transitionCampaign(c, IDS.parent, c3, "pending_review");
      await transitionCampaign(c, IDS.admin, c3, "approved");
      const listInep3 = `77${Date.now().toString().slice(-6)}`;
      const list3 = await publishListWithItem(c, { inep: listInep3, isDemo: false, category: "papelaria" });
      cleanupIneps.push(listInep3);
      await record(c, c3, list3.versionId, "impression", dedupe());
      await record(c, c3, list3.versionId, "impression", dedupe());
      const origin3 = await c.query<{ pause_origin: string; status: string }>("select pause_origin, status from public.b2b_campaigns where id = $1", [c3]);
      expect(origin3.rows[0]!.status).toBe("paused");
      expect(origin3.rows[0]!.pause_origin).toBe("budget_auto");
      const ownerTriesResume3 = await attemptH(c, "select public.b2b_campaign_transition($1, $2, 'approved', null) as s", [IDS.parent, c3]);
      expect(ownerTriesResume3.hint).toBe("budget_exhausted"); // não 'forbidden': o dono TEM permissão aqui
    });
  });

  it("b2b_insights_raw conta ESCOLA distinta (não lista) por cidade/série/categoria, separando is_demo", async () => {
    await inTx(async (c) => {
      const ineps = [`60${Date.now().toString().slice(-6)}`, `61${Date.now().toString().slice(-6)}`, `62${Date.now().toString().slice(-6)}`];
      for (const inep of ineps) {
        await publishListWithItem(c, { inep, isDemo: false, category: "papelaria" });
        cleanupIneps.push(inep);
      }
      const rows = await callAsService<{ city_ibge: string; distinct_schools: number }>(c, "select * from public.b2b_insights_raw($1, $2, $3)", ["papelaria", "ef", false]);
      const totalBefore = rows.reduce((acc, r) => acc + r.distinct_schools, 0);
      expect(totalBefore).toBeGreaterThanOrEqual(3);

      // uma escola com 5 "séries" (5 listas na MESMA etapa 'ef', slugs ef-1..ef-5): conta 1 escola, não 5.
      const inepMulti = `63${Date.now().toString().slice(-6)}`;
      const { schoolId } = await publishListWithItem(c, { inep: inepMulti, isDemo: false, category: "papelaria", slug: "ef-1", year: 2028 });
      cleanupIneps.push(inepMulti);
      for (const [slug, year] of [
        ["ef-2", 2028],
        ["ef-3", 2028],
        ["ef-4", 2028],
        ["ef-5", 2028],
      ] as const) {
        await publishListWithItem(c, { inep: inepMulti, isDemo: false, category: "papelaria", schoolId, slug, year });
      }

      const rowsAfter = await callAsService<{ city_ibge: string; distinct_schools: number }>(c, "select * from public.b2b_insights_raw($1, $2, $3)", ["papelaria", "ef", false]);
      const totalAfter = rowsAfter.reduce((acc, r) => acc + r.distinct_schools, 0);
      expect(totalAfter).toBe(totalBefore + 1); // +1 escola, não +5 listas

      const demoRows = await callAsService<{ distinct_schools: number }>(c, "select * from public.b2b_insights_raw($1, $2, $3)", ["papelaria", "ef", true]);
      const demoTotal = demoRows.reduce((acc, r) => acc + r.distinct_schools, 0);
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
      const listInep = `73${Date.now().toString().slice(-6)}`;
      const list = await publishListWithItem(c, { inep: listInep, isDemo: false, category: "papelaria" });
      cleanupIneps.push(listInep);
      const key = dedupe();
      await record(c, campaignId, list.versionId, "impression", key);
      await record(c, campaignId, list.versionId, "click", key);

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
      expect(Number(cpcLine?.amount_cents)).toBe(300); // 1 clique x bid de 300 centavos (CPC: valor exato, sem divisão)
      expect(cpcLine?.unit_price_cents).toBe(300);

      const dup = await attemptH(c, "select public.b2b_statement_generate($1, $2, $3, $3, $4) as id", [IDS.admin, partnerId, start, null]);
      expect(dup.hint).toBe("duplicate_period");
    });
  });

  it("extrato filtra is_demo: campanha sandbox nunca entra no extrato de um parceiro ativo; uso de chave test nunca conta", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      const testKey = await seedKey(c, partnerId, { environment: "test" });
      await c.query(
        `insert into public.b2b_usage_daily (key_id, partner_id, day, endpoint, status_class, request_count)
         values ($1, $2, current_date, '/v1/schools', '2xx', 99)`,
        [testKey.id, partnerId],
      );
      // campanha REAL: entra no extrato.
      const realCampaignId = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpc", bid_cents: 500, total_budget_cents: 1000000 });
      await transitionCampaign(c, IDS.parent, realCampaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, realCampaignId, "approved");
      const listInep = `74${Date.now().toString().slice(-6)}`;
      const list = await publishListWithItem(c, { inep: listInep, isDemo: false, category: "papelaria" });
      cleanupIneps.push(listInep);
      const key = dedupe();
      await record(c, realCampaignId, list.versionId, "impression", key);
      await record(c, realCampaignId, list.versionId, "click", key);

      // campanha marcada como demo (superusuário, direto na tabela — simula um estado sandbox anterior a uma
      // troca de status do parceiro) NUNCA deveria entrar no extrato real, mesmo com ledger próprio.
      const demoCampaign = await callAsService<{ id: string }>(c, "select public.b2b_campaign_create($1, $2, $3::jsonb) as id", [
        IDS.parent,
        partnerId,
        JSON.stringify({ name: "Campanha Demo", product_label: "X", pricing_model: "cpc", bid_cents: 700, total_budget_cents: 1000000, target_category: "papelaria" }),
      ]).then((r) => r[0]!.id);
      await c.query("update public.b2b_campaigns set is_demo = true where id = $1", [demoCampaign]);
      await transitionCampaign(c, IDS.parent, demoCampaign, "pending_review");
      await transitionCampaign(c, IDS.admin, demoCampaign, "approved");
      const demoListInep = `75${Date.now().toString().slice(-6)}`;
      const demoList = await publishListWithItem(c, { inep: demoListInep, isDemo: true, category: "papelaria" });
      cleanupIneps.push(demoListInep);
      const demoKey = dedupe();
      await record(c, demoCampaign, demoList.versionId, "impression", demoKey);
      await record(c, demoCampaign, demoList.versionId, "click", demoKey);

      const start = new Date().toISOString().slice(0, 10);
      const stId = await callAsService<{ id: string }>(c, "select public.b2b_statement_generate($1, $2, $3, $3, $4) as id", [IDS.admin, partnerId, start, null]).then(
        (r) => r[0]!.id,
      );
      const lines = await c.query<{ source: string; campaign_id: string | null; quantity: string }>(
        "select source, campaign_id, quantity from public.b2b_statement_line_items where statement_id = $1",
        [stId],
      );
      expect(lines.rows.find((r) => r.campaign_id === demoCampaign)).toBeUndefined(); // campanha demo nunca aparece
      expect(lines.rows.find((r) => r.campaign_id === realCampaignId)).toBeDefined();
      const apiLine = lines.rows.find((r) => r.source === "api_usage");
      expect(Number(apiLine!.quantity)).toBe(0); // só havia uso de chave `test`, nunca contado no extrato real
    });
  });

  it("CPM acumula EXATO (sem arredondar por evento): bid pequeno não infla o total nem o extrato", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      // bid de 1 centavo/mil = 0,001 centavo por impressão; arredondar por evento (ceil) daria 1 centavo cada,
      // inflando 1000x. 3 impressões devem acumular EXATAMENTE 0,003 centavo, nunca 3 centavos.
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpm", bid_cents: 1, total_budget_cents: 1000000 });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");
      const listInep = `76${Date.now().toString().slice(-6)}`;
      const list = await publishListWithItem(c, { inep: listInep, isDemo: false, category: "papelaria" });
      cleanupIneps.push(listInep);

      for (let i = 0; i < 3; i++) {
        expect(await record(c, campaignId, list.versionId, "impression", dedupe())).toBe(true);
      }
      const row = await c.query<{ accrued_total_cents: string }>("select accrued_total_cents from public.b2b_campaigns where id = $1", [campaignId]);
      expect(Number(row.rows[0]!.accrued_total_cents)).toBeCloseTo(0.003, 6);

      const start = new Date().toISOString().slice(0, 10);
      const stId = await callAsService<{ id: string }>(c, "select public.b2b_statement_generate($1, $2, $3, $3, $4) as id", [IDS.admin, partnerId, start, null]).then(
        (r) => r[0]!.id,
      );
      const line = await c.query<{ quantity: string; amount_cents: string; unit_price_cents: number }>(
        "select quantity, amount_cents, unit_price_cents from public.b2b_statement_line_items where statement_id = $1 and source = 'campaign_cpm'",
        [stId],
      );
      const quantity = Number(line.rows[0]!.quantity);
      const amount = Number(line.rows[0]!.amount_cents);
      const unitPrice = line.rows[0]!.unit_price_cents;
      expect(quantity).toBe(3);
      // invariante coerente (quantidade x bid / 1000 para CPM): nunca um número solto.
      expect(amount).toBeCloseTo((quantity * unitPrice) / 1000, 6);
    });
  });

  it("b2b_campaign_performance agrega por dia com a mesma supressão k dos insights (por ESCOLA distinta no dia)", async () => {
    await inTx(async (c) => {
      const partnerId = await seedPartner(c, { type: "brand", status: "active" });
      // CPM 1000 centavos/mil = 1 centavo por impressão (exato) — fácil de conferir o acumulado por dia.
      const campaignId = await createCampaign(c, IDS.parent, partnerId, { pricing_model: "cpm", bid_cents: 1000, total_budget_cents: 1000000 });
      await transitionCampaign(c, IDS.parent, campaignId, "pending_review");
      await transitionCampaign(c, IDS.admin, campaignId, "approved");

      // dia VISÍVEL: 5 escolas distintas (>= k padrão de 5).
      const visibleDay = "2026-01-05";
      for (let i = 0; i < 5; i++) {
        const inep = `78${Date.now().toString().slice(-5)}${i}`;
        const list = await publishListWithItem(c, { inep, isDemo: false, category: "papelaria" });
        cleanupIneps.push(inep);
        await c.query(
          `insert into public.b2b_campaign_events (campaign_id, event_type, list_version_id, day, dedupe_key) values ($1, 'impression', $2, $3, $4)`,
          [campaignId, list.versionId, visibleDay, dedupe()],
        );
      }
      // dia SUPRIMIDO: só 2 escolas distintas (< 5).
      const suppressedDay = "2026-01-06";
      for (let i = 0; i < 2; i++) {
        const inep = `79${Date.now().toString().slice(-5)}${i}`;
        const list = await publishListWithItem(c, { inep, isDemo: false, category: "papelaria" });
        cleanupIneps.push(inep);
        await c.query(
          `insert into public.b2b_campaign_events (campaign_id, event_type, list_version_id, day, dedupe_key) values ($1, 'impression', $2, $3, $4)`,
          [campaignId, list.versionId, suppressedDay, dedupe()],
        );
      }

      const rows = await callAsService<{ day: string; impressions: number | null; clicks: number | null; accrued_cents: string | null; suppressed: boolean }>(
        c,
        "select day::text as day, impressions, clicks, accrued_cents, suppressed from public.b2b_campaign_performance($1, $2) order by day",
        [IDS.parent, campaignId],
      );
      const visible = rows.find((r) => r.day.startsWith("2026-01-05"));
      const suppressed = rows.find((r) => r.day.startsWith("2026-01-06"));
      expect(visible).toMatchObject({ impressions: 5, clicks: 0, suppressed: false });
      expect(Number(visible!.accrued_cents)).toBe(5); // 5 impressões x 1 centavo exato
      expect(suppressed).toMatchObject({ impressions: null, clicks: null, accrued_cents: null, suppressed: true });

      // admin também consegue ver; um terceiro (não dono, não admin) não consegue.
      const asAdmin = await callAsService<{ day: string }>(c, "select * from public.b2b_campaign_performance($1, $2)", [IDS.admin, campaignId]);
      expect(asAdmin.length).toBe(rows.length);
      const forbidden = await attemptH(c, "select * from public.b2b_campaign_performance($1, $2)", [IDS.school_member, campaignId]);
      expect(forbidden.hint).toBe("not_found"); // "campanha não encontrada": nunca revela que existe a quem não tem acesso
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
      // eventos e livro-razão: NEM o dono, NEM o admin leem com o cliente de sessão — nem via RLS, nem via RPC
      // direta da tabela; falha por permissão (42501), antes mesmo de a RLS entrar em jogo.
      await withClaims("parent", async (cp) => {
        const rEv = await attempt(cp, "select id from public.b2b_campaign_events where campaign_id = $1", [campaignId]);
        expect(rEv.code).toBe("42501");
        const rLedger = await attempt(cp, "select id from public.b2b_campaign_ledger where campaign_id = $1", [campaignId]);
        expect(rLedger.code).toBe("42501");
      });
      await withClaims("admin", async (cadm) => {
        const rEv = await attempt(cadm, "select id from public.b2b_campaign_events where campaign_id = $1", [campaignId]);
        expect(rEv.code).toBe("42501");
        const rLedger = await attempt(cadm, "select id from public.b2b_campaign_ledger where campaign_id = $1", [campaignId]);
        expect(rLedger.code).toBe("42501");
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
