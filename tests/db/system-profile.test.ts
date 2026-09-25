import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStatusEnv } from "../helpers/local-api";
import { attempt, inTx, withClaims, withSuperuser } from "./helpers";
import { SYSTEM_ID } from "./integration-fixtures";

const MIGRATION = readFileSync(resolve(process.cwd(), "supabase/migrations/0601_integration.sql"), "utf8");

function localEnv(): Record<string, string> {
  return parseStatusEnv(execFileSync("node", ["scripts/supa.mjs", "status", "-o", "env"], { encoding: "utf8" }));
}

describe("0601: perfil técnico system", () => {
  it("existe em auth.users com o UUID fixo, sem senha, sem identidade, banido e com e-mail reservado", async () => {
    await withSuperuser(async (c) => {
      const u = (await c.query("select email, encrypted_password, banned_until::text as banned, raw_app_meta_data from auth.users where id = $1", [SYSTEM_ID])).rows[0];
      expect(u.email).toBe("system@listacerta.invalid");
      expect(u.encrypted_password ?? "").toBe("");
      expect(u.banned).toBe("infinity");
      expect(u.raw_app_meta_data).toMatchObject({ provider: "system" });
      expect((await c.query("select count(*)::int as n from auth.identities where user_id = $1", [SYSTEM_ID])).rows[0].n).toBe(0);
      expect((await c.query("select role::text as r from public.profiles where id = $1", [SYSTEM_ID])).rows[0].r).toBe("system");
    });
  });

  it("system_profile_id() devolve o UUID; anon e authenticated não executam", async () => {
    await withClaims("system", async (c) => {
      expect((await c.query("select public.system_profile_id() as id")).rows[0].id).toBe(SYSTEM_ID);
    });
    for (const who of ["anon", "parent"] as const) {
      await withClaims(who, async (c) => {
        expect((await attempt(c, "select public.system_profile_id()")).code).toBe("42501");
      });
    }
  });

  it("a criação é idempotente (on conflict) e o papel nasce de uma promoção explícita", () => {
    expect(MIGRATION).toMatch(/insert into auth\.users[\s\S]*on conflict \(id\) do nothing/);
    expect(MIGRATION).toMatch(/update public\.profiles set role = 'system'/);
  });

  it("não aparece como usuário comum: aceitar uma sessão exigiria senha ou OTP, e ambos são recusados pelo GoTrue local", async () => {
    const env = localEnv();
    const api = env.API_URL;
    const key = env.PUBLISHABLE_KEY || env.ANON_KEY;
    expect(api).toBeTruthy();
    for (const password of ["", "system", "senha-qualquer-123", "00000000-0000-4000-8000-00000000c0de"]) {
      const res = await fetch(`${api}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: key!, "content-type": "application/json" },
        body: JSON.stringify({ email: "system@listacerta.invalid", password: password || "x" }),
      });
      expect(res.ok).toBe(false);
    }
    await fetch(`${api}/auth/v1/otp`, {
      method: "POST",
      headers: { apikey: key!, "content-type": "application/json" },
      body: JSON.stringify({ email: "system@listacerta.invalid", create_user: false }),
    });
    await withSuperuser(async (c) => {
      const tokens = await c.query("select count(*)::int as n from auth.one_time_tokens where user_id = $1", [SYSTEM_ID]);
      expect(tokens.rows[0].n).toBe(0);
    });
    // nenhuma sessão nasce da tentativa
    await inTx(async (c) => {
      expect((await c.query("select count(*)::int as n from auth.sessions where user_id = $1", [SYSTEM_ID])).rows[0].n).toBe(0);
    });
  });
});
