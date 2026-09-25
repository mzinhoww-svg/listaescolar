import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLAIM_ACTORS, CLAIM_ORACLE, CLAIM_STATUSES, addEvidence, createClaim, decide, docsAwaiting, ensureProfile,
  eventsOf, evidencePath, issueToken, schoolStatus, seedClaimSchool, sha, statusOf, submit,
} from "./claim-fixtures";
import { attempt, cleanupUsers, DATABASE_URL, IDS, inTx, seedUsers, withSuperuser } from "./helpers";

const CREATE_SQL = "select public.claim_create($1, $2, $3::public.claim_method, 'Maria Silva', 'Diretora', 'm@x.invalid', null, 'v1')";

describe("S06 matriz de transições (claim_transition_allowed)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("as 108 triplas (estado × estado × ator) batem com o oráculo escrito à mão", async () => {
    await withSuperuser(async (c) => {
      let allowed = 0;
      for (const actor of CLAIM_ACTORS) {
        for (const from of CLAIM_STATUSES) {
          for (const to of CLAIM_STATUSES) {
            const r = await c.query<{ ok: boolean }>(
              "select public.claim_transition_allowed($1::public.claim_status, $2::public.claim_status, $3::public.claim_actor) as ok",
              [from, to, actor],
            );
            const expected = CLAIM_ORACLE[actor].some(([f, t]) => f === from && t === to);
            expect(r.rows[0]?.ok, `${actor}: ${from} -> ${to}`).toBe(expected);
            if (r.rows[0]?.ok) allowed++;
          }
        }
      }
      expect(allowed).toBe(14);
    });
  });

  it("approved e rejected são terminais para todos os atores; mesmo estado nunca é permitido", () => {
    for (const actor of CLAIM_ACTORS) {
      expect(CLAIM_ORACLE[actor].filter(([f]) => f === "approved" || f === "rejected")).toEqual([]);
      expect(CLAIM_ORACLE[actor].filter(([f, t]) => f === t)).toEqual([]);
    }
  });
});

describe("S06 claim_create", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("cria submitted, herda is_demo da escola, grava evento e não mexe no status da escola", async () => {
    await inTx(async (c) => {
      const demo = await seedClaimSchool(c, { inep: "51999801", demo: true });
      const real = await seedClaimSchool(c, { inep: "51999802", demo: false });
      const a = await createClaim(c, demo);
      const b = await createClaim(c, real);
      const r = await c.query("select id, status::text, is_demo, submitted_at, channel_confirmed_at from public.claims where id = any($1::uuid[]) order by is_demo", [[a, b]]);
      expect(r.rows.map((x) => [x.status, x.is_demo, x.submitted_at, x.channel_confirmed_at])).toEqual([
        ["submitted", false, null, null],
        ["submitted", true, null, null],
      ]);
      expect(await eventsOf(c, a)).toEqual(["->submitted:claimant"]);
      expect(await schoolStatus(c, demo)).toBe("registered");
    });
  });

  it("papéis admin, stationery_member, system e sem perfil são recusados; parent e school_member passam", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      for (const who of ["admin", "stationery_member", "system", "orphan"] as const) {
        const r = await attempt(c, CREATE_SQL, [school, IDS[who], "documents"]);
        expect(r.code, who).toBe("42501");
      }
      await ensureProfile(c, IDS.spare, "parent");
      const ok1 = await attempt(c, CREATE_SQL, [school, IDS.parent, "documents"]);
      const ok2 = await attempt(c, CREATE_SQL, [school, IDS.school_member, "documents"]);
      expect([ok1.error, ok2.error]).toEqual([null, null]);
    });
  });

  it("recusa escola verified, suspended, município desabilitado e inexistente", async () => {
    await inTx(async (c) => {
      const cases: Array<[string, Parameters<typeof seedClaimSchool>[1], RegExp]> = [
        ["51999811", { status: "verified" }, /verificada/],
        ["51999812", { status: "suspended" }, /suspensa/],
        ["51999813", { enabled: false }, /município/],
      ];
      for (const [inep, opts, msg] of cases) {
        const school = await seedClaimSchool(c, { inep, ...opts });
        const r = await attempt(c, CREATE_SQL, [school, IDS.parent, "documents"]);
        expect(r.code, inep).toBe("23514");
        expect(r.error, inep).toMatch(msg);
      }
      const missing = await attempt(c, CREATE_SQL, [randomUUID(), IDS.parent, "documents"]);
      expect(missing.code).toBe("P0002");
    });
  });

  it("método sem contato: e-mail sem e-mail, WhatsApp sem celular (fixo, vazio, curto); com 55 e máscara passa", async () => {
    await inTx(async (c) => {
      const noEmail = await seedClaimSchool(c, { inep: "51999821", email: null });
      expect((await attempt(c, CREATE_SQL, [noEmail, IDS.parent, "institutional_email"])).code).toBe("23514");
      expect((await attempt(c, CREATE_SQL, [noEmail, IDS.parent, "documents"])).error).toBeNull();
      const blank = await seedClaimSchool(c, { inep: "51999822", email: "   " });
      expect((await attempt(c, CREATE_SQL, [blank, IDS.parent, "institutional_email"])).code).toBe("23514");
      for (const [i, phone] of [null, "", "6533331234", "(65) 3333-1234", "659999900", "65899990001"].entries()) {
        const school = await seedClaimSchool(c, { inep: `5199983${i}`, phone });
        const r = await attempt(c, CREATE_SQL, [school, IDS.parent, "institutional_whatsapp"]);
        expect(r.code, String(phone)).toBe("23514");
      }
      for (const [i, phone] of ["65999990001", "5565999990001", "+55 (65) 99999-0001"].entries()) {
        const school = await seedClaimSchool(c, { inep: `5199984${i}`, phone });
        const r = await attempt(c, CREATE_SQL, [school, IDS.parent, "institutional_whatsapp"]);
        expect(r.error, phone).toBeNull();
        await decide(c, String(r.rows[0]?.claim_create), "rejected", "Libera a vaga do limite");
      }
    });
  });

  it("uma aberta por escola×usuário; depois de recusada, pode reivindicar de novo", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const first = await createClaim(c, school);
      const dup = await attempt(c, CREATE_SQL, [school, IDS.parent, "documents"]);
      expect(dup.code).toBe("23514");
      expect(dup.error).toMatch(/aberta/);
      await decide(c, first, "rejected", "Sem relação com a escola");
      expect((await attempt(c, CREATE_SQL, [school, IDS.parent, "documents"])).error).toBeNull();
    });
  });

  it("limite de 3 abertas por usuário; recusadas não contam", async () => {
    await inTx(async (c) => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) ids.push(await createClaim(c, await seedClaimSchool(c, { inep: `5199985${i}` })));
      const fourth = await seedClaimSchool(c, { inep: "51999859" });
      const r = await attempt(c, CREATE_SQL, [fourth, IDS.parent, "documents"]);
      expect(r.code).toBe("23514");
      expect(r.error).toMatch(/limite de 3/);
      await decide(c, ids[0]!, "rejected", "Recusada de teste");
      expect((await attempt(c, CREATE_SQL, [fourth, IDS.parent, "documents"])).error).toBeNull();
    });
  });

  it("textos fora dos limites são recusados (nome, cargo, e-mail, nota de 501) e a nota vazia vira nulo", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const bad = [
        ["A", "Diretora", "m@x.invalid", null],
        ["Maria", "D", "m@x.invalid", null],
        ["Maria", "Diretora", "  ", null],
        ["Maria", "Diretora", "m@x.invalid", "x".repeat(501)],
      ] as const;
      for (const [n, t, e, note] of bad) {
        const r = await attempt(c, "select public.claim_create($1, $2, 'documents', $3, $4, $5, $6, 'v1')", [school, IDS.parent, n, t, e, note]);
        expect(r.code, `${n}/${t}/${e}`).toBe("23514");
      }
      const id = await createClaim(c, school, { note: "   " });
      expect((await c.query("select evidence_note from public.claims where id = $1", [id])).rows[0]?.evidence_note).toBeNull();
    });
  });
});

describe("S06 evidências", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("só o dono envia; caminho precisa ter o prefixo da reivindicação e não ter `..`", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      const add = (actor: string, path: string) =>
        attempt(c, "select public.claim_add_evidence($1, $2, $3, 'application/pdf', 10, $4, 'a.pdf')", [id, actor, path, sha(path)]);
      expect((await add(IDS.school_member, evidencePath(id))).code).toBe("42501");
      expect((await add(IDS.admin, evidencePath(id))).code).toBe("42501");
      expect((await add(IDS.parent, evidencePath(randomUUID()))).code).toBe("22023");
      expect((await add(IDS.parent, `${id}/../${randomUUID()}.pdf`)).code).toBe("22023");
      expect((await add(IDS.parent, `${id}/..${randomUUID()}.pdf`)).code).toBe("22023");
      expect((await add(IDS.parent, `${id}/sub/${randomUUID()}.pdf`)).code).toBe("23514"); // formato do check
      expect((await add(IDS.parent, evidencePath(id))).error).toBeNull();
    });
  });

  it("só em submitted (documentos) ou insufficient_evidence (qualquer método); token e estados finais recusam", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const email = await createClaim(c, school, { method: "institutional_email" });
      const r1 = await attempt(c, "select public.claim_add_evidence($1, $2, $3, 'application/pdf', 10, $4, 'a.pdf')", [email, IDS.parent, evidencePath(email), sha("x")]);
      expect(r1.code).toBe("23514");
      await c.query("update public.claims set status = 'rejected', decision_reason = 'teste', decided_at = now() where id = $1", [email]);

      const school2 = await seedClaimSchool(c, { inep: "51999802" });
      const docs = await docsAwaiting(c, school2);
      const r2 = await attempt(c, "select public.claim_add_evidence($1, $2, $3, 'application/pdf', 10, $4, 'a.pdf')", [docs, IDS.parent, evidencePath(docs), sha("y")]);
      expect(r2.code).toBe("23514"); // awaiting_verification
      await decide(c, docs, "insufficient_evidence", "Falta documento");
      expect((await addEvidence(c, docs)).id).toBeTruthy();
    });
  });

  it("limite de 5 por reivindicação; remoção devolve o caminho e libera vaga", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      const list = [];
      for (let i = 0; i < 5; i++) list.push(await addEvidence(c, id, IDS.parent, ["pdf", "jpg", "png"][i % 3]));
      const sixth = await attempt(c, "select public.claim_add_evidence($1, $2, $3, 'application/pdf', 10, $4, 'a.pdf')", [id, IDS.parent, evidencePath(id), sha("z")]);
      expect(sixth.code).toBe("23514");
      expect(sixth.error).toMatch(/limite de 5/);
      const rm = await c.query<{ p: string }>("select public.claim_remove_evidence($1, $2) as p", [list[0]!.id, IDS.parent]);
      expect(rm.rows[0]?.p).toBe(list[0]!.path);
      expect((await c.query("select count(*)::int as n from public.claim_evidence where claim_id = $1", [id])).rows[0]?.n).toBe(4);
      await addEvidence(c, id);
    });
  });

  it("remoção: só o dono, só em estado que aceita evidência; inexistente dá P0002", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      const ev = await addEvidence(c, id);
      const other = await attempt(c, "select public.claim_remove_evidence($1, $2)", [ev.id, IDS.school_member]);
      expect(other.code).toBe("42501");
      await submit(c, id);
      const late = await attempt(c, "select public.claim_remove_evidence($1, $2)", [ev.id, IDS.parent]);
      expect(late.code).toBe("23514");
      expect((await attempt(c, "select public.claim_remove_evidence($1, $2)", [randomUUID(), IDS.parent])).code).toBe("P0002");
    });
  });

  it("formato: mime×extensão, tamanho 0 e 4 000 001, sha256 e nome vazio são recusados pelo banco", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      const p = evidencePath(id, "png");
      const bad: Array<[string, number, string, string]> = [
        ["application/pdf", 10, sha("a"), "a.pdf"], // mime pdf com .png
        ["image/png", 0, sha("a"), "a.png"],
        ["image/png", 4_000_001, sha("a"), "a.png"],
        ["image/png", 10, "ABC", "a.png"],
        ["image/png", 10, sha("a"), "   "],
        ["image/gif", 10, sha("a"), "a.png"],
      ];
      for (const [mime, size, hash, name] of bad) {
        const r = await attempt(c, "select public.claim_add_evidence($1, $2, $3, $4, $5, $6, $7)", [id, IDS.parent, p, mime, size, hash, name]);
        expect(r.code, `${mime}/${size}/${hash}/${name}`).toBe("23514");
      }
      const ok = await attempt(c, "select public.claim_add_evidence($1, $2, $3, 'image/png', 4000000, $4, 'a.png')", [id, IDS.parent, p, sha("a")]);
      expect(ok.error).toBeNull();
    });
  });
});

describe("S06 claim_submit_for_review", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("documentos: sem evidência recusa; com evidência vai a awaiting_verification, grava submitted_at e escola vira claimed", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      expect((await attempt(c, "select public.claim_submit_for_review($1, $2)", [id, IDS.parent])).code).toBe("23514");
      await addEvidence(c, id);
      expect((await attempt(c, "select public.claim_submit_for_review($1, $2)", [id, IDS.school_member])).code).toBe("42501");
      await submit(c, id);
      expect(await statusOf(c, id)).toBe("awaiting_verification");
      expect((await c.query("select submitted_at is not null as ok from public.claims where id = $1", [id])).rows[0]?.ok).toBe(true);
      expect(await schoolStatus(c, school)).toBe("claimed");
      expect(await eventsOf(c, id)).toEqual(["->submitted:claimant", "submitted>awaiting_verification:claimant"]);
      // repetir o envio é par fora da matriz
      expect((await attempt(c, "select public.claim_submit_for_review($1, $2)", [id, IDS.parent])).code).toBe("23514");
    });
  });

  it("método por token não envia por aqui (use claim_issue_token)", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      const r = await attempt(c, "select public.claim_submit_for_review($1, $2)", [id, IDS.parent]);
      expect(r.code).toBe("23514");
      expect(r.error).toMatch(/claim_issue_token/);
    });
  });

  it("reenvio de insufficient_evidence exige novidade: evidência posterior à decisão ou nota alterada", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await docsAwaiting(c, school);
      await decide(c, id, "insufficient_evidence", "Documento ilegível");
      expect(await schoolStatus(c, school)).toBe("claimed");
      const none = await attempt(c, "select public.claim_submit_for_review($1, $2)", [id, IDS.parent]);
      expect(none.code).toBe("23514");
      expect(none.error).toMatch(/novidade|nova/);
      const same = await attempt(c, "select public.claim_submit_for_review($1, $2, $3)", [id, IDS.parent, "Sou a diretora desde 2020, nota interna"]);
      expect(same.code).toBe("23514"); // mesma nota não é novidade
      await addEvidence(c, id);
      await submit(c, id);
      expect(await statusOf(c, id)).toBe("awaiting_verification");

      const id2 = await createClaim(c, await seedClaimSchool(c, { inep: "51999802" }), { method: "institutional_email" });
      await c.query("update public.claims set status = 'insufficient_evidence', decision_reason = 'teste', decided_at = clock_timestamp() where id = $1", [id2]);
      await submit(c, id2, IDS.parent, "Nota nova com mais detalhes");
      expect((await c.query("select status::text, evidence_note from public.claims where id = $1", [id2])).rows[0]).toEqual({
        status: "awaiting_verification",
        evidence_note: "Nota nova com mais detalhes",
      });
    });
  });

  it("token_expired não reenvia por aqui; estados finais recusam", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      await c.query("update public.claims set status = 'token_expired' where id = $1", [id]);
      expect((await attempt(c, "select public.claim_submit_for_review($1, $2)", [id, IDS.parent])).error).toMatch(/novo token/);
      await c.query("update public.claims set status = 'rejected', decision_reason = 'teste', decided_at = now() where id = $1", [id]);
      expect((await attempt(c, "select public.claim_submit_for_review($1, $2)", [id, IDS.parent])).code).toBe("23514");
    });
  });
});

describe("S06 claim_decide", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("não-admin é recusado (parent, school_member, system, stationery_member, órfão); decisão inválida é 22023", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await docsAwaiting(c, school);
      for (const who of ["parent", "school_member", "system", "stationery_member", "orphan"] as const) {
        const r = await attempt(c, "select public.claim_decide($1, 'approved', $2, null)", [id, IDS[who]]);
        expect(r.code, who).toBe("42501");
      }
      expect((await attempt(c, "select public.claim_decide($1, 'token_expired', $2, 'motivo')", [id, IDS.admin])).code).toBe("22023");
      expect((await attempt(c, "select public.claim_decide($1, 'submitted', $2, 'motivo')", [id, IDS.admin])).code).toBe("22023");
      expect(await statusOf(c, id)).toBe("awaiting_verification");
    });
  });

  it("motivo obrigatório (3 a 500) para recusar e pedir evidência; aprovar não exige", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await docsAwaiting(c, school);
      for (const to of ["rejected", "insufficient_evidence"]) {
        for (const reason of [null, "", "  ", "ab", "x".repeat(501)]) {
          const r = await attempt(c, "select public.claim_decide($1, $2::public.claim_status, $3, $4)", [id, to, IDS.admin, reason]);
          expect(r.code, `${to}/${String(reason).length}`).toBe("22023");
        }
      }
      await decide(c, id, "insufficient_evidence", "abc");
      expect((await c.query("select decision_reason, decided_by from public.claims where id = $1", [id])).rows[0]).toEqual({
        decision_reason: "abc",
        decided_by: IDS.admin,
      });
      expect(await schoolStatus(c, school)).toBe("claimed");
    });
  });

  it("aprovar sem evidência (documentos) é recusado; pares fora da matriz dão 23514", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school);
      // submitted -> approved não existe na matriz
      expect((await attempt(c, "select public.claim_decide($1, 'approved', $2, null)", [id, IDS.admin])).code).toBe("23514");
      await addEvidence(c, id);
      await submit(c, id);
      await c.query("delete from public.claim_evidence where claim_id = $1", [id]);
      const r = await attempt(c, "select public.claim_decide($1, 'approved', $2, null)", [id, IDS.admin]);
      expect(r.code).toBe("23514");
      expect(r.error).toMatch(/evidência/);
      await decide(c, id, "rejected", "Sem prova");
      for (const to of ["approved", "insufficient_evidence", "rejected"]) {
        const t = await attempt(c, "select public.claim_decide($1, $2::public.claim_status, $3, 'motivo')", [id, to, IDS.admin]);
        expect(t.code, `rejected -> ${to}`).toBe("23514"); // terminal
      }
    });
  });

  it("aprovação completa: verified, owner, parent vira school_member, demais abertas recusadas com decision_code, eventos", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      await ensureProfile(c, IDS.spare, "parent");
      const winner = await docsAwaiting(c, school, IDS.parent);
      const loserDocs = await docsAwaiting(c, school, IDS.spare);
      const loserEmail = await createClaim(c, school, { claimant: IDS.school_member, method: "institutional_email" });
      const loserEmailToken = await issueToken(c, loserEmail, sha("t"), IDS.school_member);
      expect(loserEmailToken.channel).toBe("email");
      const previousRejected = await createClaim(c, await seedClaimSchool(c, { inep: "51999802" }));
      await decide(c, previousRejected, "rejected", "Recusada antes");

      await decide(c, winner, "approved", null);

      expect(await schoolStatus(c, school)).toBe("verified");
      expect(await statusOf(c, winner)).toBe("approved");
      expect((await c.query("select decided_by, decided_at is not null as d from public.claims where id = $1", [winner])).rows[0]).toEqual({ decided_by: IDS.admin, d: true });
      const m = await c.query("select profile_id, member_role::text as r, claim_id from public.school_members where school_id = $1", [school]);
      expect(m.rows).toEqual([{ profile_id: IDS.parent, r: "owner", claim_id: winner }]);
      expect((await c.query("select role::text from public.profiles where id = $1", [IDS.parent])).rows[0]?.role).toBe("school_member");
      for (const lost of [loserDocs, loserEmail]) {
        const r = await c.query("select status::text, decision_code, decision_reason, decided_by from public.claims where id = $1", [lost]);
        expect(r.rows[0]).toMatchObject({ status: "rejected", decision_code: "school_verified_by_other_claim", decided_by: null });
        expect(String(r.rows[0]?.decision_reason).length).toBeGreaterThan(2);
        expect((await eventsOf(c, lost)).at(-1)).toMatch(/>rejected:system$/);
      }
      expect((await c.query("select count(*)::int as n from public.claim_tokens where claim_id = $1 and revoked_at is null", [loserEmail])).rows[0]?.n).toBe(0);
      expect(await eventsOf(c, winner)).toEqual(["->submitted:claimant", "submitted>awaiting_verification:claimant", "awaiting_verification>approved:admin"]);
      // escola verified não aceita nova reivindicação
      expect((await attempt(c, CREATE_SQL, [school, IDS.stationery_member, "documents"])).code).toBe("42501");
      await ensureProfile(c, IDS.orphan, "parent");
      expect((await attempt(c, CREATE_SQL, [school, IDS.orphan, "documents"])).code).toBe("23514");
    });
  });

  it("school_member aprovado continua school_member; papel não promovível (stationery_member) recusa a aprovação", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await docsAwaiting(c, school, IDS.school_member);
      await decide(c, id, "approved", null);
      expect((await c.query("select role::text from public.profiles where id = $1", [IDS.school_member])).rows[0]?.role).toBe("school_member");
    });
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await docsAwaiting(c, school, IDS.parent);
      await c.query("update public.profiles set role = 'stationery_member' where id = $1", [IDS.parent]);
      const r = await attempt(c, "select public.claim_decide($1, 'approved', $2, null)", [id, IDS.admin]);
      expect(r.code).toBe("23514");
      expect(await schoolStatus(c, school)).toBe("claimed");
    });
  });

  it("recusar a única reivindicação devolve a escola a registered; havendo outra em análise, segue claimed", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      await ensureProfile(c, IDS.spare, "parent");
      const a = await docsAwaiting(c, school, IDS.parent);
      const b = await docsAwaiting(c, school, IDS.spare);
      expect(await schoolStatus(c, school)).toBe("claimed");
      await decide(c, a, "rejected", "Não é da escola");
      expect(await schoolStatus(c, school)).toBe("claimed");
      await decide(c, b, "rejected", "Também não");
      expect(await schoolStatus(c, school)).toBe("registered");
      // submitted (não enviada) não deixa a escola claimed
      await createClaim(c, school);
      expect(await schoolStatus(c, school)).toBe("registered");
    });
  });

  it("verified nunca volta a claimed por nenhuma função (sync ignora verified)", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c, { status: "verified" });
      expect(await schoolStatus(c, school)).toBe("verified");
      await c.query("select public.claim_expire_tokens()");
      expect(await schoolStatus(c, school)).toBe("verified");
    });
  });
});

// Concorrência: commits reais em conexões paralelas; limpeza por INEP no fim.
describe("S06 concorrência", () => {
  const INEP = "51999901";
  async function purge(): Promise<void> {
    await withSuperuser(async (c) => {
      await c.query("begin");
      await c.query("set local session_replication_role = replica");
      const sub = "select id from public.claims where school_id in (select id from public.schools where inep = $1)";
      for (const t of ["claim_status_events", "claim_evidence", "claim_tokens"]) {
        await c.query(`delete from public.${t} where claim_id in (${sub})`, [INEP]);
      }
      await c.query("delete from public.school_members where school_id in (select id from public.schools where inep = $1)", [INEP]);
      await c.query(`delete from public.claims where id in (${sub})`, [INEP]);
      await c.query("delete from public.schools where inep = $1", [INEP]);
      await c.query("commit");
    });
  }
  beforeAll(reset);
  afterAll(async () => {
    await purge();
    await cleanupUsers(); // profiles voltam ao estado original no próximo seedUsers
  });

  async function seedCommitted(): Promise<{ school: string; a: string; b: string }> {
    return withSuperuser(async (c) => {
      await c.query("begin");
      const school = await seedClaimSchool(c, { inep: INEP });
      const a = await docsAwaiting(c, school, IDS.parent);
      const b = await docsAwaiting(c, school, IDS.spare);
      await c.query("commit");
      return { school, a, b };
    });
  }
  async function reset(): Promise<void> {
    await purge(); // antes de seedUsers: claims.claimant_id é restrict
    await seedUsers();
    await withSuperuser((c) => ensureProfile(c, IDS.spare, "parent"));
  }

  async function inOwnTx<T>(fn: (c: Client) => Promise<T>, holdMs = 0): Promise<T> {
    const c = new Client({ connectionString: DATABASE_URL });
    await c.connect();
    try {
      await c.query("begin");
      const out = await fn(c);
      if (holdMs) await c.query("select pg_sleep($1)", [holdMs / 1000]);
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback").catch(() => undefined);
      throw e;
    } finally {
      await c.end();
    }
  }
  const later = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("duas aprovações da mesma escola em conexões paralelas: uma vence, a outra 23514; um approved, um owner", async () => {
    await reset();
    const { school, a, b } = await seedCommitted();
    const first = inOwnTx((c) => decide(c, a, "approved", null), 400);
    await later(150);
    const second = inOwnTx((c) => decide(c, b, "approved", null));
    const res = await Promise.allSettled([first, second]);
    expect(res[0].status).toBe("fulfilled");
    expect(res[1].status).toBe("rejected");
    expect((res[1] as PromiseRejectedResult).reason).toMatchObject({ code: "23514" });
    await withSuperuser(async (c) => {
      expect((await c.query("select count(*)::int as n from public.claims where school_id = $1 and status = 'approved'", [school])).rows[0]?.n).toBe(1);
      expect((await c.query("select count(*)::int as n from public.school_members where school_id = $1 and member_role = 'owner'", [school])).rows[0]?.n).toBe(1);
      expect(await statusOf(c, b)).toBe("rejected");
      expect(await schoolStatus(c, school)).toBe("verified");
    });
  });

  it("aprovação × claim_create na mesma escola: o create espera e vê escola verified (23514)", async () => {
    await reset();
    const { school, a } = await seedCommitted();
    await withSuperuser((c) => ensureProfile(c, IDS.orphan, "parent"));
    const approve = inOwnTx((c) => decide(c, a, "approved", null), 400);
    await later(150);
    const create = inOwnTx((c) => c.query(CREATE_SQL, [school, IDS.orphan, "documents"]));
    const res = await Promise.allSettled([approve, create]);
    expect(res[0].status).toBe("fulfilled");
    expect(res[1].status).toBe("rejected");
    expect((res[1] as PromiseRejectedResult).reason).toMatchObject({ code: "23514" });
    await withSuperuser(async (c) => {
      expect(await schoolStatus(c, school)).toBe("verified");
      expect((await c.query("select count(*)::int as n from public.claims where school_id = $1 and status not in ('approved','rejected')", [school])).rows[0]?.n).toBe(0);
    });
  });

  it("claim_create que entra antes da aprovação é recusada pelo sistema quando a aprovação sai", async () => {
    await reset();
    const { school, a } = await seedCommitted();
    await withSuperuser((c) => ensureProfile(c, IDS.orphan, "parent"));
    const create = inOwnTx((c) => c.query(CREATE_SQL, [school, IDS.orphan, "documents"]), 400);
    await later(150);
    const approve = inOwnTx((c) => decide(c, a, "approved", null));
    const res = await Promise.allSettled([create, approve]);
    expect(res.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    await withSuperuser(async (c) => {
      expect(await schoolStatus(c, school)).toBe("verified");
      expect((await c.query("select count(*)::int as n from public.claims where school_id = $1 and status not in ('approved','rejected')", [school])).rows[0]?.n).toBe(0);
      expect((await c.query("select count(*)::int as n from public.claims where school_id = $1 and decision_code = 'school_verified_by_other_claim'", [school])).rows[0]?.n).toBe(2);
    });
  });
});
