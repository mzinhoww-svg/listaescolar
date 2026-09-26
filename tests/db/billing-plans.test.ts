import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { activePlanId, CHARGING_PLAN, ensureTestBillingPlan, ensureWallet, plan, publishPlan, publishPlanOk } from "./billing-fixtures";
import { attempt, attemptH, cleanupUsers, IDS, seedStationery, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

const BILLING_FUNCTIONS = [
  "billing_plan_publish",
  "billing_ensure_wallet",
  "billing_wallet_summary",
  "billing_can_receive_lead",
  "billing_create_package_invoice",
  "billing_purchase_season_pass",
  "billing_attach_charge",
  "billing_confirm_invoice_payment",
  "billing_reverse_entry",
];
const INTERNAL_FUNCTIONS = ["billing_charge_lead_delivery", "billing_append_entry", "billing_season_window", "billing_jwt_sub", "billing_eval_source"];
const TABLES = ["plans", "plan_price_tiers", "plan_credit_packages", "stationery_wallets", "credit_ledger", "season_passes", "invoices"];

describe("S21 · 0401: esquema, privilégios e planos", () => {
  beforeAll(async () => {
    await seedUsers();
    await ensureTestBillingPlan();
  });
  afterAll(cleanupUsers);

  it("toda tabela tem id uuid, created_at, updated_at e RLS habilitada", async () => {
    await withSuperuser(async (c) => {
      for (const t of TABLES) {
        const cols = (await c.query("select column_name, data_type, column_default from information_schema.columns where table_schema = 'public' and table_name = $1", [t])).rows;
        const by = Object.fromEntries(cols.map((r) => [r.column_name, r]));
        expect(by.id, t).toMatchObject({ data_type: "uuid", column_default: "gen_random_uuid()" });
        expect(by.created_at?.data_type, t).toBe("timestamp with time zone");
        expect(by.updated_at?.data_type, t).toBe("timestamp with time zone");
        const rls = (await c.query("select relrowsecurity from pg_class where oid = ('public.' || $1)::regclass", [t])).rows[0];
        expect(rls.relrowsecurity, t).toBe(true);
      }
    });
  });

  it("funções públicas: SECURITY DEFINER, search_path vazio e EXECUTE só para service_role; internas sem EXECUTE", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select proname, prosecdef, proconfig,
                has_function_privilege('anon', oid, 'execute') as anon,
                has_function_privilege('authenticated', oid, 'execute') as auth,
                has_function_privilege('service_role', oid, 'execute') as svc,
                has_function_privilege('public', oid, 'execute') as pub
           from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1)`,
        [[...BILLING_FUNCTIONS, ...INTERNAL_FUNCTIONS]],
      );
      const names = r.rows.map((x) => x.proname as string);
      for (const f of [...BILLING_FUNCTIONS, ...INTERNAL_FUNCTIONS]) expect(names, f).toContain(f);
      for (const row of r.rows) {
        expect(row.proconfig, row.proname).toEqual(expect.arrayContaining([expect.stringMatching(/^search_path=("")?$/)]));
        expect(row, row.proname).toMatchObject({ anon: false, auth: false, pub: false });
        if (BILLING_FUNCTIONS.includes(row.proname)) expect(row, row.proname).toMatchObject({ prosecdef: true, svc: true });
        else expect(row.svc, row.proname).toBe(false);
      }
    });
  });

  it.each(["anon", "parent", "stationery_member", "admin", "system_profile"] as Identity[])("%s não executa billing_plan_publish", async (who) => {
    await withClaims(who, async (c) => {
      const r = await publishPlan(c, plan());
      expect(r.code).toBe("42501");
      expect(r.error).toMatch(/permission denied for function billing_plan_publish/);
    });
  });

  it("nenhum papel escreve direto nas tabelas de cobrança (nem service_role)", async () => {
    for (const who of ["anon", "parent", "stationery_member", "admin", "system"] as Identity[]) {
      await withClaims(who, async (c) => {
        for (const t of TABLES) {
          const r = await attempt(c, `delete from public.${t}`);
          expect(r.code, `${who} delete ${t}`).toBe("42501");
          const u = await attempt(c, `update public.${t} set updated_at = now()`);
          expect(u.code, `${who} update ${t}`).toBe("42501");
        }
        const ins = await attempt(c, "insert into public.plans (version, status, free_leads, season_start_month, season_end_month) values (999, 'archived', 0, 1, 2)");
        expect(ins.code, `${who} insert plans`).toBe("42501");
      });
    }
  });

  it("só admin publica; sub do JWT deve bater; actor não admin é forbidden", async () => {
    await withClaims("system", async (c) => {
      const r = await publishPlan(c, plan(), IDS.parent);
      expect(r.hint).toBe("forbidden");
      const r2 = await publishPlan(c, plan(), IDS.admin);
      expect(r2.error).toBeNull();
    });
    // com claims de outro usuário (admin chamando em nome de outro admin id): sub diverge
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        await c.query("set local role service_role");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub: IDS.parent })]);
        const r = await publishPlan(c, plan(), IDS.admin);
        expect(r.hint).toBe("forbidden");
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("publicar cria plano + faixas + pacotes, arquiva o ativo anterior e só existe um active", async () => {
    await withClaims("system", async (c) => {
      const before = await activePlanId(c);
      const id = await publishPlanOk(c, CHARGING_PLAN);
      expect(id).not.toBe(before);
      const active = (await c.query("select id, version, status, free_leads, pass_price_cents, pass_included_leads, pass_max_installments, season_start_month, season_end_month from public.plans where status = 'active'")).rows;
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({ id, free_leads: 0, pass_price_cents: 30000, pass_included_leads: 40, pass_max_installments: 3, season_start_month: 11, season_end_month: 3 });
      const old = (await c.query("select status from public.plans where id = $1", [before])).rows[0];
      expect(old.status).toBe("archived");
      const tiers = (await c.query("select min_items, max_items, price_cents from public.plan_price_tiers where plan_id = $1 order by position", [id])).rows;
      expect(tiers).toEqual([
        { min_items: 1, max_items: 20, price_cents: 500 },
        { min_items: 21, max_items: null, price_cents: 900 },
      ]);
      const pk = (await c.query("select amount_cents from public.plan_credit_packages where plan_id = $1 order by position", [id])).rows;
      expect(pk).toEqual([{ amount_cents: 5000 }, { amount_cents: 10000 }]);
      const versions = (await c.query("select version from public.plans order by version")).rows.map((r) => Number(r.version));
      expect(new Set(versions).size).toBe(versions.length);
    });
  });

  it("valida faixas: contíguas de 1, última aberta, sem buraco nem sobreposição; preços e limites", async () => {
    const bad: PlanCase[] = [
      ["começa em 2", { tiers: [{ min_items: 2, max_items: null, price_cents: 100 }] }],
      ["buraco", { tiers: [{ min_items: 1, max_items: 10, price_cents: 100 }, { min_items: 12, max_items: null, price_cents: 100 }] }],
      ["sobreposição", { tiers: [{ min_items: 1, max_items: 10, price_cents: 100 }, { min_items: 10, max_items: null, price_cents: 100 }] }],
      ["sem faixa aberta", { tiers: [{ min_items: 1, max_items: 300, price_cents: 100 }] }],
      ["faixa aberta no meio", { tiers: [{ min_items: 1, max_items: null, price_cents: 100 }, { min_items: 2, max_items: null, price_cents: 100 }] }],
      ["preço zero", { tiers: [{ min_items: 1, max_items: null, price_cents: 0 }] }],
      ["preço acima do teto", { tiers: [{ min_items: 1, max_items: null, price_cents: 10_000_001 }] }],
      ["sem faixas", { tiers: [] }],
      ["sem pacotes", { packages: [] }],
      ["7 pacotes", { packages: Array.from({ length: 7 }, () => ({ amount_cents: 100 })) }],
      ["pacote zero", { packages: [{ amount_cents: 0 }] }],
      ["grátis negativo", { free_leads: -1 }],
      ["grátis acima do teto", { free_leads: 10001 }],
      ["validade zero", { free_leads_validity_days: 0 }],
      ["validade acima do teto", { free_leads_validity_days: 3651 }],
      ["mês 13", { season: { start_month: 13, end_month: 3 } }],
      ["mês 0", { season: { start_month: 11, end_month: 0 } }],
      ["passe 4x", { pass: { price_cents: 100, included_leads: 1, max_installments: 4 } }],
      ["passe 0x", { pass: { price_cents: 100, included_leads: 1, max_installments: 0 } }],
      ["passe sem leads", { pass: { price_cents: 100, included_leads: 0, max_installments: 1 } }],
      ["passe preço zero", { pass: { price_cents: 0, included_leads: 1, max_installments: 1 } }],
    ];
    await withClaims("system", async (c) => {
      for (const [label, over] of bad) {
        const r = await publishPlan(c, plan(over as Partial<import("./billing-fixtures").PlanInput>));
        expect(r.hint, label).toBe("invalid_plan");
      }
      const notJson = await attemptH(c, "select public.billing_plan_publish($1::uuid, $2::jsonb)", [IDS.admin, "[]"]);
      expect(notJson.hint).toBe("invalid_plan");
      // aceitas: três faixas cobrindo 1..300 e além; passe nulo; meses iguais
      const ok = await publishPlan(
        c,
        plan({
          tiers: [
            { min_items: 1, max_items: 10, price_cents: 100 },
            { min_items: 11, max_items: 300, price_cents: 200 },
            { min_items: 301, max_items: null, price_cents: 300 },
          ],
          season: { start_month: 2, end_month: 2 },
          pass: null,
        }),
      );
      expect(ok.error).toBeNull();
    });
  });

  it("plano, faixas e pacotes são imutáveis depois de criados (só active -> archived pela função)", async () => {
    await withSuperuser(async (c) => {
      await c.query("begin");
      try {
        const id = await activePlanId(c);
        const u = await attempt(c, "update public.plans set free_leads = free_leads + 1 where id = $1", [id]);
        expect(u.code).toBe("42501");
        const d = await attempt(c, "delete from public.plans where id = $1", [id]);
        expect(d.code).toBe("42501");
        const t = await attempt(c, "update public.plan_price_tiers set price_cents = 1 where plan_id = $1", [id]);
        expect(t.code).toBe("42501");
        const td = await attempt(c, "delete from public.plan_price_tiers where plan_id = $1", [id]);
        expect(td.code).toBe("42501");
        const p = await attempt(c, "update public.plan_credit_packages set amount_cents = 1 where plan_id = $1", [id]);
        expect(p.code).toBe("42501");
        // reativar um arquivado também é recusado
        await c.query("set local role service_role");
        await publishPlanOk(c, plan());
        await c.query("reset role");
        const re = await attempt(c, "update public.plans set status = 'active' where id = $1", [id]);
        expect(re.code).toBe("42501");
      } finally {
        await c.query("rollback");
      }
    });
  });

  it("authenticated lê só o plano ativo (e filhas); anon nada; service_role tudo", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan());
      await publishPlanOk(c, plan());
      const all = (await c.query("select count(*)::int as n from public.plans")).rows[0].n;
      expect(all).toBeGreaterThanOrEqual(2);
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.parent })]);
      const mine = (await c.query("select status from public.plans")).rows;
      expect(mine).toEqual([{ status: "active" }]);
      const tiers = (await c.query("select distinct plan_id from public.plan_price_tiers")).rows;
      expect(tiers).toHaveLength(1);
      const pk = (await c.query("select distinct plan_id from public.plan_credit_packages")).rows;
      expect(pk).toHaveLength(1);
    });
    await withClaims("anon", async (c) => {
      for (const t of TABLES) {
        const r = await attempt(c, `select * from public.${t}`);
        expect(r.code, t).toBe("42501");
      }
    });
  });

  it("carteira: snapshot de grátis e validade a partir da 1ª ativação; sem plano -> billing_unavailable; is_demo herdado; imutável", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ free_leads: 3, free_leads_validity_days: 30 }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member, overrides: { is_demo: true } });
      // 1ª ativação registrada há 10 dias
      await c.query("reset role");
      await c.query(
        `insert into public.stationery_status_events (stationery_id, from_status, to_status, actor_role, created_at)
         values ($1, 'approved', 'active', 'owner', now() - interval '10 days'), ($1, 'paused', 'active', 'owner', now() - interval '2 days')`,
        [st],
      );
      await c.query("set local role service_role");
      const w = await ensureWallet(c, st);
      expect(w.error).toBeNull();
      const again = await ensureWallet(c, st);
      expect(again.rows[0].id).toBe(w.rows[0].id);
      const row = (await c.query("select free_leads_granted, free_leads_expires_at, is_demo, plan_id, (free_leads_expires_at - now()) as left from public.stationery_wallets where stationery_id = $1", [st])).rows[0];
      expect(row.free_leads_granted).toBe(3);
      expect(row.is_demo).toBe(true);
      expect(row.plan_id).toBe(await activePlanId(c));
      const leftDays = Number((row.left as { days?: number }).days ?? 0);
      expect(leftDays).toBeGreaterThanOrEqual(19);
      expect(leftDays).toBeLessThanOrEqual(20);
      // plano novo não muda a carteira
      await publishPlanOk(c, plan({ free_leads: 99, free_leads_validity_days: null }));
      const same = (await c.query("select free_leads_granted from public.stationery_wallets where stationery_id = $1", [st])).rows[0];
      expect(same.free_leads_granted).toBe(3);
      // sem validade no plano: expires_at nulo; sem ativação: parte de now()
      const st2 = await seedStationery(c, { status: "active" });
      const w2 = await ensureWallet(c, st2);
      expect(w2.error).toBeNull();
      const r2 = (await c.query("select free_leads_granted, free_leads_expires_at, is_demo from public.stationery_wallets where stationery_id = $1", [st2])).rows[0];
      expect(r2).toMatchObject({ free_leads_granted: 99, free_leads_expires_at: null, is_demo: false });
      // imutável
      await c.query("reset role");
      const u = await attempt(c, "update public.stationery_wallets set free_leads_granted = 1000 where stationery_id = $1", [st]);
      expect(u.code).toBe("42501");
      const d = await attempt(c, "delete from public.stationery_wallets where stationery_id = $1", [st]);
      expect(d.code).toBe("42501");
      // sem plano ativo
      await c.query("update public.plans set status = 'archived' where status = 'active'");
      await c.query("set local role service_role");
      const st3 = await seedStationery(c, { status: "active" });
      const w3 = await ensureWallet(c, st3);
      expect(w3.hint).toBe("billing_unavailable");
      const nf = await ensureWallet(c, "00000000-0000-4000-8000-0000000000ff");
      expect(nf.hint).toBe("not_found");
    });
  });

  it("billing_wallet_summary devolve saldo, grátis restantes, validade, passe e min tier", async () => {
    await withClaims("system", async (c) => {
      await publishPlanOk(c, plan({ free_leads: 2, free_leads_validity_days: 10, tiers: [{ min_items: 1, max_items: 5, price_cents: 300 }, { min_items: 6, max_items: null, price_cents: 700 }] }));
      const st = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const s = (await c.query("select public.billing_wallet_summary($1::uuid) as s", [st])).rows[0].s as Record<string, unknown>;
      expect(s).toMatchObject({ available: true, balance_cents: 0, free_granted: 2, free_left: 2, active_pass: null, can_receive_min_tier: true, min_tier_price_cents: 300 });
      expect(typeof s.free_expires_at).toBe("string");
      expect((s.plan as { id: string }).id).toBe(await activePlanId(c));
      await c.query("update public.plans set status = 'archived' where status = 'active'");
      const st2 = await seedStationery(c, { status: "active" });
      const s2 = (await c.query("select public.billing_wallet_summary($1::uuid) as s", [st2])).rows[0].s as Record<string, unknown>;
      expect(s2).toMatchObject({ available: false });
    });
  });
});

type PlanCase = [string, Record<string, unknown>];
