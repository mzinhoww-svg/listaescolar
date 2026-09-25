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
  it("existe em auth.users com o UUID fixo, sem senha, banido e com e-mail reservado", async () => {
    await withSuperuser(async (c) => {
      const u = (await c.query("select email, encrypted_password, banned_until::text as banned, raw_app_meta_data from auth.users where id = $1", [SYSTEM_ID])).rows[0];
      expect(u.email).toBe("system@listacerta.invalid");
      expect(u.encrypted_password ?? "").toBe("");
      expect(u.banned).toMatch(/^2999-01-01/); // data finita: 'infinity' derruba o listUsers do GoTrue hospedado
      expect(u.raw_app_meta_data).toBeTruthy(); // o GoTrue pode regravar o provider ao receber um pedido de OTP; o usuário segue banido
      // identidade: a migration não cria nenhuma; o GoTrue pode criar a de e-mail ao receber um pedido de OTP (o usuário segue banido)
      expect((await c.query("select count(*)::int as n from auth.identities where user_id = $1 and provider <> 'email'", [SYSTEM_ID])).rows[0].n).toBe(0);
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

  it("o GoTrue local segue saudável com o usuário banido: getUserById e listUsers respondem 200", async () => {
    const env = localEnv();
    const headers = { apikey: env.SECRET_KEY || env.SERVICE_ROLE_KEY!, authorization: `Bearer ${env.SECRET_KEY || env.SERVICE_ROLE_KEY}` };
    const one = await fetch(`${env.API_URL}/auth/v1/admin/users/${SYSTEM_ID}`, { headers });
    expect(one.status).toBe(200);
    expect((await one.json()).email).toBe("system@listacerta.invalid");
    const list = await fetch(`${env.API_URL}/auth/v1/admin/users?per_page=1000`, { headers });
    expect(list.status).toBe(200);
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
      expect([400, 401]).toContain(res.status); // recusa de credencial, não erro 5xx
    }
    await fetch(`${api}/auth/v1/otp`, {
      method: "POST",
      headers: { apikey: key!, "content-type": "application/json" },
      body: JSON.stringify({ email: "system@listacerta.invalid", create_user: false }),
    });
    // Se o GoTrue emitir o código (usuário banido, mas o pedido é aceito), o código NÃO abre sessão: a verificação é recusada.
    const mail = env.MAILPIT_URL || env.INBUCKET_URL;
    const list = (await (await fetch(`${mail}/api/v1/messages`)).json()) as { messages?: { ID: string; To: { Address: string }[] }[] };
    const mine = (list.messages ?? []).filter((m) => m.To.some((t) => t.Address === "system@listacerta.invalid"));
    for (const m of mine) {
      const body = (await (await fetch(`${mail}/api/v1/message/${m.ID}`)).json()) as { Text?: string };
      const code = /\b(\d{6})\b/.exec(body.Text ?? "")?.[1];
      if (!code) continue;
      const res = await fetch(`${api}/auth/v1/verify`, { method: "POST", headers: { apikey: key!, "content-type": "application/json" }, body: JSON.stringify({ type: "email", email: "system@listacerta.invalid", token: code }) });
      expect(res.ok).toBe(false);
    }
    // nenhuma sessão nasce da tentativa
    await inTx(async (c) => {
      expect((await c.query("select count(*)::int as n from auth.sessions where user_id = $1", [SYSTEM_ID])).rows[0].n).toBe(0);
    });
  });
});
