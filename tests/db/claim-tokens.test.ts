import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SCHOOL_EMAIL, addEvidence, backdateTokens, confirm, createClaim, decide, ensureProfile, eventsOf, issueToken,
  schoolStatus, seedClaimSchool, sha, statusOf, submit,
} from "./claim-fixtures";
import { attempt, cleanupUsers, IDS, inTx, seedUsers } from "./helpers";

const H = (n: string) => sha(`token-${n}`);
const ISSUE = "select * from public.claim_issue_token($1, $2, $3)";

describe("S06 emissão de token", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("e-mail: guarda só o hash, validade 24 h, destino = e-mail da escola, leva a awaiting_verification e a escola a claimed", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      const t = await issueToken(c, id, H("a"));
      expect(t.channel).toBe("email");
      expect(t.destination).toBe(SCHOOL_EMAIL);
      const hours = (t.expires_at.getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(23.9);
      expect(hours).toBeLessThan(24.1);
      expect(await statusOf(c, id)).toBe("awaiting_verification");
      expect(await schoolStatus(c, school)).toBe("claimed");
      expect(await eventsOf(c, id)).toEqual(["->submitted:claimant", "submitted>awaiting_verification:claimant"]);
      const row = await c.query("select to_jsonb(t) as j from public.claim_tokens t where id = $1", [t.token_id]);
      expect(row.rows[0]?.j.token_hash).toBe(H("a"));
      expect(JSON.stringify(row.rows[0]?.j)).not.toContain("token-a");
      expect(row.rows[0]?.j).toMatchObject({ attempts: 0, consumed_at: null, revoked_at: null });
    });
  });

  it("WhatsApp: validade 15 min; destino normalizado com 55; nunca o número digitado (não há parâmetro)", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c, { phone: "(65) 99999-0001" });
      const id = await createClaim(c, school, { method: "institutional_whatsapp" });
      const t = await issueToken(c, id, H("w"));
      expect(t.channel).toBe("whatsapp");
      expect(t.destination).toBe("5565999990001");
      const minutes = (t.expires_at.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(14.9);
      expect(minutes).toBeLessThan(15.1);
    });
  });

  it("só o reivindicante; documentos não usa token; hash fora do formato e hash repetido são recusados", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      for (const who of [IDS.school_member, IDS.admin, IDS.orphan]) {
        expect((await attempt(c, ISSUE, [id, who, H("x")])).code, who).toBe("42501");
      }
      for (const bad of ["abc", "G".repeat(64), H("x").toUpperCase()]) {
        expect((await attempt(c, ISSUE, [id, IDS.parent, bad])).code, bad).toBe("23514");
      }
      const docs = await createClaim(c, await seedClaimSchool(c, { inep: "51999802" }), { method: "documents" });
      const d = await attempt(c, ISSUE, [docs, IDS.parent, H("d")]);
      expect(d.code).toBe("23514");
      await issueToken(c, id, H("dup"));
      await backdateTokens(c, id, 61);
      expect((await attempt(c, ISSUE, [id, IDS.parent, H("dup")])).code).toBe("23505");
    });
  });

  it("escola sem contato: e-mail/celular removidos depois da criação recusam a emissão (sem indício do motivo interno)", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      await c.query("update public.schools set email = null where id = $1", [school]);
      expect((await attempt(c, ISSUE, [id, IDS.parent, H("n")])).code).toBe("23514");
    });
  });

  it("intervalo mínimo de 60 s; depois dele o token anterior é revogado e só há um ativo", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      const first = await issueToken(c, id, H("1"));
      const early = await attempt(c, ISSUE, [id, IDS.parent, H("2")]);
      expect(early.code).toBe("23514");
      expect(early.error).toMatch(/60 segundos/);
      await backdateTokens(c, id, 61);
      const second = await issueToken(c, id, H("2"));
      const rows = await c.query("select id, revoked_at is not null as revoked from public.claim_tokens where claim_id = $1 order by created_at", [id]);
      expect(rows.rows).toEqual([{ id: first.token_id, revoked: true }, { id: second.token_id, revoked: false }]);
      // o token revogado não confirma
      expect(await confirm(c, H("1"))).toBe("invalid");
      expect(await confirm(c, H("2"))).toBe("confirmed");
    });
  });

  it("no máximo 5 emissões em 24 h", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      for (let i = 0; i < 5; i++) {
        await issueToken(c, id, H(`l${i}`));
        await backdateTokens(c, id, 61);
      }
      const r = await attempt(c, ISSUE, [id, IDS.parent, H("l5")]);
      expect(r.code).toBe("23514");
      expect(r.error).toMatch(/5 tokens/);
      // fora da janela de 24 h volta a valer
      await backdateTokens(c, id, 24 * 3600);
      expect((await attempt(c, ISSUE, [id, IDS.parent, H("l6")])).error).toBeNull();
    });
  });

  it("teto de 10 tokens em 24 h por escola (várias reivindicantes): a terceira conta é recusada mesmo sem ter emitido nenhum", async () => {
    await inTx(async (c) => {
      await ensureProfile(c, IDS.spare, "parent");
      const school = await seedClaimSchool(c);
      const claim = (who: string) => createClaim(c, school, { method: "institutional_email", claimant: who });
      const [a, b, third] = [await claim(IDS.parent), await claim(IDS.school_member), await claim(IDS.spare)];
      for (const [id, who] of [[a, IDS.parent], [b, IDS.school_member]] as const) {
        for (let i = 0; i < 5; i++) {
          await issueToken(c, id, H(`sc${who.slice(-1)}${i}`), who);
          await backdateTokens(c, id, 61);
        }
      }
      const r = await attempt(c, ISSUE, [third, IDS.spare, H("sc-third")]);
      expect(r.code).toBe("23514");
      expect(r.error).toMatch(/10 tokens.*escola/);
      expect(await statusOf(c, third)).toBe("submitted");
      // o teto é por escola: outra escola não é afetada; fora da janela de 24 h volta a valer
      const elsewhere = await createClaim(c, await seedClaimSchool(c, { inep: "51999802" }), { method: "institutional_email", claimant: IDS.spare });
      expect((await attempt(c, ISSUE, [elsewhere, IDS.spare, H("sc-else")])).error).toBeNull();
      await backdateTokens(c, a, 24 * 3600);
      await backdateTokens(c, b, 24 * 3600);
      expect((await attempt(c, ISSUE, [third, IDS.spare, H("sc-third")])).error).toBeNull();
    });
  });

  it("depois de confirmado o canal não emite mais token; estados finais e insufficient_evidence recusam", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      await issueToken(c, id, H("c"));
      expect(await confirm(c, H("c"))).toBe("confirmed");
      await backdateTokens(c, id, 61);
      const r = await attempt(c, ISSUE, [id, IDS.parent, H("c2")]);
      expect(r.code).toBe("23514");
      expect(r.error).toMatch(/já confirmado/);

      const other = await createClaim(c, await seedClaimSchool(c, { inep: "51999802" }), { method: "institutional_email" });
      await issueToken(c, other, H("o"));
      await decide(c, other, "insufficient_evidence", "Falta algo");
      await backdateTokens(c, other, 61);
      expect((await attempt(c, ISSUE, [other, IDS.parent, H("o2")])).code).toBe("23514");
    });
  });
});

describe("S06 confirmação de token (e-mail)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("confirmed grava consumed_at e channel_confirmed_at; repetir dá already_confirmed; nada em claro no evento", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      const t = await issueToken(c, id, H("e"));
      expect(await confirm(c, H("e"))).toBe("confirmed");
      const row = await c.query("select t.consumed_at is not null as used, c.channel_confirmed_at is not null as ok from public.claim_tokens t join public.claims c on c.id = t.claim_id where t.id = $1", [t.token_id]);
      expect(row.rows[0]).toEqual({ used: true, ok: true });
      expect(await confirm(c, H("e"))).toBe("already_confirmed"); // reuso negado, sem novo efeito
      expect(await statusOf(c, id)).toBe("awaiting_verification"); // confirmar não aprova
      expect(await schoolStatus(c, school)).toBe("claimed");
    });
  });

  it("outro usuário, hash desconhecido, hash de outra reivindicação e método documentos dão invalid", async () => {
    await inTx(async (c) => {
      await ensureProfile(c, IDS.spare, "parent");
      const s1 = await seedClaimSchool(c);
      const s2 = await seedClaimSchool(c, { inep: "51999802" });
      const mine = await createClaim(c, s1, { method: "institutional_email" });
      const theirs = await createClaim(c, s2, { method: "institutional_email", claimant: IDS.spare });
      await issueToken(c, mine, H("m"));
      await issueToken(c, theirs, H("t"), IDS.spare);
      expect(await confirm(c, H("m"), IDS.spare)).toBe("invalid"); // outro usuário
      expect(await confirm(c, H("m"), IDS.admin)).toBe("invalid");
      expect(await confirm(c, H("t"))).toBe("invalid"); // token de outra reivindicação
      expect(await confirm(c, H("zzz"))).toBe("invalid");
      expect(await confirm(c, H("m"), IDS.parent, theirs)).toBe("invalid"); // p_claim_id de outro
      const docs = await createClaim(c, await seedClaimSchool(c, { inep: "51999803" }), { method: "documents" });
      expect(await confirm(c, H("m"), IDS.parent, docs)).toBe("invalid");
      // nada foi consumido pelas tentativas inválidas
      expect((await c.query("select count(*)::int as n from public.claim_tokens where consumed_at is not null")).rows[0]?.n).toBe(0);
      expect(await confirm(c, H("m"))).toBe("confirmed");
    });
  });

  it("vencido: expired, reivindicação vai a token_expired (system) e a escola segue claimed; novo token volta a awaiting_verification", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      await issueToken(c, id, H("v"));
      await backdateTokens(c, id, 25 * 3600);
      expect(await confirm(c, H("v"))).toBe("expired");
      expect(await statusOf(c, id)).toBe("token_expired");
      expect(await eventsOf(c, id)).toContain("awaiting_verification>token_expired:system");
      expect(await schoolStatus(c, school)).toBe("claimed");
      expect(await confirm(c, H("v"))).toBe("expired"); // idempotente
      await issueToken(c, id, H("v2"));
      expect(await statusOf(c, id)).toBe("awaiting_verification");
      expect(await confirm(c, H("v2"))).toBe("confirmed");
    });
  });

  it("estados finais: token de reivindicação recusada não confirma", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      await issueToken(c, id, H("f"));
      await decide(c, id, "rejected", "Recusada");
      expect(await confirm(c, H("f"))).toBe("invalid");
      expect(await schoolStatus(c, school)).toBe("registered");
    });
  });

  it("argumentos nulos são 22023", async () => {
    await inTx(async (c) => {
      expect((await attempt(c, "select public.claim_confirm_token(null, $1, null)", [IDS.parent])).code).toBe("22023");
      expect((await attempt(c, "select public.claim_confirm_token($1, null, null)", [H("q")])).code).toBe("22023");
    });
  });
});

describe("S06 confirmação de código (WhatsApp)", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);
  const code = (claimId: string, digits: string) => sha(`${claimId}:${digits}`);

  it("sem p_claim_id o código nunca confirma (invalid); código certo confirma; repetir dá already_confirmed", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_whatsapp" });
      await issueToken(c, id, code(id, "012345"));
      expect(await confirm(c, code(id, "012345"), IDS.parent, null)).toBe("invalid");
      expect(await confirm(c, code(id, "012345"), IDS.parent, id)).toBe("confirmed");
      expect(await confirm(c, code(id, "012345"), IDS.parent, id)).toBe("already_confirmed");
    });
  });

  it("erros contam tentativa; a 5ª errada trava (locked), revoga o token e nem o código certo passa depois", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_whatsapp" });
      const t = await issueToken(c, id, code(id, "111111"));
      const results: string[] = [];
      for (let i = 0; i < 5; i++) results.push(await confirm(c, code(id, `00000${i}`), IDS.parent, id));
      expect(results).toEqual(["invalid", "invalid", "invalid", "invalid", "locked"]);
      const row = await c.query("select attempts, revoked_at is not null as revoked, consumed_at from public.claim_tokens where id = $1", [t.token_id]);
      expect(row.rows[0]).toEqual({ attempts: 5, revoked: true, consumed_at: null });
      expect(await confirm(c, code(id, "111111"), IDS.parent, id)).toBe("locked");
      expect((await c.query("select channel_confirmed_at from public.claims where id = $1", [id])).rows[0]?.channel_confirmed_at).toBeNull();
      // depois do intervalo, novo código (a reivindicação continua em análise)
      await backdateTokens(c, id, 61);
      await issueToken(c, id, code(id, "222222"));
      expect(await confirm(c, code(id, "222222"), IDS.parent, id)).toBe("confirmed");
    });
  });

  it("2 erros e depois o certo confirma; outro usuário nunca conta tentativa nem confirma", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_whatsapp" });
      await issueToken(c, id, code(id, "654321"));
      expect(await confirm(c, code(id, "000000"), IDS.school_member, id)).toBe("invalid");
      expect(await confirm(c, code(id, "654321"), IDS.school_member, id)).toBe("invalid");
      expect((await c.query("select attempts from public.claim_tokens where claim_id = $1", [id])).rows[0]?.attempts).toBe(0);
      expect(await confirm(c, code(id, "000001"), IDS.parent, id)).toBe("invalid");
      expect(await confirm(c, code(id, "000002"), IDS.parent, id)).toBe("invalid");
      expect(await confirm(c, code(id, "654321"), IDS.parent, id)).toBe("confirmed");
    });
  });

  it("código vencido: expired e token_expired; código de outra reivindicação é invalid", async () => {
    await inTx(async (c) => {
      const s1 = await seedClaimSchool(c);
      const id = await createClaim(c, s1, { method: "institutional_whatsapp" });
      await issueToken(c, id, code(id, "123123"));
      expect(await confirm(c, sha(`${randomUUID()}:123123`), IDS.parent, id)).toBe("invalid");
      await backdateTokens(c, id, 16 * 60);
      expect(await confirm(c, code(id, "123123"), IDS.parent, id)).toBe("expired");
      expect(await statusOf(c, id)).toBe("token_expired");
    });
  });
});

describe("S06 claim_expire_tokens", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("varre só awaiting_verification por token, sem canal confirmado e com o último token vencido; idempotente", async () => {
    await inTx(async (c) => {
      await ensureProfile(c, IDS.spare, "parent");
      const s = async (n: number) => seedClaimSchool(c, { inep: `5199980${n}` });
      const expired = await createClaim(c, await s(1), { method: "institutional_email" });
      const fresh = await createClaim(c, await s(2), { method: "institutional_whatsapp", claimant: IDS.school_member });
      const confirmed = await createClaim(c, await s(3), { method: "institutional_email", claimant: IDS.spare });
      const docs = await createClaim(c, await s(4), { method: "documents" });
      await addEvidence(c, docs);
      await submit(c, docs);
      await issueToken(c, expired, H("x1"));
      await issueToken(c, fresh, sha(`${fresh}:111111`), IDS.school_member);
      await issueToken(c, confirmed, H("x3"), IDS.spare);
      await confirm(c, H("x3"), IDS.spare);
      await backdateTokens(c, expired, 25 * 3600);
      await backdateTokens(c, confirmed, 25 * 3600);

      expect((await c.query("select public.claim_expire_tokens($1) as n", [fresh])).rows[0]?.n).toBe(0);
      expect((await c.query("select public.claim_expire_tokens() as n")).rows[0]?.n).toBe(1);
      expect((await c.query("select public.claim_expire_tokens() as n")).rows[0]?.n).toBe(0);
      expect(await statusOf(c, expired)).toBe("token_expired");
      expect(await statusOf(c, fresh)).toBe("awaiting_verification");
      expect(await statusOf(c, confirmed)).toBe("awaiting_verification");
      expect(await statusOf(c, docs)).toBe("awaiting_verification");
      expect((await eventsOf(c, expired)).filter((e) => e.endsWith("token_expired:system"))).toHaveLength(1);
    });
  });

  it("com o token mais recente ainda válido (reemitido) não expira", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      await issueToken(c, id, H("r1"));
      await backdateTokens(c, id, 25 * 3600);
      await issueToken(c, id, H("r2")); // revoga o vencido, emite um novo válido
      expect((await c.query("select public.claim_expire_tokens($1) as n", [id])).rows[0]?.n).toBe(0);
      expect(await statusOf(c, id)).toBe("awaiting_verification");
    });
  });
});

describe("S06 aprovação por token", () => {
  beforeAll(seedUsers);
  afterAll(cleanupUsers);

  it("aprovar exige canal confirmado; token confirmado é evidência, não decisão (nada aprova sozinho)", async () => {
    await inTx(async (c) => {
      const school = await seedClaimSchool(c);
      const id = await createClaim(c, school, { method: "institutional_email" });
      await issueToken(c, id, H("ap"));
      const early = await attempt(c, "select public.claim_decide($1, 'approved', $2, null)", [id, IDS.admin]);
      expect(early.code).toBe("23514");
      expect(early.error).toMatch(/canal confirmado/);
      expect(await confirm(c, H("ap"))).toBe("confirmed");
      expect(await statusOf(c, id)).toBe("awaiting_verification");
      expect(await schoolStatus(c, school)).toBe("claimed");
      await decide(c, id, "approved", null);
      expect(await schoolStatus(c, school)).toBe("verified");
      expect(await eventsOf(c, id)).toEqual(["->submitted:claimant", "submitted>awaiting_verification:claimant", "awaiting_verification>approved:admin"]);
    });
  });
});
