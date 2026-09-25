import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, cleanupUsers, IDS, seedUsers, withClaims, withSuperuser, type Identity } from "./helpers";

const PROFILE_IDENTITIES = ["parent", "school_member", "admin", "stationery_member", "system"] as const;

async function roleOf(id: string): Promise<string | undefined> {
  return withSuperuser(async (c) => {
    const r = await c.query<{ role: string }>("select role from public.profiles where id = $1", [id]);
    return r.rows[0]?.role;
  });
}

describe("auth_role()", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  for (const who of PROFILE_IDENTITIES) {
    it(`retorna ${who} para a identidade ${who}`, async () => {
      await withClaims(who, async (c) => {
        const r = await c.query("select public.auth_role()::text as role");
        expect(r.rows[0]?.role).toBe(who);
      });
    });
  }

  for (const who of ["anon", "orphan"] as const) {
    it(`retorna NULL para ${who}`, async () => {
      await withClaims(who, async (c) => {
        const r = await c.query("select public.auth_role()::text as role");
        expect(r.rows[0]?.role).toBeNull();
      });
    });
  }

  it("é SECURITY DEFINER com search_path vazio e estável", async () => {
    const row = await withSuperuser(async (c) => {
      const r = await c.query<{ prosecdef: boolean; provolatile: string; proconfig: string[] | null }>(
        "select prosecdef, provolatile, proconfig from pg_proc where proname = 'auth_role' and pronamespace = 'public'::regnamespace",
      );
      return r.rows[0];
    });
    expect(row?.prosecdef).toBe(true);
    expect(row?.provolatile).toBe("s");
    expect(row?.proconfig?.some((x) => /^search_path=("")?$/.test(x))).toBe(true);
  });

  it("todas as funções SECURITY DEFINER do schema public fixam search_path vazio", async () => {
    const bad = await withSuperuser(async (c) => {
      const r = await c.query<{ proname: string }>(
        `select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
           and not coalesce(array_to_string(proconfig, ',') in ('search_path=""', 'search_path='), false)`,
      );
      return r.rows;
    });
    expect(bad).toEqual([]);
  });

  it("um JWT com role authenticated e sub de usuário sem profile não ganha papel", async () => {
    await withClaims("orphan", async (c) => {
      const r = await c.query("select public.auth_role()::text as role");
      expect(r.rows[0]?.role).toBeNull();
    });
  });
});

describe("RLS profiles", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  for (const who of ["parent", "school_member", "stationery_member"] as const) {
    it(`${who} lê só a própria linha`, async () => {
      await withClaims(who, async (c) => {
        const r = await c.query<{ id: string }>("select id from public.profiles");
        expect(r.rows).toEqual([{ id: IDS[who] }]);
      });
    });
  }

  for (const who of ["admin", "system"] as const) {
    it(`${who} lê todas as linhas`, async () => {
      await withClaims(who, async (c) => {
        const r = await c.query("select id from public.profiles where id = any($1::uuid[])", [
          PROFILE_IDENTITIES.map((k) => IDS[k]),
        ]);
        expect(r.rowCount).toBe(PROFILE_IDENTITIES.length);
      });
    });
  }

  for (const who of ["orphan", "anon"] as const) {
    it(`${who} não lê nada`, async () => {
      await withClaims(who, async (c) => {
        const r = await attempt(c, "select id from public.profiles");
        expect(r.rows).toEqual([]);
      });
    });
  }

  it("parent não consegue promover a si mesmo a admin", async () => {
    await withClaims("parent", async (c) => {
      const r = await attempt(c, "update public.profiles set role = 'admin' where id = $1", [IDS.parent]);
      expect(r.error !== null || r.rowCount === 0).toBe(true);
    });
    expect(await roleOf(IDS.parent)).toBe("parent");
  });

  for (const who of ["school_member", "stationery_member"] as const) {
    it(`${who} não muda o próprio role`, async () => {
      await withClaims(who, async (c) => {
        const r = await attempt(c, "update public.profiles set role = 'parent' where id = $1", [IDS[who]]);
        expect(r.error !== null || r.rowCount === 0).toBe(true);
      });
      expect(await roleOf(IDS[who])).toBe(who);
    });
  }

  it("parent não muda o role nem trocando o id", async () => {
    await withClaims("parent", async (c) => {
      const r = await attempt(c, "update public.profiles set id = $2 where id = $1", [IDS.parent, IDS.spare]);
      expect(r.error !== null || r.rowCount === 0).toBe(true);
    });
  });

  it("parent atualiza o próprio display_name", async () => {
    await withClaims("parent", async (c) => {
      const r = await c.query(
        "update public.profiles set display_name = 'Novo Nome' where id = $1 returning display_name",
        [IDS.parent],
      );
      expect(r.rows).toEqual([{ display_name: "Novo Nome" }]);
    });
  });

  it("parent não atualiza o perfil de outro usuário", async () => {
    await withClaims("parent", async (c) => {
      const r = await attempt(c, "update public.profiles set display_name = 'x' where id = $1", [IDS.admin]);
      expect(r.error !== null || r.rowCount === 0).toBe(true);
    });
  });

  it("admin muda o role de um usuário comum", async () => {
    await withClaims("admin", async (c) => {
      const r = await c.query("update public.profiles set role = 'school_member' where id = $1", [IDS.parent]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("admin não concede nem retira o papel system", async () => {
    await withClaims("admin", async (c) => {
      const grant = await attempt(c, "update public.profiles set role = 'system' where id = $1", [IDS.parent]);
      expect(grant.error !== null || grant.rowCount === 0).toBe(true);
      const revoke = await attempt(c, "update public.profiles set role = 'parent' where id = $1", [IDS.system]);
      expect(revoke.error !== null || revoke.rowCount === 0).toBe(true);
    });
    expect(await roleOf(IDS.parent)).toBe("parent");
    expect(await roleOf(IDS.system)).toBe("system");
  });

  it("system muda qualquer role, inclusive para system", async () => {
    await withClaims("system", async (c) => {
      const r = await c.query("update public.profiles set role = 'system' where id = $1", [IDS.parent]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("INSERT: system e admin criam profile; admin não cria system", async () => {
    await withClaims("system", async (c) => {
      const r = await c.query("insert into public.profiles (id, role) values ($1, 'parent')", [IDS.spare]);
      expect(r.rowCount).toBe(1);
    });
    await withClaims("admin", async (c) => {
      const r = await c.query("insert into public.profiles (id, role) values ($1, 'parent')", [IDS.spare]);
      expect(r.rowCount).toBe(1);
    });
    await withClaims("admin", async (c) => {
      const r = await attempt(c, "insert into public.profiles (id, role) values ($1, 'system')", [IDS.spare]);
      expect(r.error).not.toBeNull();
    });
  });

  for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan"] as const satisfies Identity[]) {
    it(`INSERT: ${who} não cria profile (nem para si com papel de admin)`, async () => {
      await withClaims(who, async (c) => {
        const id = who === "orphan" ? IDS.orphan : IDS.spare;
        const r = await attempt(c, "insert into public.profiles (id, role) values ($1, 'admin')", [id]);
        expect(r.error).not.toBeNull();
        const r2 = await attempt(c, "insert into public.profiles (id, role) values ($1, 'parent')", [id]);
        expect(r2.error).not.toBeNull();
      });
    });
  }

  it("DELETE: só system apaga profile", async () => {
    for (const who of ["anon", "parent", "school_member", "stationery_member", "orphan", "admin"] as const) {
      await withClaims(who, async (c) => {
        const r = await attempt(c, "delete from public.profiles where id = $1", [IDS.parent]);
        expect(r.error !== null || r.rowCount === 0).toBe(true);
      });
    }
    expect(await roleOf(IDS.parent)).toBe("parent");
    await withClaims("system", async (c) => {
      const r = await c.query("delete from public.profiles where id = $1", [IDS.parent]);
      expect(r.rowCount).toBe(1);
    });
  });
});
