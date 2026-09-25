import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildCartOptions } from "@/features/cart/options-engine";
import {
  createCart,
  getActiveRetailerBySlug,
  getCart,
  getPriceSnapshots,
  listActiveRetailers,
  recordClick,
  RepositoryError,
  saveOptionsSnapshot,
} from "@/features/cart/repository";
import { SnapshotRetailerProvider } from "@/features/cart/snapshot-provider";

import { withSuperuser } from "../db/helpers";
import { CADERNO, COLA, NOW } from "./helpers";

// Roda em `pnpm test:db` (Postgres/Supabase local da trilha). As chaves locais vêm de `scripts/supa.mjs env`
// em tempo de execução; nada é gravado em arquivo.
function localEnv(): { url: string; publishable: string; secret: string } {
  const out = execFileSync("node", ["scripts/supa.mjs", "env"], { encoding: "utf8" });
  const get = (name: string): string => {
    const m = new RegExp(`^${name}=(.+)$`, "m").exec(out);
    if (!m?.[1]) throw new Error(`variável ${name} ausente em supa.mjs env`);
    return m[1].trim();
  };
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url))
    throw new Error("repository.test só roda contra Supabase local");
  return {
    url,
    publishable: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secret: get("SUPABASE_SECRET_KEY"),
  };
}

const PASSWORD = "senha-de-teste-local-123";
const SOURCE = "fixture_teste_repo";
const INACTIVE = "loja-inativa-repo";
const LIMIT_KEY = "item-teste-janela-repo";

type Actor = { id: string; client: SupabaseClient };
let env: ReturnType<typeof localEnv>;
let admin: SupabaseClient;
let alice: Actor;
let bob: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `repo-${label}-${Date.now()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const id = created.data.user.id;
  await withSuperuser((c) =>
    c.query(
      `insert into public.profiles (id, role, display_name) values ($1, 'parent', $2) on conflict (id) do nothing`,
      [id, `Teste ${label}`],
    ),
  );
  const client = createClient(env.url, env.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw new Error(`signIn: ${signed.error.message}`);
  return { id, client };
}

beforeAll(async () => {
  env = localEnv();
  admin = createClient(env.url, env.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  await withSuperuser(async (c) => {
    await c.query(
      `insert into public.retailers (slug, name, base_url, search_url_template, is_active)
       values ($1, 'Inativa', 'https://inativa.example.com', 'https://inativa.example.com/s?q={query}', false) on conflict do nothing`,
      [INACTIVE],
    );
    const rows = [
      ["kalunga", COLA.itemKey, 300],
      ["magalu", COLA.itemKey, 280],
      [INACTIVE, COLA.itemKey, 1],
    ] as const;
    // Janela e limite por item: uma linha velha (3 dias) e três recentes de um item só deste teste.
    const windowRows = [
      ["kalunga", LIMIT_KEY, 900, "3 days"],
      ["kalunga", LIMIT_KEY, 30, "3 hours"],
      ["magalu", LIMIT_KEY, 20, "2 hours"],
      ["kalunga", LIMIT_KEY, 10, "1 hour"],
    ] as const;
    for (const [slug, key, cents, age] of windowRows) {
      await c.query(
        `insert into public.price_snapshots (retailer_id, item_key, price_cents, source, checked_at)
         select id, $2, $3, $4, now() - $5::interval from public.retailers where slug = $1`,
        [slug, key, cents, SOURCE, age],
      );
    }
    for (const [slug, key, cents] of rows) {
      await c.query(
        `insert into public.price_snapshots (retailer_id, item_key, price_cents, source, checked_at)
         select id, $2, $3, $4, now() - interval '1 hour' from public.retailers where slug = $1`,
        [slug, key, cents, SOURCE],
      );
    }
  });
});

afterAll(async () => {
  await withSuperuser(async (c) => {
    await c.query(`delete from public.price_snapshots where source = $1`, [SOURCE]);
    await c.query(`delete from public.retailers where slug = $1`, [INACTIVE]);
  });
  for (const actor of [alice, bob]) if (actor) await admin.auth.admin.deleteUser(actor.id);
});

describe("features/cart/repository (Postgres local, RLS)", () => {
  it("cria carrinho com itens e lê de volta", async () => {
    const id = await createCart(alice.client, {
      ownerId: alice.id,
      listId: null,
      items: [
        { name: "Caderno 96 folhas", quantity: 2 },
        { name: "Cola branca", quantity: 1 },
      ],
    });
    const cart = await getCart(alice.client, id);
    expect(cart).toMatchObject({ id, ownerId: alice.id, strategy: "cheapest", isDemo: false });
    // itens do mesmo insert têm o mesmo created_at: a ordem entre eles não é garantida.
    expect(cart?.items.map((i) => [i.name, i.itemKey, i.quantity]).sort()).toEqual([
      ["Caderno 96 folhas", "caderno 96 folhas", 2],
      ["Cola branca", "cola branca", 1],
    ]);
  });

  it("isolamento por RLS: outro usuário não vê, não cria em nome alheio e não registra clique", async () => {
    const id = await createCart(alice.client, {
      ownerId: alice.id,
      listId: null,
      items: [{ name: "Lápis", quantity: 1 }],
    });
    expect(await getCart(bob.client, id)).toBeNull();
    await expect(
      createCart(bob.client, { ownerId: alice.id, listId: null, items: [] }),
    ).rejects.toBeInstanceOf(RepositoryError);
    const kalunga = await getActiveRetailerBySlug(alice.client, "kalunga");
    if (!kalunga) throw new Error("seed sem kalunga");
    await expect(
      recordClick(bob.client, {
        cartId: id,
        retailerId: kalunga.id,
        profileId: bob.id,
        affiliateApplied: false,
        targetUrl: "https://www.kalunga.com.br/busca/x",
      }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it("varejistas: só ativos; slug inativo ou desconhecido → null", async () => {
    const slugs = (await listActiveRetailers(alice.client)).map((r) => r.slug);
    expect(slugs).toEqual(expect.arrayContaining(["amazon", "kalunga", "magalu", "mercadolivre"]));
    expect(slugs).not.toContain(INACTIVE);
    expect(await getActiveRetailerBySlug(alice.client, INACTIVE)).toBeNull();
    expect(await getActiveRetailerBySlug(alice.client, "nao-existe")).toBeNull();
  });

  it("snapshots: lidos com origem e data, sem lojas inativas; alimentam o motor", async () => {
    const rows = await getPriceSnapshots(alice.client, [COLA.itemKey, CADERNO.itemKey]);
    const mine = rows.filter((r) => r.source === SOURCE);
    expect(mine.map((r) => r.retailerSlug).sort()).toEqual(["kalunga", "magalu"]);
    for (const r of mine) expect(r.checkedAt).toBeInstanceOf(Date);
    expect(await getPriceSnapshots(alice.client, [])).toEqual([]);

    const provider = new SnapshotRetailerProvider((keys) => getPriceSnapshots(alice.client, keys));
    const quotes = (await provider.getQuotes([COLA])).filter((x) => x.source === SOURCE);
    const now = new Date(); // o snapshot foi gravado com now() no banco
    const cheapest = buildCartOptions([COLA], quotes, null, now)[0];
    expect(cheapest).toMatchObject({ status: "available", totalCents: 280, stores: ["magalu"] });
  });

  it("snapshots: só dentro da validade (checked_at >= now - validade), no SQL", async () => {
    const rows = await getPriceSnapshots(alice.client, [LIMIT_KEY]);
    expect(rows.map((r) => r.priceCents).sort((a, b) => a - b)).toEqual([10, 20, 30]);
    const wide = await getPriceSnapshots(alice.client, [LIMIT_KEY], {
      maxAgeMs: 4 * 24 * 3_600_000,
    });
    expect(wide.map((r) => r.priceCents).sort((a, b) => a - b)).toEqual([10, 20, 30, 900]);
  });

  it("snapshots: limite por item (as mais recentes), não global", async () => {
    const rows = await getPriceSnapshots(alice.client, [LIMIT_KEY, COLA.itemKey], {
      perItemLimit: 1,
    });
    const mine = rows.filter((r) => r.source === SOURCE);
    expect(mine.filter((r) => r.itemKey === LIMIT_KEY).map((r) => r.priceCents)).toEqual([10]);
    expect(mine.filter((r) => r.itemKey === COLA.itemKey)).toHaveLength(1);
  });

  it("createCart: se o desfazer também falhar, o erro do delete vai junto (não é engolido)", async () => {
    const fake = {
      from(table: string) {
        if (table === "carts") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "00000000-0000-4000-8000-0000000000aa" },
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: { message: "delete negado", code: "42501" } }),
            }),
          };
        }
        return { insert: async () => ({ error: { message: "itens falharam", code: "23514" } }) };
      },
    } as unknown as SupabaseClient;
    const err = await createCart(fake, {
      ownerId: alice.id,
      listId: null,
      items: [{ name: "x", quantity: 1 }],
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RepositoryError);
    expect((err as RepositoryError).message).toContain("itens falharam");
    expect((err as RepositoryError).message).toContain("delete negado");
    expect((err as RepositoryError).code).toBe("23514");
  });

  it("clique: cada clique vira uma linha (duplo clique registra dois); só o dono lê", async () => {
    const id = await createCart(alice.client, {
      ownerId: alice.id,
      listId: null,
      items: [{ name: "Cola branca", quantity: 1 }],
    });
    const amazon = await getActiveRetailerBySlug(alice.client, "amazon");
    if (!amazon) throw new Error("seed sem amazon");
    const click = {
      cartId: id,
      retailerId: amazon.id,
      profileId: alice.id,
      affiliateApplied: true,
      targetUrl: "https://www.amazon.com.br/s?k=cola&tag=t-20",
    };
    const [a, b] = [await recordClick(alice.client, click), await recordClick(alice.client, click)];
    expect(a).not.toBe(b);
    const own = await alice.client.from("affiliate_clicks").select("id").eq("cart_id", id);
    expect(own.data).toHaveLength(2);
    const other = await bob.client.from("affiliate_clicks").select("id").eq("cart_id", id);
    expect(other.data).toEqual([]);
  });

  it("options_snapshot: grava as opções e preserva origem/data", async () => {
    const id = await createCart(alice.client, {
      ownerId: alice.id,
      listId: null,
      items: [{ name: "Cola branca", quantity: 1 }],
    });
    const opts = buildCartOptions([COLA], [], null, NOW);
    await saveOptionsSnapshot(alice.client, id, opts);
    const { data } = await alice.client
      .from("carts")
      .select("options_snapshot")
      .eq("id", id)
      .single();
    expect(Array.isArray(data?.options_snapshot)).toBe(true);
    expect((data?.options_snapshot as unknown[]).length).toBe(4);
  });

  it("falha nos itens não deixa carrinho pela metade", async () => {
    await expect(
      createCart(alice.client, {
        ownerId: alice.id,
        listId: null,
        items: [{ name: "Ruim", quantity: 0 }],
      }),
    ).rejects.toBeInstanceOf(RepositoryError);
    const { data } = await alice.client.from("carts").select("id, cart_items(id)");
    expect((data ?? []).every((c) => Array.isArray(c.cart_items) && c.cart_items.length > 0)).toBe(
      true,
    );
  });
});
