import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asServiceCommitted,
  attemptH,
  cleanupUsers,
  IDS,
  purgeLeads,
  purgeStationeries,
  seedCart,
  seedLead,
  seedStationery,
  seedUsers,
  withClaims,
  withSuperuser,
  type Identity,
} from "./helpers";

const CREATE = `select * from public.lead_create($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::int, $8::uuid,
  $9::text, $10::jsonb, $11::text, $12::uuid, $13::boolean, $14::int, $15::int)`;

const ITEMS = [
  { name: "Caderno 96 folhas", item_key: "caderno 96 folhas", quantity: 2 },
  { name: "Lápis HB", item_key: "lapis hb", quantity: 12 },
];

type Opts = {
  requester?: string;
  cart?: string | null;
  list?: string;
  stationery: string;
  neighborhood?: string | null;
  items?: unknown;
  consent?: string | null;
  key?: string;
  maxPerDay?: number;
  maxOpen?: number;
};

async function muni(c: Client): Promise<string> {
  return (await c.query("select id from public.municipalities order by ibge_code limit 1")).rows[0].id as string;
}

function args(municipalityId: string, o: Opts): unknown[] {
  return [
    o.requester ?? IDS.parent,
    o.cart === undefined ? null : o.cart,
    o.list ?? randomUUID(),
    o.stationery,
    "Escola Demonstração",
    "5º ano",
    2027,
    municipalityId,
    o.neighborhood === undefined ? "centro" : o.neighborhood,
    JSON.stringify(o.items ?? ITEMS),
    o.consent === undefined ? "v1" : o.consent,
    o.key ?? randomUUID(),
    true,
    o.maxPerDay ?? 10,
    o.maxOpen ?? 5,
  ];
}

/** Chama lead_create como service_role dentro da transação de teste. */
async function create(c: Client, o: Opts) {
  const m = await muni(c);
  return attemptH(c, CREATE, args(m, o));
}

async function fixture(c: Client) {
  const stationery = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
  const cart = await seedCart(c, IDS.parent);
  return { stationery, cart };
}

describe("S14 lead_create", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("é SECURITY DEFINER, search_path vazio e EXECUTE só para service_role", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query(
        `select proname, prosecdef, proconfig,
                has_function_privilege('anon', oid, 'execute') as anon,
                has_function_privilege('authenticated', oid, 'execute') as auth,
                has_function_privilege('service_role', oid, 'execute') as svc,
                has_function_privilege('public', oid, 'execute') as pub
           from pg_proc
          where pronamespace = 'public'::regnamespace
            and proname in ('lead_create', 'lead_transition', 'lead_mark_viewed', 'lead_record_whatsapp_open', 'lead_expire_due')`,
      );
      expect(r.rows.map((x) => x.proname).sort()).toEqual([
        "lead_create",
        "lead_expire_due",
        "lead_mark_viewed",
        "lead_record_whatsapp_open",
        "lead_transition",
      ]);
      for (const row of r.rows) {
        expect(row.prosecdef).toBe(true);
        expect(row.proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/^search_path=("")?$/)]));
        expect(row).toMatchObject({ anon: false, auth: false, svc: true, pub: false });
      }
    });
  });

  it.each(["anon", "parent", "stationery_member", "admin", "system_profile"] as Identity[])(
    "%s não executa lead_create direto",
    async (who) => {
      await withClaims(who, async (c) => {
        const st = await seedStationery(c, { status: "active" });
        const cart = await seedCart(c, IDS.parent);
        const r = await create(c, { stationery: st, cart });
        expect(r.code).toBe("42501");
      });
    },
  );

  it("cria lead, itens, consentimento e evento created com item_count (1 evento, sem cobrança)", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      const r = await create(c, { stationery, cart });
      expect(r.error).toBeNull();
      const row = r.rows[0] as { lead_id: string; code: string; created: boolean };
      expect(row.created).toBe(true);
      expect(row.code).toMatch(/^LC-[0-9A-HJKMNP-TV-Z]{4}$/);
      const l = (await c.query("select * from public.leads where id = $1", [row.lead_id])).rows[0];
      expect(l).toMatchObject({
        status: "received",
        requester_id: IDS.parent,
        stationery_id: stationery,
        cart_id: cart,
        school_name: "Escola Demonstração",
        grade_label: "5º ano",
        school_year: 2027,
        neighborhood: "centro",
        item_count: 2,
        consent_text_version: "v1",
        is_demo: true,
        quoted_total_cents: null,
        declared_sale_cents: null,
      });
      const diff = (await c.query("select extract(epoch from (expires_at - now())) as s from public.leads where id = $1", [row.lead_id])).rows[0].s;
      expect(Number(diff)).toBeGreaterThan(7 * 86400 - 60);
      expect(Number(diff)).toBeLessThanOrEqual(7 * 86400);
      const items = (await c.query("select position, name, item_key, quantity from public.lead_items where lead_id = $1 order by position", [row.lead_id])).rows;
      expect(items).toEqual([
        { position: 1, name: "Caderno 96 folhas", item_key: "caderno 96 folhas", quantity: 2 },
        { position: 2, name: "Lápis HB", item_key: "lapis hb", quantity: 12 },
      ]);
      const consent = (await c.query("select profile_id, purpose, text_version, revoked_at from public.consents where id = $1", [l.consent_id])).rows[0];
      expect(consent).toEqual({ profile_id: IDS.parent, purpose: "lead_whatsapp_quote", text_version: "v1", revoked_at: null });
      const ev = (await c.query("select event_type, from_status, to_status, actor_role, actor_id, item_count, amount_cents from public.lead_events where lead_id = $1", [row.lead_id])).rows;
      expect(ev).toEqual([
        { event_type: "created", from_status: null, to_status: "received", actor_role: "parent", actor_id: IDS.parent, item_count: 2, amount_cents: null },
      ]);
    });
  });

  it("exige papel parent (membro da papelaria, admin e sem perfil são recusados)", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      for (const who of [IDS.stationery_member, IDS.admin, IDS.school_member, IDS.orphan]) {
        const r = await create(c, { stationery, cart, requester: who });
        expect(r.code, who).toBe("42501");
        expect(r.hint, who).toBe("forbidden");
      }
    });
  });

  it("recusa o solicitante que é membro da papelaria (mesmo com papel parent)", async () => {
    await withClaims("system", async (c) => {
      const stationery = await seedStationery(c, { status: "active", ownerId: IDS.parent });
      const cart = await seedCart(c, IDS.parent);
      const r = await create(c, { stationery, cart });
      expect(r.code).toBe("42501");
      expect(r.hint).toBe("forbidden");
    });
  });

  it("recusa carrinho alheio, inexistente ou ausente", async () => {
    await withClaims("system", async (c) => {
      const { stationery } = await fixture(c);
      const other = await seedCart(c, IDS.admin);
      for (const cart of [other, randomUUID(), null]) {
        const r = await create(c, { stationery, cart });
        expect(r.hint, String(cart)).toBe("forbidden");
      }
    });
  });

  it.each(["signup", "accreditation", "under_review", "approved", "paused", "suspended", "rejected"] as const)(
    "recusa papelaria %s (só active recebe lead novo)",
    async (status) => {
      await withClaims("system", async (c) => {
        const stationery = await seedStationery(c, { status, ownerId: IDS.stationery_member, pausedBy: status === "paused" ? "owner" : null });
        const cart = await seedCart(c, IDS.parent);
        const r = await create(c, { stationery, cart });
        expect(r.hint).toBe("stationery_unavailable");
      });
    },
  );

  it("papelaria inexistente é stationery_unavailable", async () => {
    await withClaims("system", async (c) => {
      const cart = await seedCart(c, IDS.parent);
      expect((await create(c, { stationery: randomUUID(), cart })).hint).toBe("stationery_unavailable");
    });
  });

  it("área: bairro da papelaria, área cadastrada, sem bairro e fora da área", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      expect((await create(c, { stationery, cart, neighborhood: "centro" })).error).toBeNull(); // bairro da papelaria
      expect((await create(c, { stationery, cart, neighborhood: null })).error).toBeNull(); // sem bairro: qualquer do município
      const out = await create(c, { stationery, cart, neighborhood: "bairro distante" });
      expect(out.hint).toBe("out_of_area");
      await c.query("reset role");
      await c.query(
        "insert into public.stationery_areas (stationery_id, municipality_id, neighborhood) select $1, municipality_id, 'bairro distante' from public.stationeries where id = $1",
        [stationery],
      );
      await c.query("set local role service_role");
      expect((await create(c, { stationery, cart, neighborhood: "bairro distante" })).error).toBeNull(); // área cadastrada
    });
  });

  it("município que a papelaria não atende é out_of_area", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      const r = await attemptH(c, CREATE, args(randomUUID(), { stationery, cart }));
      // FK de município inexistente também recusa; o que importa é que nenhum lead nasce
      expect(r.error).not.toBeNull();
      await c.query("reset role");
      await c.query(
        "insert into public.municipalities (ibge_code, uf, name, is_enabled) values ('9999999', 'MT', 'Outra Cidade', true)",
      );
      const other = (await c.query("select id from public.municipalities where ibge_code = '9999999'")).rows[0].id as string;
      await c.query("set local role service_role");
      const r2 = await attemptH(c, CREATE, args(other, { stationery, cart }));
      expect(r2.hint).toBe("out_of_area");
    });
  });

  it("itens 1..300, forma inválida e quantidade fora da faixa", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Item ${i}`, item_key: `item ${i}`, quantity: 1 }));
      expect((await create(c, { stationery, cart, items: [] })).hint).toBe("invalid_input");
      expect((await create(c, { stationery, cart, items: many(301) })).hint).toBe("limit_exceeded");
      const r300 = await create(c, { stationery, cart, items: many(300), list: randomUUID() });
      expect(r300.error).toBeNull();
      const bad: unknown[] = [
        {},
        "texto",
        [{ name: "x", item_key: "x", quantity: 0 }],
        [{ name: "x", item_key: "x", quantity: 1000 }],
        [{ name: "x", item_key: "x", quantity: 1.5 }],
        [{ name: "x", item_key: "x", quantity: "2" }],
        [{ name: "  ", item_key: "x", quantity: 1 }],
        [{ name: "x", item_key: "", quantity: 1 }],
        [{ name: "x".repeat(201), item_key: "x", quantity: 1 }],
        [{ name: "x", quantity: 1 }],
      ];
      for (const items of bad) {
        expect((await create(c, { stationery, cart, items })).hint, JSON.stringify(items)).toBe("invalid_input");
      }
    });
  });

  it("sem versão de consentimento não nasce lead nem consentimento", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      for (const consent of [null, "", "   "]) {
        const r = await create(c, { stationery, cart, consent });
        expect(r.hint).toBe("consent_required");
      }
      expect(Number((await c.query("select count(*) from public.leads where requester_id = $1", [IDS.parent])).rows[0].count)).toBe(0);
      expect(Number((await c.query("select count(*) from public.consents where profile_id = $1 and purpose = 'lead_whatsapp_quote'", [IDS.parent])).rows[0].count)).toBe(0);
    });
  });

  it("idempotência pela chave e pelo lead aberto (mesma papelaria e lista)", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      const list = randomUUID();
      const key = randomUUID();
      const a = (await create(c, { stationery, cart, list, key })).rows[0] as { lead_id: string; code: string; created: boolean };
      const b = (await create(c, { stationery, cart, list, key })).rows[0] as typeof a;
      expect(b).toEqual({ ...a, created: false });
      const c2 = (await create(c, { stationery, cart, list, key: randomUUID() })).rows[0] as typeof a; // outra chave, mesmo lead aberto
      expect(c2).toEqual({ ...a, created: false });
      // mesma chave, outra lista: devolve o lead da chave (reenvio)
      const d = (await create(c, { stationery, cart, list: randomUUID(), key })).rows[0] as typeof a;
      expect(d.lead_id).toBe(a.lead_id);
      expect(Number((await c.query("select count(*) from public.leads where requester_id = $1", [IDS.parent])).rows[0].count)).toBe(1);
      expect(Number((await c.query("select count(*) from public.consents where profile_id = $1 and purpose = 'lead_whatsapp_quote'", [IDS.parent])).rows[0].count)).toBe(1);
      expect(Number((await c.query("select count(*) from public.lead_events where lead_id = $1", [a.lead_id])).rows[0].count)).toBe(1);
    });
  });

  it("lead terminal libera novo lead para a mesma papelaria e lista; lead vencido é expirado antes", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      const list = randomUUID();
      const old = await seedLead(c, { stationeryId: stationery, listId: list, status: "cancelled", cartId: cart });
      const r = (await create(c, { stationery, cart, list })).rows[0] as { lead_id: string; created: boolean };
      expect(r.created).toBe(true);
      expect(r.lead_id).not.toBe(old.id);
      const list2 = randomUUID();
      const overdue = await seedLead(c, { stationeryId: stationery, listId: list2, status: "received", expiresIn: "-1 hour", cartId: cart });
      const r2 = (await create(c, { stationery, cart, list: list2 })).rows[0] as { lead_id: string; created: boolean };
      expect(r2.created).toBe(true);
      expect(r2.lead_id).not.toBe(overdue.id);
      const st = (await c.query("select status::text from public.leads where id = $1", [overdue.id])).rows[0].status;
      expect(st).toBe("expired");
      const ev = (await c.query("select event_type, actor_role, actor_id from public.lead_events where lead_id = $1 order by created_at", [overdue.id])).rows;
      expect(ev.map((e) => e.event_type)).toEqual(["created", "expired"]);
      expect(ev[1]).toMatchObject({ actor_role: "system", actor_id: null });
    });
  });

  it("limite de 24 h por solicitante (rate_limited); leads antigos não contam", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      await seedLead(c, { stationeryId: stationery, status: "cancelled", overrides: { created_at: new Date(Date.now() - 30 * 3600_000).toISOString() } });
      for (let i = 0; i < 3; i++) {
        expect((await create(c, { stationery, cart, maxPerDay: 3 })).error).toBeNull();
      }
      const r = await create(c, { stationery, cart, maxPerDay: 3 });
      expect(r.hint).toBe("rate_limited");
      expect(r.code).toBe("54000");
      // limite padrão 10
      for (let i = 0; i < 7; i++) expect((await create(c, { stationery, cart, maxPerDay: 10 })).error).toBeNull(); // 3 + 7 = 10 em 24 h
      expect((await create(c, { stationery, cart, maxPerDay: 10 })).hint).toBe("rate_limited"); // o lead de 30 h não conta
    });
  });

  it("limite de abertos por (solicitante, lista) entre papelarias diferentes", async () => {
    await withClaims("system", async (c) => {
      const cart = await seedCart(c, IDS.parent);
      const list = randomUUID();
      for (let i = 0; i < 2; i++) {
        const st = await seedStationery(c, { status: "active" });
        expect((await create(c, { stationery: st, cart, list, maxOpen: 2 })).error).toBeNull();
      }
      const st3 = await seedStationery(c, { status: "active" });
      expect((await create(c, { stationery: st3, cart, list, maxOpen: 2 })).hint).toBe("rate_limited");
      // outra lista não é afetada
      expect((await create(c, { stationery: st3, cart, list: randomUUID(), maxOpen: 2 })).error).toBeNull();
    });
  });

  it("colisão de código: alfabeto forçado cresce de 4 para 5 caracteres e depois 6", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      await c.query("select set_config('app.lead_code_alphabet', 'A', true)");
      const codes: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await create(c, { stationery, cart, list: randomUUID() });
        expect(r.error).toBeNull();
        codes.push((r.rows[0] as { code: string }).code);
      }
      expect(codes).toEqual(["LC-AAAA", "LC-AAAAA", "LC-AAAAAA"]);
      const r = await create(c, { stationery, cart, list: randomUUID() });
      expect(r.hint).toBe("limit_exceeded"); // 4, 5 e 6 esgotados
    });
  });

  it("alfabeto inválido volta ao padrão Crockford (sem I, L, O, U)", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      await c.query("select set_config('app.lead_code_alphabet', 'ILOU!', true)");
      const r = await create(c, { stationery, cart });
      expect((r.rows[0] as { code: string }).code).toMatch(/^LC-[0-9A-HJKMNP-TV-Z]{4}$/);
    });
  });

  it("solicitante diferente do sub do JWT é recusado", async () => {
    await withClaims("system", async (c) => {
      const { stationery, cart } = await fixture(c);
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role", sub: IDS.admin })]);
      const r = await create(c, { stationery, cart });
      expect(r.code).toBe("42501");
    });
  });
});

describe("S14 lead_create · concorrência (dados confirmados)", () => {
  const stationeryIds: string[] = [];
  const cartIds: string[] = [];
  beforeAll(seedUsers);
  afterAll(async () => {
    await purgeLeads({ requesterIds: [IDS.parent], cartIds });
    await purgeStationeries(stationeryIds);
    await cleanupUsers();
  });

  it("duas criações em paralelo com a mesma chave devolvem o mesmo lead (1 criado, 1 consentimento)", async () => {
    const setup = await withSuperuser(async (c) => {
      await c.query("begin");
      const stationery = await seedStationery(c, { status: "active", ownerId: IDS.stationery_member });
      const cart = await seedCart(c, IDS.parent);
      await c.query("commit");
      return { stationery, cart };
    });
    stationeryIds.push(setup.stationery);
    cartIds.push(setup.cart);
    const list = randomUUID();
    const key = randomUUID();
    const run = () =>
      asServiceCommitted(async (c) => {
        const m = await muni(c);
        const r = await c.query(CREATE, args(m, { stationery: setup.stationery, cart: setup.cart, list, key }));
        return r.rows[0] as { lead_id: string; code: string; created: boolean };
      });
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.lead_id).toBe(b.lead_id);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    await withSuperuser(async (c) => {
      expect(Number((await c.query("select count(*) from public.leads where requester_id = $1", [IDS.parent])).rows[0].count)).toBe(1);
      expect(Number((await c.query("select count(*) from public.consents where profile_id = $1 and purpose = 'lead_whatsapp_quote'", [IDS.parent])).rows[0].count)).toBe(1);
      expect(Number((await c.query("select count(*) from public.lead_events where lead_id = $1", [a.lead_id])).rows[0].count)).toBe(1);
    });
  });
});
