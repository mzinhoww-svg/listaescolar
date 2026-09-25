import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, inTx, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

// Fixtures criadas fora dos papéis de teste (superuser) e removidas no fim.
const CART_PARENT = "00000000-0000-4000-8000-0000000c0001";
const CART_SCHOOL = "00000000-0000-4000-8000-0000000c0002";
const INACTIVE_SLUG = "loja-inativa-teste";
const NON_OWNERS: Identity[] = ["school_member", "stationery_member", "orphan"];

describe("S12 schema: carrinho, varejistas, preços e cliques", () => {
  beforeAll(async () => {
    await seedUsers();
    await withSuperuser(async (c) => {
      await c.query(
        `insert into public.carts (id, owner_id, strategy) values ($1, $2, 'cheapest'), ($3, $4, 'balanced')`,
        [CART_PARENT, IDS.parent, CART_SCHOOL, IDS.school_member],
      );
      await c.query(
        `insert into public.cart_items (cart_id, name, quantity) values ($1, 'Caderno 96 folhas', 2), ($2, 'Lápis HB', 3)`,
        [CART_PARENT, CART_SCHOOL],
      );
      await c.query(
        `insert into public.retailers (slug, name, base_url, search_url_template, is_active)
         values ($1, 'Inativa', 'https://inativa.example.com', 'https://inativa.example.com/s?q={query}', false)
         on conflict do nothing`,
        [INACTIVE_SLUG],
      );
      await c.query(
        `insert into public.affiliate_clicks (cart_id, retailer_id, profile_id, affiliate_applied, target_url)
         select $1, id, $2, false, 'https://www.kalunga.com.br/busca/caderno' from public.retailers where slug = 'kalunga'`,
        [CART_PARENT, IDS.parent],
      );
    });
  });
  afterAll(async () => {
    await withSuperuser(async (c) => {
      await c.query("delete from public.carts where id = any($1::uuid[])", [[CART_PARENT, CART_SCHOOL]]);
      await c.query("delete from public.retailers where slug = $1", [INACTIVE_SLUG]);
    });
    await cleanupUsers();
  });

  describe("enums e colunas", () => {
    it("cart_strategy e affiliate_kind têm os valores do spec", async () => {
      await withSuperuser(async (c) => {
        const s = await c.query("select unnest(enum_range(null::public.cart_strategy))::text as v");
        expect(s.rows.map((r) => r.v)).toEqual(["cheapest", "fewest_stores", "balanced", "local_stationery"]);
        const a = await c.query("select unnest(enum_range(null::public.affiliate_kind))::text as v");
        expect(a.rows.map((r) => r.v)).toEqual(["none", "mercadolivre", "amazon"]);
      });
    });
    it("tabelas têm id/created_at/updated_at e RLS habilitada", async () => {
      await withSuperuser(async (c) => {
        for (const t of ["retailers", "carts", "cart_items", "price_snapshots", "affiliate_clicks"]) {
          const cols = await c.query(
            "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
            [t],
          );
          const names = cols.rows.map((r) => r.column_name);
          expect(names, t).toEqual(expect.arrayContaining(["id", "created_at", "updated_at"]));
          const rls = await c.query("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`]);
          expect(rls.rows[0]?.relrowsecurity, t).toBe(true);
        }
      });
    });
    it("carts só referencia list_items (0600) fora da própria trilha; carts.list_id segue sem FK (polimórfica)", async () => {
      await withSuperuser(async (c) => {
        const r = await c.query(
          `select conrelid::regclass::text as t, confrelid::regclass::text as f from pg_constraint
           where contype = 'f' and conrelid = any(array['public.carts','public.cart_items','public.affiliate_clicks']::regclass[])`,
        );
        const targets = r.rows.map((x) => String(x.f).replace(/^public\./, ""));
        expect(targets.every((t) => ["auth.users", "profiles", "carts", "retailers", "list_items"].includes(t))).toBe(true);
        expect(targets.length).toBeGreaterThan(0);
      });
    });
    it("quantity <= 0 e strategy inválida são recusadas", async () => {
      await inTx(async (c) => {
        const q = await attempt(c, "insert into public.cart_items (cart_id, name, quantity) values ($1, 'x', 0)", [CART_PARENT]);
        expect(q.error).not.toBeNull();
        const s = await attempt(c, "insert into public.carts (owner_id, strategy) values ($1, 'foo')", [IDS.parent]);
        expect(s.error).not.toBeNull();
      });
    });
  });

  describe("seed dos varejistas", () => {
    it("quatro varejistas com https, {query} e sem afiliado embutido", async () => {
      await withSuperuser(async (c) => {
        const r = await c.query(
          "select slug, base_url, search_url_template, affiliate_kind::text as kind, is_active from public.retailers where slug <> $1 order by slug",
          [INACTIVE_SLUG],
        );
        expect(r.rows.map((x) => x.slug)).toEqual(["amazon", "kalunga", "magalu", "mercadolivre"]);
        const by = Object.fromEntries(r.rows.map((x) => [x.slug, x]));
        expect(by.kalunga.base_url).toBe("https://www.kalunga.com.br");
        expect(by.magalu.base_url).toBe("https://www.magazineluiza.com.br");
        expect(by.mercadolivre.base_url).toBe("https://www.mercadolivre.com.br");
        expect(by.amazon.base_url).toBe("https://www.amazon.com.br");
        expect(by.kalunga.kind).toBe("none");
        expect(by.magalu.kind).toBe("none");
        expect(by.mercadolivre.kind).toBe("mercadolivre");
        expect(by.amazon.kind).toBe("amazon");
        for (const x of r.rows) {
          expect(x.is_active).toBe(true);
          expect(x.search_url_template).toMatch(/^https:\/\//);
          expect(x.search_url_template).toContain("{query}");
          const registrable = new URL(x.base_url).hostname.replace(/^www\./, "");
          expect(((h: string) => h === registrable || h.endsWith("." + registrable))(
              new URL(x.search_url_template.replace("{query}", "abc")).hostname,
            ),
          ).toBe(true);
          expect(x.search_url_template).not.toMatch(/tag=|matt_|affiliate|utm_|partner|aff/i);
        }
      });
    });
    it("recusa base_url http e template sem {query}", async () => {
      await inTx(async (c) => {
        const a = await attempt(c, `insert into public.retailers (slug, name, base_url, search_url_template) values ('x1','X','http://x.example.com','https://x.example.com/?q={query}')`);
        expect(a.error).not.toBeNull();
        const b = await attempt(c, `insert into public.retailers (slug, name, base_url, search_url_template) values ('x2','X','https://x.example.com','https://x.example.com/?q=')`);
        expect(b.error).not.toBeNull();
      });
    });
  });

  describe("search_url_template", () => {
    const TPL = (t: string) =>
      `insert into public.retailers (slug, name, base_url, search_url_template) values ('tpl','T','https://www.kalunga.com.br','${t}')`;
    for (const bad of [
      "https://www.kalunga.com.br{query}",
      "https://www.kalunga.com.br.evil.com{query}.x/",
      "https://{query}.evil.com/",
      "https://www.kalunga.com.brx{query}",
    ]) {
      it(`recusa ${bad}`, async () => {
        await inTx(async (c) => {
          expect((await attempt(c, TPL(bad))).error).not.toBeNull();
        });
      });
    }
    for (const ok of ["https://a.example.com/busca/{query}", "https://a.example.com/s?k={query}", "https://a.example.com/#{query}"]) {
      it(`aceita ${ok}`, async () => {
        await inTx(async (c) => {
          expect((await attempt(c, TPL(ok))).error).toBeNull();
        });
      });
    }
  });

  describe("RLS retailers", () => {
    for (const who of ["anon", "parent", "school_member", "orphan"] as Identity[]) {
      it(`${who} lê só varejistas ativos`, async () => {
        await withClaims(who, async (c) => {
          const r = await attempt(c, "select slug, is_active from public.retailers");
          expect(r.error).toBeNull();
          expect(r.rows.length).toBe(4);
          expect(r.rows.every((x) => x.is_active === true)).toBe(true);
          expect(r.rows.map((x) => x.slug)).not.toContain(INACTIVE_SLUG);
        });
      });
    }
    for (const who of ["admin", "system"] as Identity[]) {
      it(`${who} lê também inativos`, async () => {
        await withClaims(who, async (c) => {
          const r = await c.query("select slug from public.retailers");
          expect(r.rows.map((x) => x.slug)).toContain(INACTIVE_SLUG);
        });
      });
    }
    for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan"] as Identity[]) {
      it(`${who} não escreve em retailers`, async () => {
        await withClaims(who, async (c) => {
          const ins = await attempt(c, `insert into public.retailers (slug, name, base_url, search_url_template) values ('z','Z','https://z.example.com','https://z.example.com/?q={query}')`);
          expect(ins.error).not.toBeNull();
          const upd = await attempt(c, "update public.retailers set search_url_template = 'https://evil.example.com/?q={query}'");
          expect(upd.error !== null || upd.rowCount === 0).toBe(true);
          const del = await attempt(c, "delete from public.retailers");
          expect(del.error !== null || del.rowCount === 0).toBe(true);
        });
      });
    }
    it("system (perfil authenticated) escreve em retailers", async () => {
      await withClaims("system_profile", async (c) => {
        const r = await attempt(c, `insert into public.retailers (slug, name, base_url, search_url_template) values ('z','Z','https://z.example.com','https://z.example.com/?q={query}')`);
        expect(r.error).toBeNull();
      });
    });
    it("admin escreve em retailers", async () => {
      await withClaims("admin", async (c) => {
        const r = await attempt(c, `insert into public.retailers (slug, name, base_url, search_url_template) values ('z','Z','https://z.example.com','https://z.example.com/?q={query}')`);
        expect(r.error).toBeNull();
      });
    });
  });

  describe("RLS carts e cart_items", () => {
    it("dono lê o próprio carrinho e itens, não os de terceiros", async () => {
      await withClaims("parent", async (c) => {
        const carts = await c.query("select id from public.carts");
        expect(carts.rows.map((x) => x.id)).toEqual([CART_PARENT]);
        const items = await c.query("select name from public.cart_items");
        expect(items.rows.map((x) => x.name)).toEqual(["Caderno 96 folhas"]);
      });
    });
    for (const who of NON_OWNERS) {
      it(`${who} (terceiro) não vê carrinho/itens do parent`, async () => {
        await withClaims(who, async (c) => {
          const carts = await c.query("select id from public.carts where id = $1", [CART_PARENT]);
          expect(carts.rowCount).toBe(0);
          const items = await c.query("select id from public.cart_items where cart_id = $1", [CART_PARENT]);
          expect(items.rowCount).toBe(0);
        });
      });
    }
    it("anon não acessa carrinho", async () => {
      await withClaims("anon", async (c) => {
        expect((await attempt(c, "select * from public.carts")).error).not.toBeNull();
        expect((await attempt(c, "select * from public.cart_items")).error).not.toBeNull();
        expect((await attempt(c, "insert into public.carts (owner_id) values ($1)", [IDS.parent])).error).not.toBeNull();
      });
    });
    for (const who of ["admin", "system"] as Identity[]) {
      it(`${who} lê todos os carrinhos`, async () => {
        await withClaims(who, async (c) => {
          const r = await c.query("select id from public.carts where id = any($1::uuid[])", [[CART_PARENT, CART_SCHOOL]]);
          expect(r.rowCount).toBe(2);
        });
      });
    }
    it("admin NÃO insere/altera/apaga carrinhos e itens de terceiros", async () => {
      await withClaims("admin", async (c) => {
        expect((await attempt(c, "insert into public.carts (owner_id) values ($1)", [IDS.parent])).error).not.toBeNull();
        expect((await attempt(c, "insert into public.cart_items (cart_id, name, quantity) values ($1, 'x', 1)", [CART_PARENT])).error).not.toBeNull();
        for (const sql of [
          "update public.carts set strategy = 'cheapest' where id = $1",
          "delete from public.carts where id = $1",
        ]) {
          const r = await attempt(c, sql, [CART_PARENT]);
          expect(r.error !== null || r.rowCount === 0, sql).toBe(true);
        }
        for (const sql of [
          "update public.cart_items set quantity = 9 where cart_id = $1",
          "delete from public.cart_items where cart_id = $1",
        ]) {
          const r = await attempt(c, sql, [CART_PARENT]);
          expect(r.error !== null || r.rowCount === 0, sql).toBe(true);
        }
      });
    });
    it("options_snapshot acima de 64KB é recusado", async () => {
      await inTx(async (c) => {
        const big = JSON.stringify({ x: "a".repeat(70000) });
        expect((await attempt(c, "insert into public.carts (owner_id, options_snapshot) values ($1, $2::jsonb)", [IDS.parent, big])).error).not.toBeNull();
        expect((await attempt(c, "insert into public.carts (owner_id, options_snapshot) values ($1, '{\"ok\":1}'::jsonb)", [IDS.parent])).error).toBeNull();
      });
    });
    it("dono cria carrinho e itens para si; não em nome de outro", async () => {
      await withClaims("parent", async (c) => {
        const own = await attempt(c, "insert into public.carts (owner_id, strategy) values ($1, 'fewest_stores') returning id", [IDS.parent]);
        expect(own.error).toBeNull();
        const id = own.rows[0]?.id;
        const item = await attempt(c, "insert into public.cart_items (cart_id, name, quantity) values ($1, 'Borracha', 1)", [id]);
        expect(item.error).toBeNull();
        const other = await attempt(c, "insert into public.carts (owner_id) values ($1)", [IDS.school_member]);
        expect(other.error).not.toBeNull();
      });
    });
    it("terceiro não insere item em carrinho alheio nem altera/apaga", async () => {
      await withClaims("school_member", async (c) => {
        const ins = await attempt(c, "insert into public.cart_items (cart_id, name, quantity) values ($1, 'x', 1)", [CART_PARENT]);
        expect(ins.error).not.toBeNull();
        const upd = await attempt(c, "update public.carts set strategy = 'cheapest' where id = $1", [CART_PARENT]);
        expect(upd.rowCount).toBe(0);
        const del = await attempt(c, "delete from public.carts where id = $1", [CART_PARENT]);
        expect(del.rowCount).toBe(0);
      });
    });
    it("dono não move o carrinho para outro dono", async () => {
      await withClaims("parent", async (c) => {
        const r = await attempt(c, "update public.carts set owner_id = $1 where id = $2", [IDS.school_member, CART_PARENT]);
        expect(r.error !== null || r.rowCount === 0).toBe(true);
      });
    });
    it("apagar carrinho apaga itens em cascata", async () => {
      await withSuperuser(async (c) => {
        await c.query("begin");
        try {
          await c.query("delete from public.carts where id = $1", [CART_PARENT]);
          const r = await c.query("select 1 from public.cart_items where cart_id = $1", [CART_PARENT]);
          expect(r.rowCount).toBe(0);
        } finally {
          await c.query("rollback");
        }
      });
    });
    it("apagar o usuário apaga seus carrinhos", async () => {
      await withSuperuser(async (c) => {
        await c.query("begin");
        try {
          await c.query("delete from auth.users where id = $1", [IDS.parent]);
          const r = await c.query("select 1 from public.carts where id = $1", [CART_PARENT]);
          expect(r.rowCount).toBe(0);
        } finally {
          await c.query("rollback");
        }
      });
    });
    it("updated_at avança no update", async () => {
      await withSuperuser(async (c) => {
        await c.query("begin");
        try {
          const before = await c.query("select updated_at from public.carts where id = $1", [CART_PARENT]);
          await c.query("select pg_sleep(0.01)");
          await c.query("update public.carts set strategy = 'balanced' where id = $1", [CART_PARENT]);
          const after = await c.query("select updated_at from public.carts where id = $1", [CART_PARENT]);
          expect(after.rows[0]?.updated_at.getTime()).toBeGreaterThan(before.rows[0]?.updated_at.getTime());
        } finally {
          await c.query("rollback");
        }
      });
    });
  });

  describe("auditoria e índices", () => {
    it("alterar/inserir/apagar retailers gera linhas em audit_log", async () => {
      await inTx(async (c) => {
        await c.query(`insert into public.retailers (slug, name, base_url, search_url_template) values ('aud','A','https://a.example.com','https://a.example.com/?q={query}')`);
        await c.query("update public.retailers set name = 'A2' where slug = 'aud'");
        await c.query("delete from public.retailers where slug = 'aud'");
        const r = await c.query(
          "select action from public.audit_log where entity_table = 'retailers' and (after ->> 'slug' = 'aud' or before ->> 'slug' = 'aud') order by id",
        );
        expect(r.rows.map((x) => x.action).sort()).toEqual(["DELETE", "INSERT", "UPDATE"]);
      });
    });
    it("índice em affiliate_clicks(retailer_id) existe", async () => {
      await withSuperuser(async (c) => {
        const r = await c.query("select 1 from pg_indexes where tablename = 'affiliate_clicks' and indexdef like '%(retailer_id)%'");
        expect(r.rowCount).toBe(1);
      });
    });
  });

  describe("RLS affiliate_clicks", () => {
    const INSERT = `insert into public.affiliate_clicks (cart_id, retailer_id, profile_id, affiliate_applied, target_url)
      select $1, id, $2, false, 'https://www.kalunga.com.br/busca/x' from public.retailers where slug = 'kalunga'`;
    it("dono lê o próprio clique", async () => {
      await withClaims("parent", async (c) => {
        const r = await c.query("select profile_id from public.affiliate_clicks");
        expect(r.rowCount).toBe(1);
        expect(r.rows[0]?.profile_id).toBe(IDS.parent);
      });
    });
    for (const who of ["school_member", "stationery_member", "orphan"] as Identity[]) {
      it(`${who} não vê cliques alheios`, async () => {
        await withClaims(who, async (c) => {
          const r = await c.query("select 1 from public.affiliate_clicks");
          expect(r.rowCount).toBe(0);
        });
      });
    }
    it("anon não acessa cliques", async () => {
      await withClaims("anon", async (c) => {
        expect((await attempt(c, "select * from public.affiliate_clicks")).error).not.toBeNull();
      });
    });
    it("admin lê cliques", async () => {
      await withClaims("admin", async (c) => {
        expect((await c.query("select 1 from public.affiliate_clicks")).rowCount).toBe(1);
      });
    });
    it("dono registra clique em carrinho próprio, repetido registra de novo", async () => {
      await withClaims("parent", async (c) => {
        expect((await attempt(c, INSERT, [CART_PARENT, IDS.parent])).error).toBeNull();
        expect((await attempt(c, INSERT, [CART_PARENT, IDS.parent])).error).toBeNull();
        expect((await c.query("select 1 from public.affiliate_clicks")).rowCount).toBe(3);
      });
    });
    it("não registra clique em carrinho alheio nem em nome de outro perfil", async () => {
      await withClaims("parent", async (c) => {
        expect((await attempt(c, INSERT, [CART_SCHOOL, IDS.parent])).error).not.toBeNull();
        expect((await attempt(c, INSERT, [CART_PARENT, IDS.school_member])).error).not.toBeNull();
      });
    });
    it("clique com varejista inativo é recusado", async () => {
      const inactiveId = await withSuperuser(
        async (c) => (await c.query("select id from public.retailers where slug = $1", [INACTIVE_SLUG])).rows[0]?.id as string,
      );
      await withClaims("parent", async (c) => {
        const r = await attempt(
          c,
          `insert into public.affiliate_clicks (cart_id, retailer_id, profile_id, affiliate_applied, target_url)
           values ($1, $3, $2, false, 'https://inativa.example.com/s?q=x')`,
          [CART_PARENT, IDS.parent, inactiveId],
        );
        expect(r.error).not.toBeNull();
      });
    });
    it("anon não insere clique", async () => {
      await withClaims("anon", async (c) => {
        expect((await attempt(c, INSERT, [CART_PARENT, IDS.parent])).error).not.toBeNull();
      });
    });
    it("admin NÃO insere/altera/apaga cliques de terceiros", async () => {
      await withClaims("admin", async (c) => {
        expect((await attempt(c, INSERT, [CART_PARENT, IDS.parent])).error).not.toBeNull();
        expect((await attempt(c, INSERT, [CART_PARENT, IDS.admin])).error).not.toBeNull();
        const upd = await attempt(c, "update public.affiliate_clicks set affiliate_applied = true");
        expect(upd.error !== null || upd.rowCount === 0).toBe(true);
        const del = await attempt(c, "delete from public.affiliate_clicks");
        expect(del.error !== null || del.rowCount === 0).toBe(true);
      });
    });
    it("dono não altera nem apaga cliques (registro imutável para o usuário)", async () => {
      await withClaims("parent", async (c) => {
        const upd = await attempt(c, "update public.affiliate_clicks set affiliate_applied = true");
        expect(upd.error !== null || upd.rowCount === 0).toBe(true);
        const del = await attempt(c, "delete from public.affiliate_clicks");
        expect(del.error !== null || del.rowCount === 0).toBe(true);
      });
    });
    it("clique some com o carrinho (cascata)", async () => {
      await withSuperuser(async (c) => {
        await c.query("begin");
        try {
          await c.query("delete from public.carts where id = $1", [CART_PARENT]);
          expect((await c.query("select 1 from public.affiliate_clicks where cart_id = $1", [CART_PARENT])).rowCount).toBe(0);
        } finally {
          await c.query("rollback");
        }
      });
    });
    it("recusa target_url que não seja https", async () => {
      await inTx(async (c) => {
        const r = await attempt(
          c,
          `insert into public.affiliate_clicks (cart_id, retailer_id, profile_id, affiliate_applied, target_url)
           select $1, id, $2, false, 'javascript:alert(1)' from public.retailers where slug = 'kalunga'`,
          [CART_PARENT, IDS.parent],
        );
        expect(r.error).not.toBeNull();
      });
    });
  });
});
