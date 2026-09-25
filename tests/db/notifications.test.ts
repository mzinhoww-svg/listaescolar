// Notificações (S11 · Task 3): tabelas, RLS, validador de params, emissão, entregas, despacho e limpeza.
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attempt, attemptH, cleanupUsers, ensureSchool, IDS, inTx, seedUsers, withClaims, withSuperuser } from "./helpers";
import { asService, asSuper, tx } from "./review-fixtures";

beforeAll(seedUsers);
afterAll(cleanupUsers);

const emit = async (c: Client, o: { to?: string; event?: string; key?: string; params?: unknown; link?: string; demo?: boolean; inApp?: boolean } = {}) =>
  (await c.query("select public.notification_emit($1, $2, $3, $4::jsonb, $5, $6, $7) as id", [o.to ?? IDS.parent, o.event ?? "submission_ready", o.key ?? `k-${randomUUID()}`, JSON.stringify(o.params ?? {}), o.link ?? "/enviar-lista/abc", o.demo ?? false, o.inApp ?? false])).rows[0].id as string | null;
const sub = async (c: Client, profile: string, endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`) =>
  (await c.query("insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1, $2, $3, $4) returning id", [profile, endpoint, "B".repeat(87), "a".repeat(22)])).rows[0].id as string;
const pref = (c: Client, profile: string, event: string, channel: string, enabled = true) =>
  c.query("insert into public.notification_preferences (profile_id, event_type, channel, enabled) values ($1, $2, $3, $4)", [profile, event, channel, enabled]);
const deliveries = async (c: Client, nid: string) => (await c.query("select channel, status, last_error_code from public.notification_deliveries where notification_id = $1 order by channel", [nid])).rows;

describe("notification_params_valid", () => {
  const ok = async (c: Client, p: unknown) => (await c.query("select public.notification_params_valid($1::jsonb) as v", [JSON.stringify(p)])).rows[0].v as boolean;
  it("lista fechada: aceita os cinco campos; recusa chave fora, lead_code inválido, texto longo, aninhado e não objeto", async () => {
    await inTx(async (c) => {
      expect(await ok(c, {})).toBe(true);
      expect(await ok(c, { school_name: "Escola X", grade_label: "4º ano", school_year: 2027, lead_code: "LC-5TJ1", status_code: "approved" })).toBe(true);
      for (const bad of [{ student_name: "Joana" }, { email: "a@b.c" }, { lead_code: "lc-5tj1" }, { lead_code: "LC-UUUU" }, { school_name: "x".repeat(121) }, { grade_label: "y".repeat(61) },
        { school_year: 1999 }, { school_year: "2027" }, { status_code: "texto livre" }, { school_name: { a: 1 } }, { school_name: ["a"] }, [], "x", null]) {
        expect(await ok(c, bad), JSON.stringify(bad)).toBe(false);
      }
    });
  });
});

describe("tabelas, CHECKs e RLS", () => {
  it("notifications: dono lê e marca lida; outro perfil e anon não leem; authenticated não insere nem apaga nem edita outras colunas", async () => {
    await tx(async (c) => {
      const mine = (await emit(c, { to: IDS.parent }))!;
      const theirs = (await emit(c, { to: IDS.school_member }))!;
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.parent })]);
      expect((await c.query("select id from public.notifications")).rows.map((r) => r.id)).toEqual([mine]);
      // nenhuma coluna é editável pela API: marcar como lida é só por notifications_mark_read (grava now())
      expect((await attempt(c, "update public.notifications set read_at = '2000-01-01' where id = $1", [mine])).code).toBe("42501");
      expect((await attempt(c, "update public.notifications set params = '{}'::jsonb where id = $1", [mine])).code).toBe("42501");
      expect(theirs).not.toBe(mine);
      expect((await attempt(c, "update public.notifications set recipient_id = $2 where id = $1", [mine, IDS.admin])).code).toBe("42501");
      expect((await attempt(c, "insert into public.notifications (recipient_id, event_type, event_key, link_path) values ($1, 'submission_ready', 'x', '/a')", [IDS.parent])).code).toBe("42501");
      expect((await attempt(c, "delete from public.notifications where id = $1", [mine])).code).toBe("42501");
    });
    await withClaims("anon", async (c) => {
      expect((await attempt(c, "select 1 from public.notifications")).code).toBe("42501");
    });
  });

  it("CHECKs: evento fora do catálogo, link externo ou com //, params inválidos", async () => {
    await tx(async (c) => {
      const ins = (over: Record<string, string>) => attempt(c, "insert into public.notifications (recipient_id, event_type, event_key, params, link_path) values ($1, $2, $3, $4::jsonb, $5)", [IDS.parent, over.e ?? "submission_ready", over.k ?? randomUUID(), over.p ?? "{}", over.l ?? "/ok"]);
      expect((await ins({ e: "outro" })).code).toBe("23514");
      for (const l of ["https://evil.example/x", "//evil.example", "/a//b", "relativo", "/a b", "/<x>"]) expect((await ins({ l })).code, l).toBe("23514");
      expect((await ins({ p: '{"nome":"x"}' })).code).toBe("23514");
      expect((await ins({})).error).toBeNull();
      const k = randomUUID();
      expect((await ins({ k })).error).toBeNull();
      expect((await ins({ k })).code).toBe("23505"); // event_key único por destinatário
    });
  });

  it("notification_deliveries e notification_settings: invisíveis a authenticated e anon", async () => {
    for (const who of ["parent", "admin", "anon"] as const) {
      await withClaims(who, async (c) => {
        expect((await attempt(c, "select 1 from public.notification_deliveries")).code, who).toBe("42501");
        expect((await attempt(c, "select 1 from public.notification_settings")).code, who).toBe("42501");
        expect((await attempt(c, "select 1 from public.notification_emit_errors")).code, who).toBe("42501");
      });
    }
  });

  it("push_subscriptions: endpoint https ou loopback http; chaves base64url; dono lê/apaga; não cria pela API", async () => {
    await tx(async (c) => {
      const ins = (endpoint: string, p256dh = "B".repeat(87), auth = "a".repeat(22)) => attempt(c, "insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)", [IDS.parent, endpoint, p256dh, auth]);
      for (const bad of ["http://evil.example/x", "https://evil.example/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://[::1]/x", "https://localhost/x", "https://fcm.googleapis.com.evil.example/x", "https://user@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://169.254.169.254/latest", "https://push.apple.com.evil.example/x"]) {
        expect((await ins(bad)).code, bad).toBe("23514");
      }
      for (const good of ["https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/abc", "https://wns2-par02p.notify.windows.com/w/?token=abc"]) expect((await ins(good)).error, good).toBeNull();
      expect((await ins("https://fcm.googleapis.com/fcm/send/1", "não é base64!")).code).toBe("23514");
      expect((await ins("https://fcm.googleapis.com/fcm/send/1")).error).toBeNull();
      expect((await ins("http://127.0.0.1:9999/p")).error).toBeNull();
      expect((await ins("https://fcm.googleapis.com/fcm/send/1")).code).toBe("23505");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.parent })]);
      expect((await c.query("select 1 from public.push_subscriptions")).rowCount).toBe(5);
      expect((await attempt(c, "insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/px2', $2, $3)", [IDS.parent, "B".repeat(87), "a".repeat(22)])).code).toBe("42501");
      expect((await attempt(c, "delete from public.push_subscriptions")).rowCount).toBe(5);
    });
  });

  it("notification_preferences e list_watches: só do dono; watches criadas só pela função (teto de 20)", async () => {
    await tx(async (c) => {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: IDS.parent })]);
      expect((await attempt(c, "insert into public.notification_preferences (profile_id, event_type, channel, enabled) values ($1, 'submission_ready', 'web_push', true)", [IDS.parent])).error).toBeNull();
      expect((await attempt(c, "insert into public.notification_preferences (profile_id, event_type, channel, enabled) values ($1, 'submission_ready', 'in_app', true)", [IDS.parent])).code).toBe("23514");
      expect((await attempt(c, "insert into public.notification_preferences (profile_id, event_type, channel, enabled) values ($1, 'submission_ready', 'email', true)", [IDS.school_member])).code).toBe("42501");
      expect((await attempt(c, "insert into public.list_watches (profile_id, school_id, grade_id, school_year) values ($1, gen_random_uuid(), gen_random_uuid(), 2027)", [IDS.parent])).code).toBe("42501");
    });
    await tx(async (c) => {
      const school = await ensureSchool(c);
      await asService(c);
      const add = async (slug: string, year = 2027) => (await c.query("select public.list_watch_add($1, $2, $3, $4) as r", [IDS.parent, school, slug, year])).rows[0].r as string;
      expect(await add("ef-4")).toBe("added");
      expect(await add("ef-4")).toBe("exists");
      expect(await add("nao-existe")).toBe("grade_unknown");
      const slugs = (await c.query("select slug from public.grades order by sort_order")).rows.map((r) => r.slug as string);
      let n = 1;
      for (const s of slugs) for (const y of [2027, 2028]) if (n < 20 && !(s === "ef-4" && y === 2027)) { await add(s, y); n++; }
      expect(await add("em-3", 2030)).toBe("limit");
      expect((await c.query("select public.list_watch_remove($1, $2, 'ef-4', 2027) as r", [IDS.parent, school])).rows[0].r).toBe(true);
    });
  });
});

describe("notification_emit e entregas", () => {
  it("idempotente por (destinatário, event_key); params inválidos recusados", async () => {
    await tx(async (c) => {
      const key = "k-fixo";
      const a = await emit(c, { key });
      expect(a).not.toBeNull();
      expect(await emit(c, { key })).toBeNull();
      expect((await c.query("select count(*)::int as n from public.notifications where event_key = 'k-fixo'")).rows[0].n).toBe(1);
      expect((await attempt(c, "select public.notification_emit($1, 'submission_ready', 'x', '{\"nome\":\"a\"}'::jsonb, '/a', false, false)", [IDS.parent])).error).not.toBeNull();
    });
  });

  it("entrega web_push só com opt-in do evento E assinatura ativa; e-mail nunca com a flag de banco desligada", async () => {
    await tx(async (c) => {
      expect(await deliveries(c, (await emit(c))!)).toEqual([]); // sem preferência: só a central
      await pref(c, IDS.parent, "submission_ready", "web_push");
      expect(await deliveries(c, (await emit(c))!)).toEqual([]); // opt-in sem assinatura
      const s = await sub(c, IDS.parent);
      expect((await deliveries(c, (await emit(c))!)).map((d) => [d.channel, d.status])).toEqual([["web_push", "queued"]]);
      await c.query("update public.push_subscriptions set revoked_at = now() where id = $1", [s]);
      expect(await deliveries(c, (await emit(c))!)).toEqual([]); // assinatura revogada
      await pref(c, IDS.parent, "submission_ready", "email");
      expect((await deliveries(c, (await emit(c))!)).some((d) => d.channel === "email")).toBe(false); // flag desligada (padrão)
      await c.query("update public.notification_settings set email_enabled = true");
      expect((await deliveries(c, (await emit(c))!)).map((d) => d.channel)).toEqual(["email"]);
      expect((await deliveries(c, (await emit(c, { inApp: true }))!))).toEqual([]); // só in_app
    });
  });

  it("teto de 10 entregas externas por hora e destinatário: o excedente fica skipped/rate_limited (a central mantém)", async () => {
    await tx(async (c) => {
      await pref(c, IDS.parent, "submission_ready", "web_push");
      await sub(c, IDS.parent);
      const out: string[] = [];
      for (let i = 0; i < 12; i++) out.push((await deliveries(c, (await emit(c))!))[0].status as string);
      expect(out.filter((s) => s === "queued")).toHaveLength(10);
      expect(out.filter((s) => s === "skipped")).toHaveLength(2);
      expect((await c.query("select count(*)::int as n from public.notification_deliveries where last_error_code = 'rate_limited'")).rows[0].n).toBe(2);
    });
  });

  it("claim: lease, tentativa, retry exponencial, dead na 5ª, permanent e skipped; o payload de push leva as assinaturas ativas", async () => {
    await tx(async (c) => {
      await pref(c, IDS.parent, "submission_ready", "web_push");
      await sub(c, IDS.parent);
      const nid = (await emit(c))!;
      await asService(c);
      const first = (await c.query("select * from public.notification_claim_deliveries(5) as d")).rows.map((r) => r.d);
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({ channel: "web_push", eventType: "submission_ready", attempts: 1, linkPath: "/enviar-lista/abc" });
      expect(first[0].subscriptions).toHaveLength(1);
      expect((await c.query("select count(*)::int as n from public.notification_claim_deliveries(5)")).rows[0].n).toBe(0); // lease
      const id = first[0].id as string;
      let lease = first[0].leaseId as string;
      const mark = (o: string, code = "push_5xx") => c.query("select public.notification_mark_delivery($1, $2, $3, $4, null) as r", [id, lease, o, code]);
      await mark("transient");
      await asSuper(c);
      let d = (await c.query("select status, attempts, next_attempt_at > now() as later from public.notification_deliveries where notification_id = $1", [nid])).rows[0];
      expect(d).toMatchObject({ status: "failed", attempts: 1, later: true });
      for (let i = 2; i <= 5; i++) {
        await c.query("update public.notification_deliveries set next_attempt_at = now() - interval '1 second', locked_until = null where notification_id = $1", [nid]);
        await asService(c);
        lease = (await c.query("select d->>'leaseId' as l from public.notification_claim_deliveries(5) as d")).rows[0].l as string;
        expect(lease).toBeTruthy();
        await mark("transient");
        await asSuper(c);
      }
      d = (await c.query("select status, attempts from public.notification_deliveries where notification_id = $1", [nid])).rows[0];
      expect(d).toMatchObject({ status: "dead", attempts: 5 });
      expect((await c.query("select last_error_code from public.notification_deliveries where notification_id = $1", [nid])).rows[0].last_error_code).toBe("push_5xx");
    });
  });

  it("mark_delivery: sent, permanent -> dead, skipped, código inválido recusado e revogação da assinatura", async () => {
    await tx(async (c) => {
      await pref(c, IDS.parent, "submission_ready", "web_push");
      const s = await sub(c, IDS.parent);
      const run = async (outcome: string, revoke: string[] | null = null) => {
        const nid = (await emit(c))!;
        await asService(c);
        const d = (await c.query("select * from public.notification_claim_deliveries(1) as d")).rows[0].d;
        const r = await attempt(c, "select public.notification_mark_delivery($1, $2, $3, $4, $5)", [d.id, d.leaseId, outcome, outcome === "sent" ? null : "code_x", revoke]);
        await asSuper(c);
        return { r, status: (await c.query("select status from public.notification_deliveries where notification_id = $1", [nid])).rows[0].status as string };
      };
      expect((await run("sent")).status).toBe("sent");
      expect((await run("permanent")).status).toBe("dead");
      expect((await run("skipped")).status).toBe("skipped");
      await run("permanent", [s]);
      expect((await c.query("select revoked_at is not null as r from public.push_subscriptions where id = $1", [s])).rows[0].r).toBe(true);
      await asService(c);
      expect((await attempt(c, "select public.notification_mark_delivery(gen_random_uuid(), gen_random_uuid(), 'sent', 'Erro Livre com espaço', null)")).code).toBe("22023");
    });
  });

  it("claim concorrente (duas conexões): cada entrega vai a um só despachante", async () => {
    const ids: string[] = [];
    await withSuperuser(async (c) => {
      await pref(c, IDS.parent, "submission_ready", "web_push").catch(() => undefined);
      await c.query("insert into public.notification_preferences (profile_id, event_type, channel, enabled) values ($1, 'submission_ready', 'web_push', true) on conflict do nothing", [IDS.parent]);
      await sub(c, IDS.parent);
      for (let i = 0; i < 6; i++) ids.push((await emit(c, { key: `conc-${randomUUID()}` }))!);
    });
    const claim = () => withSuperuser(async (c) => {
      await c.query("set role service_role");
      return (await c.query("select d->>'id' as id from public.notification_claim_deliveries(3) as d")).rows.map((r) => r.id as string);
    });
    const [a, b] = await Promise.all([claim(), claim()]);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
    expect(a.length + b.length).toBe(6);
    await withSuperuser(async (c) => {
      await c.query("delete from public.notifications where id = any($1::uuid[])", [ids]);
      await c.query("delete from public.push_subscriptions where profile_id = $1", [IDS.parent]);
      await c.query("delete from public.notification_preferences where profile_id = $1", [IDS.parent]);
    });
  });

  it("purge: só notificações LIDAS e antigas; e mark_read por dono (ids ou todas)", async () => {
    await tx(async (c) => {
      const oldRead = (await emit(c))!;
      const oldUnread = (await emit(c))!;
      const recentRead = (await emit(c))!;
      await c.query("update public.notifications set read_at = now() - interval '200 days' where id = $1", [oldRead]);
      await c.query("update public.notifications set created_at = now() - interval '200 days' where id = $1", [oldUnread]);
      await c.query("update public.notifications set read_at = now() where id = $1", [recentRead]);
      await asService(c);
      expect((await c.query("select public.notification_purge_old(180) as n")).rows[0].n).toBe(1);
      const left = (await c.query("select id from public.notifications where id = any($1::uuid[])", [[oldRead, oldUnread, recentRead]])).rows.map((r) => r.id);
      expect(left.sort()).toEqual([oldUnread, recentRead].sort());
      expect((await c.query("select public.notifications_mark_read($1, $2::uuid[]) as n", [IDS.parent, [oldUnread]])).rows[0].n).toBe(1);
      expect((await c.query("select public.notifications_mark_read($1, $2::uuid[]) as n", [IDS.school_member, [recentRead]])).rows[0].n).toBe(0); // de outro dono
      expect((await c.query("select public.notifications_mark_read($1, null) as n", [IDS.parent])).rows[0].n).toBe(0);
    });
  });
});

describe("privilégios das funções", () => {
  it("EXECUTE só para service_role", async () => {
    const fns: [string, string, unknown[]][] = [
      ["notification_emit", "$1, 'submission_ready', 'k', '{}'::jsonb, '/a', false, false", [IDS.parent]],
      ["notification_claim_deliveries", "1", []],
      ["notification_mark_delivery", "gen_random_uuid(), gen_random_uuid(), 'sent', null, null", []],
      ["notification_purge_old", "180", []],
      ["notifications_mark_read", "$1, null", [IDS.parent]],
      ["list_watch_add", "$1, gen_random_uuid(), 'ef-4', 2027", [IDS.parent]],
      ["list_watch_remove", "$1, gen_random_uuid(), 'ef-4', 2027", [IDS.parent]],
      ["push_subscription_upsert", "$1, 'https://fcm.googleapis.com/fcm/send/px1', 'a', 'b'", [IDS.parent]],
    ];
    for (const who of ["anon", "parent", "admin"] as const) {
      await withClaims(who, async (c) => {
        for (const [fn, args, p] of fns) expect((await attempt(c, `select public.${fn}(${args})`, p)).code, `${who} ${fn}`).toBe("42501");
      });
    }
    await withSuperuser(async (c) => {
      const n = (await c.query("select count(*)::int as n from pg_proc where proname like 'notification\\_%' and prosecdef and proconfig is null")).rows[0].n;
      expect(n).toBe(0); // toda SECURITY DEFINER da família tem search_path fixo
    });
  });
});

describe("correções da revisão de segurança (0602)", () => {
  it("lease com dono: marcação de lease antiga ou sem lease é ignorada e não sobrescreve o resultado do dono atual", async () => {
    await tx(async (c) => {
      await pref(c, IDS.parent, "submission_ready", "web_push");
      await sub(c, IDS.parent);
      const nid = (await emit(c))!;
      const did = (await c.query("select id from public.notification_deliveries where notification_id = $1", [nid])).rows[0].id as string;
      const claimMine = async () => {
        await asService(c);
        const rows = (await c.query("select d from public.notification_claim_deliveries(50) as d")).rows.map((r) => r.d);
        await asSuper(c);
        return rows.find((d) => d.id === did);
      };
      const first = await claimMine();
      await c.query("update public.notification_deliveries set locked_until = now() - interval '1 second' where id = $1", [did]);
      const second = await claimMine();
      expect(second.leaseId).not.toBe(first.leaseId);
      await asService(c);
      expect((await c.query("select public.notification_mark_delivery($1, $2, 'sent', null, null) as r", [did, first.leaseId])).rows[0].r).toBe(false);
      expect((await c.query("select public.notification_mark_delivery($1, $2, 'permanent', 'push_4xx', null) as r", [did, null])).rows[0].r).toBe(false);
      await asSuper(c);
      expect((await deliveries(c, nid))[0].status).toBe("sending");
      await asService(c);
      expect((await c.query("select public.notification_mark_delivery($1, $2, 'sent', null, null) as r", [did, second.leaseId])).rows[0].r).toBe(true);
    });
  });

  it("sending vencido com 5 tentativas vira dead no claim (nunca retoma para sempre)", async () => {
    await tx(async (c) => {
      await pref(c, IDS.parent, "submission_ready", "web_push");
      await sub(c, IDS.parent);
      const nid = (await emit(c))!;
      await c.query("update public.notification_deliveries set status = 'sending', attempts = 5, locked_until = now() - interval '1 second', lease_id = gen_random_uuid() where notification_id = $1", [nid]);
      await asService(c);
      expect((await c.query("select count(*)::int as n from public.notification_claim_deliveries(5)")).rows[0].n).toBe(0);
      await asSuper(c);
      expect((await deliveries(c, nid))[0]).toMatchObject({ status: "dead", last_error_code: "lease_expired" });
    });
  });

  it("push_subscription_upsert: teto de 5 ativas por perfil e endpoint de outro perfil recusado (sem transferir nem reativar)", async () => {
    await tx(async (c) => {
      await asService(c);
      const up = (profile: string, n: number | string) => attemptUp(c, profile, `https://fcm.googleapis.com/fcm/send/${n}`);
      for (let i = 0; i < 5; i++) expect((await up(IDS.parent, i)).error).toBeNull();
      expect(await up(IDS.parent, 5)).toMatchObject({ code: "22023", hint: "subscription_limit" });
      expect((await up(IDS.parent, 0)).error).toBeNull(); // o próprio endpoint só atualiza
      expect(await up(IDS.school_member, 0)).toMatchObject({ code: "22023", hint: "endpoint_owned" });
      await asSuper(c);
      expect((await c.query("select profile_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/0'")).rows[0].profile_id).toBe(IDS.parent);
      await c.query("update public.push_subscriptions set revoked_at = now() where endpoint = 'https://fcm.googleapis.com/fcm/send/1'");
      await asService(c);
      expect(await up(IDS.school_member, 1)).toMatchObject({ hint: "endpoint_owned" }); // revogado de outro dono também não é reaproveitado
    });
  });

  it("purge_old também limpa erros de emissão e entregas encerradas com mais de 90 dias", async () => {
    await tx(async (c) => {
      await c.query("insert into public.notification_emit_errors (event_type, sqlstate, created_at) values ('x', '23514', now() - interval '100 days'), ('y', '23514', now())");
      await pref(c, IDS.parent, "submission_ready", "web_push");
      await sub(c, IDS.parent);
      const old = (await emit(c))!;
      const recent = (await emit(c))!;
      await c.query("set local session_replication_role = replica"); // sem o gatilho de updated_at, para envelhecer a linha
      await c.query("update public.notification_deliveries set status = 'dead', updated_at = now() - interval '100 days' where notification_id = $1", [old]);
      await c.query("set local session_replication_role = origin");
      await c.query("update public.notification_deliveries set status = 'dead' where notification_id = $1", [recent]);
      await asService(c);
      await c.query("select public.notification_purge_old(180)");
      await asSuper(c);
      expect((await c.query("select count(*)::int as n from public.notification_emit_errors where event_type in ('x', 'y')")).rows[0].n).toBe(1);
      expect(await deliveries(c, old)).toEqual([]);
      expect(await deliveries(c, recent)).toHaveLength(1);
    });
  });

  it("list_watches: apagar escola ou série leva as inscrições junto (não trava reimportação)", async () => {
    await tx(async (c) => {
      const school = await ensureSchool(c);
      await asService(c);
      await c.query("select public.list_watch_add($1, $2, 'ef-4', 2027)", [IDS.parent, school]);
      await asSuper(c);
      await c.query("delete from public.schools where id = $1", [school]);
      expect((await c.query("select count(*)::int as n from public.list_watches where school_id = $1", [school])).rows[0].n).toBe(0);
    });
  });
});

const attemptUp = (c: Client, profile: string, endpoint: string) =>
  attemptH(c, "select public.push_subscription_upsert($1, $2, $3, $4)", [profile, endpoint, "B".repeat(87), "a".repeat(22)]);
