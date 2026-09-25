import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

const READERS_ENABLED_ONLY: Identity[] = ["anon", "parent", "school_member", "stationery_member", "orphan"];
const READERS_ALL: Identity[] = ["admin", "system"];
const WRITERS_DENIED: Identity[] = ["anon", "parent", "school_member", "stationery_member", "orphan"];
const WRITERS: Identity[] = ["admin", "system"];

// Fixture desabilitada criada fora dos papéis de teste (superuser) e removida no fim.
const INSERT = `insert into public.municipalities (ibge_code, uf, name, is_enabled) values ('3550308', 'SP', 'São Paulo', false)`;

describe("RLS municipalities", () => {
  beforeAll(async () => {
    await seedUsers();
    await withSuperuser((c) =>
      c.query(
        `insert into public.municipalities (ibge_code, uf, name, is_enabled)
         values ('5300108', 'DF', 'Brasília', false) on conflict do nothing`,
      ),
    );
  });
  afterAll(async () => {
    await withSuperuser((c) => c.query("delete from public.municipalities where ibge_code = '5300108'"));
    await cleanupUsers();
  });

  for (const who of READERS_ENABLED_ONLY) {
    it(`${who} lê apenas municípios habilitados`, async () => {
      await withClaims(who, async (c) => {
        const r = await attempt(c, "select ibge_code, is_enabled from public.municipalities");
        expect(r.error).toBeNull();
        expect(r.rows.length).toBeGreaterThan(0);
        expect(r.rows.map((x) => x.ibge_code)).not.toContain("5300108");
        expect(r.rows.every((x) => x.is_enabled === true)).toBe(true);
      });
    });
  }

  for (const who of READERS_ALL) {
    it(`${who} lê também municípios desabilitados`, async () => {
      await withClaims(who, async (c) => {
        const r = await c.query("select is_enabled from public.municipalities");
        expect(r.rows.some((x) => x.is_enabled === false)).toBe(true);
        expect(r.rows.some((x) => x.is_enabled === true)).toBe(true);
      });
    });
  }

  for (const who of WRITERS_DENIED) {
    it(`${who} não escreve em municipalities`, async () => {
      await withClaims(who, async (c) => {
        const ins = await attempt(c, INSERT);
        expect(ins.error).not.toBeNull();
        const upd = await attempt(c, "update public.municipalities set is_enabled = true");
        expect(upd.error !== null || upd.rowCount === 0).toBe(true);
        const del = await attempt(c, "delete from public.municipalities");
        expect(del.error !== null || del.rowCount === 0).toBe(true);
      });
      // Nada mudou: Cuiabá segue sendo o único habilitado e existente.
      await withClaims("admin", async (c) => {
        const r = await c.query("select ibge_code from public.municipalities where is_enabled");
        expect(r.rows).toEqual([{ ibge_code: "5103403" }]);
        const all = await c.query("select ibge_code from public.municipalities order by 1");
        expect(all.rows).toEqual([{ ibge_code: "5103403" }, { ibge_code: "5300108" }]);
      });
    });
  }

  for (const who of WRITERS) {
    it(`${who} insere, atualiza e apaga municípios`, async () => {
      await withClaims(who, async (c) => {
        await c.query(INSERT);
        const upd = await c.query(
          "update public.municipalities set is_enabled = true where ibge_code = '3550308'",
        );
        expect(upd.rowCount).toBe(1);
        const del = await c.query("delete from public.municipalities where ibge_code = '3550308'");
        expect(del.rowCount).toBe(1);
      });
    });
  }

  it("with check impede admin de inserir código IBGE inválido", async () => {
    await withClaims("admin", async (c) => {
      const r = await attempt(
        c,
        "insert into public.municipalities (ibge_code, uf, name) values ('abc', 'MT', 'X')",
      );
      expect(r.error).not.toBeNull();
    });
  });
});
