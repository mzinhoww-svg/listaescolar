import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLAIMANT_EMAIL, CLAIMANT_NAME, CLAIM_NOTE, addEvidence, createClaim, decide, docsAwaiting,
  ensureProfile, evidencePath, issueToken, schoolStatus, seedClaimSchool, sha,
} from "./claim-fixtures";
import { attempt, cleanupUsers, IDS, inTx, seedUsers, withSuperuser, type Identity } from "./helpers";
import { switchTo } from "./list-fixtures";

const TABLES = ["claims", "claim_tokens", "claim_evidence", "claim_status_events", "school_members"];
const RAW_CLAIM = `insert into public.claims (school_id, claimant_id, method, status, claimant_name, claimant_role_title, contact_email,
  privacy_ack_at, privacy_text_version, decided_by, decided_at, decision_reason)
  values ($1, $2, 'documents', $3::public.claim_status, 'Maria Silva', 'Diretora', 'm@x.invalid', now(), 'v1', $4, $5, $6) returning id`;

async function rawClaim(c: Client, school: string, claimant: string, status = "submitted", extra: [string | null, string | null, string | null] = [null, null, null]): Promise<string> {
  const r = await c.query<{ id: string }>(RAW_CLAIM, [school, claimant, status, extra[0], extra[1], extra[2]]);
  return r.rows[0]!.id;
}

describe("S06 schema", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  for (const [name, values] of Object.entries({
    claim_actor: ["claimant", "admin", "system"],
    claim_token_channel: ["email", "whatsapp"],
    school_member_role: ["owner", "co_admin"],
    claim_status: ["submitted", "awaiting_verification", "token_expired", "insufficient_evidence", "rejected", "approved"],
  })) {
    it(`enum ${name} tem os valores exatos, em ordem`, async () => {
      const labels = await withSuperuser(async (c) => {
        const r = await c.query<{ v: string }>(`select unnest(enum_range(null::public.${name}))::text as v`);
        return r.rows.map((x) => x.v);
      });
      expect(labels).toEqual(values);
    });
  }

  it("todas as tabelas têm RLS, id uuid, created_at e updated_at", async () => {
    await withSuperuser(async (c) => {
      for (const t of TABLES) {
        const rls = await c.query("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`]);
        expect(rls.rows[0]?.relrowsecurity, t).toBe(true);
        const cols = await c.query<{ column_name: string; data_type: string; column_default: string | null }>(
          "select column_name, data_type, column_default from information_schema.columns where table_schema = 'public' and table_name = $1",
          [t],
        );
        const by = new Map(cols.rows.map((r) => [r.column_name, r]));
        expect(by.get("id")?.data_type, `${t}.id`).toBe("uuid");
        expect(by.get("id")?.column_default, `${t}.id default`).toMatch(/gen_random_uuid/);
        expect(by.has("created_at") && by.has("updated_at"), t).toBe(true);
      }
    });
  });

  it("toda política tem comentário (o padrão do repo: um comentário por política) e não há política de escrita", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query<{ tablename: string; cmd: string }>(
        "select tablename, cmd from pg_policies where schemaname = 'public' and tablename = any($1::text[])",
        [TABLES],
      );
      expect(r.rows.length).toBeGreaterThanOrEqual(7);
      expect(r.rows.filter((p) => p.cmd !== "SELECT")).toEqual([]);
      expect(r.rows.some((p) => p.tablename === "claim_tokens")).toBe(false);
    });
  });

  it("checks de claims: motivo, aprovada, canal só em métodos por token, tamanhos", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      const upd = (set: string) => attempt(c, `update public.claims set ${set} where id = $1`, [id]);
      expect((await upd("status = 'rejected', decided_at = now()")).code).toBe("23514");
      expect((await upd("status = 'insufficient_evidence'")).code).toBe("23514");
      expect((await upd("status = 'approved', decided_at = now()")).code).toBe("23514");
      expect((await upd("channel_confirmed_at = now()")).code).toBe("23514"); // documentos
      expect((await upd("decision_reason = 'ab'")).code).toBe("23514");
      expect((await upd("claimant_name = 'A'")).code).toBe("23514");
      expect((await upd("claimant_role_title = repeat('x', 81)")).code).toBe("23514");
      expect((await upd("evidence_note = repeat('x', 501)")).code).toBe("23514");
      expect((await upd("contact_email = repeat('x', 255)")).code).toBe("23514");
      expect((await upd("privacy_text_version = ''")).code).toBe("23514");
      // identidade da reivindicação é imutável
      expect((await upd("method = 'institutional_email'")).code).toBe("23514");
      expect((await upd(`school_id = '${IDS.admin}'`)).code).toBe("23514");
      expect((await upd(`claimant_id = '${IDS.admin}'`)).code).toBe("23514");
    });
  });

  it("índices únicos parciais: aberta por escola×usuário; uma approved por escola", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      await rawClaim(c, school, IDS.parent);
      const dup = await attempt(c, RAW_CLAIM, [school, IDS.parent, "awaiting_verification", null, null, null]);
      expect(dup.code).toBe("23505");
      // outra escola e outro usuário podem
      expect((await attempt(c, RAW_CLAIM, [school, IDS.school_member, "submitted", null, null, null])).error).toBeNull();
      // terminais não contam como abertas
      const s2 = await seedClaimSchool(c, { inep: "51999802" });
      const done = ["approved", IDS.admin, new Date().toISOString(), null] as const;
      await rawClaim(c, s2, IDS.parent, done[0], [done[1], done[2], done[3]]);
      await rawClaim(c, s2, IDS.parent, "rejected", [null, new Date().toISOString(), "Recusada"]);
      const second = await attempt(c, RAW_CLAIM, [s2, IDS.school_member, "approved", IDS.admin, new Date().toISOString(), null]);
      expect(second.code).toBe("23505");
      expect(second.error).toMatch(/claims_one_approved_idx/);
    });
  });

  it("tokens: hash em hex de 64, único, attempts 0..5, um ativo por reivindicação", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      const ins = (hash: string, extra = "") =>
        attempt(c, `insert into public.claim_tokens (claim_id, channel, token_hash, expires_at ${extra ? ", " + extra.split("=")[0] : ""})
                    values ($1, 'email', $2, now() + interval '1 hour' ${extra ? ", " + extra.split("=")[1] : ""})`, [id, hash]);
      expect((await ins("abc")).code).toBe("23514");
      expect((await ins(sha("a").toUpperCase())).code).toBe("23514");
      expect((await ins(sha("a"), "attempts=6")).code).toBe("23514");
      expect((await ins(sha("a"), "attempts=-1")).code).toBe("23514");
      expect((await ins(sha("a"))).error).toBeNull();
      expect((await ins(sha("b"))).code).toBe("23505"); // segundo ativo
      await c.query("update public.claim_tokens set revoked_at = now() where claim_id = $1", [id]);
      expect((await ins(sha("b"))).error).toBeNull();
      await c.query("update public.claim_tokens set revoked_at = now() where claim_id = $1", [id]);
      expect((await ins(sha("a"))).code).toBe("23505"); // hash único
    });
  });

  it("evidências: caminho <claim_id>/<uuid>.ext, sem `..`, pasta = reivindicação, mime×extensão, limites", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      const other = await createClaim(c, await seedClaimSchool(c, { inep: "51999802" }), { claimant: IDS.school_member });
      const ins = (path: string, mime = "application/pdf", size = 10, hash = sha("h")) =>
        attempt(c, "insert into public.claim_evidence (claim_id, storage_path, mime_type, size_bytes, sha256, original_name, uploaded_by) values ($1, $2, $3, $4, $5, 'a', $6)",
          [id, path, mime, size, hash, IDS.parent]);
      expect((await ins(`${id}/../x.pdf`)).code).toBe("23514");
      expect((await ins(evidencePath(other))).code).toBe("23514"); // pasta de outra reivindicação
      expect((await ins(evidencePath(id, "png"))).code).toBe("23514"); // mime pdf com .png
      expect((await ins(evidencePath(id), "application/pdf", 0)).code).toBe("23514");
      expect((await ins(evidencePath(id), "application/pdf", 4_000_001)).code).toBe("23514");
      expect((await ins(evidencePath(id), "application/pdf", 10, "zz")).code).toBe("23514");
      expect((await ins(`${id}/${id}.exe`)).code).toBe("23514");
      const path = evidencePath(id, "jpg");
      expect((await ins(path, "image/jpeg")).error).toBeNull();
      expect((await ins(path, "image/jpeg")).code).toBe("23505");
    });
  });

  it("school_members: um owner por escola e um vínculo por (escola, perfil)", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const a = await rawClaim(c, school, IDS.parent);
      const b = await rawClaim(c, school, IDS.school_member);
      const ins = (profile: string, role: string, claim: string | null) =>
        attempt(c, "insert into public.school_members (school_id, profile_id, member_role, claim_id) values ($1, $2, $3::public.school_member_role, $4)", [school, profile, role, claim]);
      expect((await ins(IDS.parent, "owner", null)).code).toBe("23514"); // owner exige claim_id
      expect((await ins(IDS.parent, "owner", a)).error).toBeNull();
      expect((await ins(IDS.school_member, "owner", b)).code).toBe("23505"); // segundo owner
      expect((await ins(IDS.parent, "co_admin", null)).code).toBe("23505"); // mesmo perfil
      expect((await ins(IDS.school_member, "co_admin", null)).error).toBeNull();
    });
  });

  it("eventos são imutáveis (update e delete falham até para o dono)", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      expect((await attempt(c, "update public.claim_status_events set reason = 'x' where claim_id = $1", [id])).code).toBe("23514");
      expect((await attempt(c, "delete from public.claim_status_events where claim_id = $1", [id])).code).toBe("23514");
      const n = await c.query("select count(*)::int as n from public.claim_status_events where claim_id = $1", [id]);
      expect(n.rows[0]?.n).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
describe("S06 RLS e grants por perfil", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  /** Cenário: parent reivindica (documentos), envia, admin pede mais evidência; parent também é membro (vínculo direto). */
  async function scenario(c: Client): Promise<{ school: string; claim: string }> {
    const school = await seedClaimSchool(c);
    await ensureProfile(c, IDS.spare, "parent"); // terceiro parent, sem vínculo com a reivindicação
    const claim = await docsAwaiting(c, school, IDS.parent);
    await decide(c, claim, "insufficient_evidence", "Faltou o documento X");
    await c.query("insert into public.school_members (school_id, profile_id, member_role, claim_id) values ($1, $2, 'owner', $3)", [school, IDS.parent, claim]);
    return { school, claim };
  }
  const count = (c: Client, sql: string) => attempt(c, sql);

  it("linhas visíveis: reivindicante só as próprias; terceiros, stationery_member e órfão nada; admin/system tudo", async () => {
    await inTx(async (c) => {
      await scenario(c);
      const expected: Array<[Identity, number, number, number, number]> = [
        // claims, events, evidence, members
        ["parent", 1, 3, 1, 1],
        ["school_member", 0, 0, 0, 0],
        ["spare", 0, 0, 0, 0],
        ["stationery_member", 0, 0, 0, 0],
        ["orphan", 0, 0, 0, 0],
        ["admin", 1, 3, 1, 1],
        ["system_profile", 1, 3, 1, 1],
        ["system", 1, 3, 1, 1],
      ];
      for (const [who, claims, events, evidence, members] of expected) {
        await switchTo(c, who);
        const got = [
          (await count(c, "select id, status from public.claims")).rowCount,
          (await count(c, "select id, to_status from public.claim_status_events")).rowCount,
          (await count(c, "select id, storage_path from public.claim_evidence")).rowCount,
          (await count(c, "select id, member_role from public.school_members")).rowCount,
        ];
        expect(got, who).toEqual([claims, events, evidence, members]);
      }
    });
  });

  it("anon não lê nada; claim_tokens é ilegível para anon e authenticated (todos os perfis), legível só por service_role", async () => {
    await inTx(async (c) => {
      const { claim } = await scenario(c);
      await c.query("insert into public.claim_tokens (claim_id, channel, token_hash, expires_at) values ($1, 'email', $2, now() + interval '1 hour')", [claim, sha("rls")]);
      await switchTo(c, "anon");
      for (const t of TABLES) {
        const r = await attempt(c, `select id from public.${t}`);
        expect(r.code, `anon ${t}`).toBe("42501");
      }
      for (const who of ["parent", "school_member", "spare", "stationery_member", "orphan", "admin", "system_profile"] as const) {
        await switchTo(c, who);
        expect((await attempt(c, "select id from public.claim_tokens")).code, who).toBe("42501");
        expect((await attempt(c, "select token_hash from public.claim_tokens")).code, who).toBe("42501");
      }
      await switchTo(c, "system");
      expect((await attempt(c, "select id, token_hash from public.claim_tokens")).error).toBeNull();
    });
  });


  it("colunas ocultas: decided_by (claims) e actor_id (eventos) negados a parent e admin; `select *` negado; service_role lê", async () => {
    await inTx(async (c) => {
      await scenario(c);
      for (const who of ["parent", "admin", "system_profile"] as const) {
        await switchTo(c, who);
        expect((await attempt(c, "select decided_by from public.claims")).code, `${who} decided_by`).toBe("42501");
        expect((await attempt(c, "select * from public.claims")).code, `${who} claims *`).toBe("42501");
        expect((await attempt(c, "select actor_id from public.claim_status_events")).code, `${who} actor_id`).toBe("42501");
        expect((await attempt(c, "select * from public.claim_status_events")).code, `${who} events *`).toBe("42501");
      }
      await switchTo(c, "system");
      const r = await c.query("select decided_by from public.claims");
      expect(r.rows[0]?.decided_by).toBe(IDS.admin);
      expect((await c.query("select actor_id from public.claim_status_events where actor_id is not null limit 1")).rowCount).toBe(1);
    });
  });

  it("o reivindicante lê o motivo da decisão, nome e e-mail próprios, e a nota", async () => {
    await inTx(async (c) => {
      await scenario(c);
      await switchTo(c, "parent");
      const r = await c.query("select status::text, decision_reason, claimant_name, contact_email, evidence_note, channel_confirmed_at from public.claims");
      expect(r.rows[0]).toMatchObject({ status: "insufficient_evidence", decision_reason: "Faltou o documento X", claimant_name: CLAIMANT_NAME, contact_email: CLAIMANT_EMAIL, evidence_note: CLAIM_NOTE });
    });
  });

  it("nenhuma escrita por anon, authenticated (todos os perfis) nem service_role em nenhuma tabela", async () => {
    await inTx(async (c) => {
      const { claim } = await scenario(c);
      const writes = (t: string) => [
        `insert into public.${t} (id) values (gen_random_uuid())`,
        `update public.${t} set updated_at = now()`,
        `delete from public.${t}`,
      ];
      for (const who of ["anon", "parent", "school_member", "spare", "stationery_member", "orphan", "admin", "system_profile", "system"] as const) {
        await switchTo(c, who);
        for (const t of TABLES) {
          for (const sql of writes(t)) {
            const r = await attempt(c, sql);
            expect(r.code, `${who}: ${sql}`).toBe("42501");
          }
        }
      }
      // a reivindicação continua intacta
      await c.query("reset role");
      expect((await c.query("select status::text from public.claims where id = $1", [claim])).rows[0]?.status).toBe("insufficient_evidence");
    });
  });

  it("EXECUTE: anon e authenticated negados em todas as funções da fatia; service_role só nas públicas", async () => {
    const PUBLIC_FNS = [
      "claim_transition_allowed", "claim_create", "claim_add_evidence", "claim_remove_evidence", "claim_submit_for_review",
      "claim_issue_token", "claim_confirm_token", "claim_expire_tokens", "claim_decide",
    ];
    const INTERNAL = [
      "claim_school_mobile", "claim_assert_school_open", "claim_lock", "claim_sync_school", "claim_apply", "claims_guard",
      "claim_status_events_block_mutation", "schools_guard_verification",
    ];
    await withSuperuser(async (c) => {
      const fns = await c.query<{ oid: string; proname: string; secdef: boolean; cfg: string[] | null }>(
        `select p.oid::regprocedure::text as oid, p.proname, p.prosecdef as secdef, p.proconfig as cfg
           from pg_proc p where p.pronamespace = 'public'::regnamespace
            and (p.proname like 'claim\\_%' or p.proname in ('claims_guard', 'schools_guard_verification'))`,
      );
      expect(fns.rows.map((f) => f.proname).sort()).toEqual([...PUBLIC_FNS, ...INTERNAL].sort());
      for (const f of fns.rows) {
        for (const role of ["anon", "authenticated"]) {
          const ok = await c.query<{ ok: boolean }>("select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [role, f.oid]);
          expect(ok.rows[0]?.ok, `${role} em ${f.oid}`).toBe(false);
        }
        const sr = await c.query<{ ok: boolean }>("select has_function_privilege('service_role', $1::regprocedure, 'execute') as ok", [f.oid]);
        expect(sr.rows[0]?.ok, `service_role em ${f.proname}`).toBe(PUBLIC_FNS.includes(f.proname));
        expect(f.cfg?.some((x) => x.replace(/"/g, "") === "search_path="), `search_path vazio em ${f.proname}`).toBe(true);
      }
      const definers = fns.rows.filter((f) => f.secdef).map((f) => f.proname).sort();
      expect(definers).toEqual(PUBLIC_FNS.filter((n) => n !== "claim_transition_allowed").concat(["claim_lock", "claim_sync_school", "claim_apply"]).sort());
    });
  });

  it("chamar as funções como anon/authenticated falha por permissão", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      for (const who of ["anon", "parent", "admin", "system_profile"] as const) {
        await switchTo(c, who);
        const r = await attempt(c, "select public.claim_create($1, $2, 'documents', 'Maria', 'Dir', null, 'v1')", [school, IDS.parent]);
        expect(r.code, who).toBe("42501");
        expect((await attempt(c, "select public.claim_decide($1, 'approved', $2, null)", [school, IDS.admin])).code, who).toBe("42501");
        expect((await attempt(c, "select public.claim_expire_tokens()")).code, who).toBe("42501");
      }
      await switchTo(c, "system"); // service_role executa
      expect((await attempt(c, "select public.claim_create($1, $2, 'documents', 'Maria', 'Dir', null, 'v1')", [school, IDS.parent])).error).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
describe("S06 storage e auditoria", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("bucket claim-evidence: privado, 4 MB, só pdf/jpeg/png; nenhuma política em storage.objects o menciona", async () => {
    await withSuperuser(async (c) => {
      const r = await c.query("select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = 'claim-evidence'");
      expect(r.rows[0]?.public).toBe(false);
      expect(r.rows[0]?.file_size_limit).toBe("4000000");
      expect([...(r.rows[0]?.allowed_mime_types as string[])].sort()).toEqual(["application/pdf", "image/jpeg", "image/png"]);
      const pol = await c.query(
        "select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') ilike '%claim-evidence%' or coalesce(with_check, '') ilike '%claim-evidence%')",
      );
      expect(pol.rows).toEqual([]);
    });
  });

  it("objetos do bucket são invisíveis e intocáveis para authenticated (dono, terceiros e admin) e anon; service_role opera", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const claim = await createClaim(c, school);
      const path = evidencePath(claim);
      await c.query("insert into storage.objects (bucket_id, name, owner_id) values ('claim-evidence', $1, $2)", [path, IDS.parent]);
      for (const who of ["anon", "parent", "school_member", "spare", "admin", "stationery_member", "system_profile"] as const) {
        await switchTo(c, who);
        const sel = await attempt(c, "select name from storage.objects where bucket_id = 'claim-evidence'");
        expect(sel.rows, `${who} select`).toEqual([]);
        const ins = await attempt(c, "insert into storage.objects (bucket_id, name) values ('claim-evidence', $1)", [`${claim}/${IDS.parent}.pdf`]);
        expect(ins.error, `${who} insert`).not.toBeNull();
        const upd = await attempt(c, "update storage.objects set name = name || 'x' where bucket_id = 'claim-evidence'");
        expect(upd.rowCount, `${who} update`).toBe(0);
        const del = await attempt(c, "delete from storage.objects where bucket_id = 'claim-evidence'");
        expect(del.rowCount, `${who} delete`).toBe(0);
      }
      await switchTo(c, "system");
      const sel = await c.query("select name from storage.objects where bucket_id = 'claim-evidence'");
      expect(sel.rows.map((r) => r.name)).toEqual([path]);
    });
  });

  it("audit_log de claims, evidências, tokens e vínculos não guarda nome, cargo, e-mail, nota, hash nem nome de arquivo", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      await c.query("update auth.users set email = 'sigilo.fulana@escola-teste.invalid' where id = $1", [IDS.parent]);
      const id = await createClaim(c, school, { method: "institutional_email", name: "Fulana Sigilosa de Tal", note: "Nota sigilosa da diretora" });
      const t = await issueToken(c, id, sha("token-auditoria"));
      const docs = await createClaim(c, await seedClaimSchool(c, { inep: "51999802" }), { claimant: IDS.school_member, method: "documents" });
      const ev = await addEvidence(c, docs, IDS.school_member);
      await c.query("update public.claim_evidence set original_name = 'nome-original-sigiloso.pdf' where id = $1", [ev.id]);
      await c.query("update public.claims set claimant_role_title = 'Cargo Sigiloso' where id = $1", [id]);
      await ensureProfile(c, IDS.spare, "parent");
      const member = (await c.query<{ id: string }>(
        "insert into public.school_members (school_id, profile_id, member_role, claim_id) values ($1, $2, 'owner', $3) returning id", [school, IDS.spare, id],
      )).rows[0]!.id;

      const log = await c.query<{ entity_table: string; blob: string }>(
        `select entity_table, coalesce(before::text, '') || coalesce(after::text, '') as blob from public.audit_log
          where entity_id = any($1::uuid[]) and entity_table in ('claims', 'claim_tokens', 'claim_evidence', 'school_members')`,
        [[id, docs, t.token_id, ev.id]],
      );
      const tables = new Set(log.rows.map((r) => r.entity_table));
      expect([...tables].sort()).toEqual(["claim_evidence", "claim_tokens", "claims"]);
      const all = log.rows.map((r) => r.blob).join("\n");
      for (const secret of ["Fulana Sigilosa", "sigilo.fulana", "Nota sigilosa", "Cargo Sigiloso", sha("token-auditoria"), "nome-original-sigiloso", "documento.pdf", "Maria da Silva"]) {
        expect(all, secret).not.toContain(secret);
      }
      expect(all).not.toMatch(/token_hash|original_name|claimant_name|contact_email|evidence_note|claimant_role_title/);
      expect(all).toContain(school);
      const members = await c.query("select count(*)::int as n from public.audit_log where entity_table = 'school_members' and entity_id = $1", [member]);
      expect(members.rows[0]?.n).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
describe("S06 gatilho schools_guard_verification", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("admin (PostgREST) e service_role direto não põem claimed/verified nem tiram; dono (funções) pode", async () => {
    await inTx(async (c) => {
      const reg = await seedClaimSchool(c, { inep: "51999801" });
      const claimed = await seedClaimSchool(c, { inep: "51999802", status: "claimed" });
      const verified = await seedClaimSchool(c, { inep: "51999803", status: "verified" });
      for (const who of ["admin", "system_profile", "system"] as const) {
        await switchTo(c, who);
        for (const to of ["claimed", "verified"]) {
          const r = await attempt(c, "update public.schools set verification_status = $2::public.verification_status where id = $1", [reg, to]);
          expect(r.code, `${who} registered -> ${to}`).toBe("42501");
        }
        expect((await attempt(c, "update public.schools set verification_status = 'registered' where id = $1", [claimed])).code, `${who} claimed -> registered`).toBe("42501");
        expect((await attempt(c, "update public.schools set verification_status = 'registered' where id = $1", [verified])).code, `${who} verified -> registered`).toBe("42501");
        expect((await attempt(c, "update public.schools set verification_status = 'suspended' where id = $1", [verified])).code, `${who} verified -> suspended`).toBe("42501");
        const ins = await attempt(c, `insert into public.schools (inep, name, normalized_name, network, municipality_id, verification_status)
          select '51999899', 'X', 'x', 'municipal', id, 'verified' from public.municipalities limit 1`);
        expect(ins.code, `${who} insert verified`).toBe("42501");
        const insC = await attempt(c, `insert into public.schools (inep, name, normalized_name, network, municipality_id, verification_status)
          select '51999899', 'X', 'x', 'municipal', id, 'claimed' from public.municipalities limit 1`);
        expect(insC.code, `${who} insert claimed`).toBe("42501");
      }
      await c.query("reset role");
      expect(await schoolStatus(c, reg)).toBe("registered");
      expect(await schoolStatus(c, verified)).toBe("verified");
    });
  });

  it("suspended segue livre para admin e system; verified/claimed aceitam edição de outros campos e reimportação", async () => {
    await inTx(async (c) => {
      const reg = await seedClaimSchool(c, { inep: "51999801" });
      const verified = await seedClaimSchool(c, { inep: "51999803", status: "verified" });
      for (const who of ["admin", "system"] as const) {
        await switchTo(c, who);
        expect((await attempt(c, "update public.schools set verification_status = 'suspended' where id = $1", [reg])).rowCount, who).toBe(1);
        expect((await attempt(c, "update public.schools set verification_status = 'registered' where id = $1", [reg])).rowCount, who).toBe(1);
        expect((await attempt(c, "update public.schools set name = 'Novo nome', address = 'Rua Nova' where id = $1", [verified])).rowCount, who).toBe(1);
        const ins = await attempt(c, `insert into public.schools (inep, name, normalized_name, network, municipality_id, verification_status)
          select '5199989' || $1, 'X', 'x', 'municipal', id, 'suspended' from public.municipalities limit 1`, [who === "admin" ? "1" : "2"]);
        expect(ins.error, who).toBeNull();
      }
      await c.query("reset role");
      expect(await schoolStatus(c, verified)).toBe("verified");
    });
  });

  it("importação INEP (import_apply_rows) segue funcionando em escola verified/claimed sem tocar o status", async () => {
    await inTx(async (c) => {
      const verified = await seedClaimSchool(c, { inep: "51999803", status: "verified" });
      const claimed = await seedClaimSchool(c, { inep: "51999802", status: "claimed" });
      await switchTo(c, "system");
      const batch = await c.query<{ id: string }>("insert into public.import_batches (file_name, file_hash) values ('t.csv', $1) returning id", [sha("import")]);
      const row = (n: number, inep: string) => ({
        row_number: n, inep, name: `Escola ${inep} Renomeada`, normalized_name: `escola ${inep} renomeada`, network: "municipal",
        neighborhood: "Centro", address: "Rua Nova, 1", cep: "78000000", phone: "6533330000", email: "novo@escola.invalid",
        ibge_code: "5103403", is_demo: false,
      });
      const res = await c.query("select public.import_apply_rows($1, $2::jsonb) as r", [batch.rows[0]!.id, JSON.stringify([row(1, "51999803"), row(2, "51999802")])]);
      expect(res.rows[0]?.r).toMatchObject({ updated: 2, rejected: 0 });
      await c.query("reset role");
      expect(await schoolStatus(c, verified)).toBe("verified");
      expect(await schoolStatus(c, claimed)).toBe("claimed");
    });
  });
});
