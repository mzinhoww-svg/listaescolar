import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ actor: null as unknown }));
const repo = vi.hoisted(() => ({ decide: vi.fn(), confirmToken: vi.fn(), createClaim: vi.fn(), issueToken: vi.fn() }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
);
vi.mock("next/navigation", () => ({
  redirect,
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => session.actor }));
vi.mock("@/features/claims/action-support", () => ({
  serviceClaimsRepository: () => repo,
  envSenderFor: () => null,
  linkOrigin: () => "http://localhost:3001",
  loginPath: (inep: string) => `/entrar?next=/escolas/${inep}/reivindicar`,
}));
vi.mock("@/features/claims/queries", () => ({ getClaimForAdmin: async () => null, getSchoolClaimContext: async () => null }));

import { decideClaimAction } from "@/app/admin/reivindicacoes/actions";
import { confirmTokenAction } from "@/app/escolas/[inep]/reivindicar/confirmar/actions";
import { createClaimAction, requestTokenAction } from "@/app/escolas/[inep]/reivindicar/actions";
import { IDLE } from "@/features/claims/form-state";

const ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  session.actor = null;
  for (const f of Object.values(repo)) f.mockReset();
  redirect.mockClear();
});

describe("decideClaimAction", () => {
  it("sem sessão vai ao login; não-admin recebe texto fixo e nada é chamado", async () => {
    await expect(decideClaimAction(IDLE, form({ claimId: ID, to: "approved" }))).rejects.toThrow("REDIRECT:/entrar");
    session.actor = { userId: ID, role: "parent" };
    const r = await decideClaimAction(IDLE, form({ claimId: ID, to: "approved" }));
    expect(r).toMatchObject({ status: "error", message: "Esta ação é só para administradores." });
    expect(repo.decide).not.toHaveBeenCalled();
  });
  it("recusar sem motivo é barrado na entrada; erro do banco vira texto fixo", async () => {
    session.actor = { userId: ID, role: "admin" };
    const r = await decideClaimAction(IDLE, form({ claimId: ID, to: "rejected", reason: "ab" }));
    expect(r).toMatchObject({ status: "error", errors: { reason: expect.any(String) } });
    expect(repo.decide).not.toHaveBeenCalled();
    repo.decide.mockRejectedValue(Object.assign(new Error('duplicate key value violates "claims_one_approved_idx"'), { code: "database" }));
    const e = await decideClaimAction(IDLE, form({ claimId: ID, to: "approved" }));
    expect(JSON.stringify(e)).not.toMatch(/duplicate|claims_one/);
    repo.decide.mockResolvedValue("approved");
    expect(await decideClaimAction(IDLE, form({ claimId: ID, to: "approved" }))).toMatchObject({ status: "ok" });
  });
});

describe("ações do reivindicante", () => {
  it("inep inválido é 404; sem sessão vai ao login com next", async () => {
    await expect(createClaimAction(IDLE, form({ inep: "abc" }))).rejects.toThrow("NOT_FOUND");
    await expect(requestTokenAction(IDLE, form({ inep: "51999801", claimId: ID }))).rejects.toThrow("REDIRECT:/entrar?next=/escolas/51999801/reivindicar");
  });
  it("papel que não reivindica é bloqueado sem tocar no repositório", async () => {
    session.actor = { userId: ID, role: "stationery_member" };
    expect(await requestTokenAction(IDLE, form({ inep: "51999801", claimId: ID }))).toMatchObject({ status: "error" });
    expect(repo.issueToken).not.toHaveBeenCalled();
  });
  it("token emitido nunca devolve o canal do contato; o resultado é só texto fixo", async () => {
    session.actor = { userId: ID, role: "parent" };
    repo.issueToken.mockResolvedValue({ channel: "email", expiresAt: "2026-01-01T00:00:00Z" });
    const r = await requestTokenAction(IDLE, form({ inep: "51999801", claimId: ID }));
    expect(r).toMatchObject({ status: "ok" });
    expect(JSON.stringify(r)).not.toMatch(/@|token=/);
  });
});

describe("confirmTokenAction", () => {
  it("entrada inválida vira 'inválido' sem chamar o banco; resultados viram texto fixo", async () => {
    session.actor = { userId: ID, role: "parent" };
    expect(await confirmTokenAction(IDLE, form({ inep: "51999801", channel: "email", token: "curto" }))).toMatchObject({ status: "error" });
    expect(repo.confirmToken).not.toHaveBeenCalled();
    repo.confirmToken.mockResolvedValue("confirmed");
    expect(await confirmTokenAction(IDLE, form({ inep: "51999801", channel: "email", token: "A".repeat(43) }))).toMatchObject({ status: "ok" });
    repo.confirmToken.mockResolvedValue("locked");
    expect(await confirmTokenAction(IDLE, form({ inep: "51999801", channel: "whatsapp", claimId: ID, code: "123456" }))).toMatchObject({ status: "error" });
    expect(repo.confirmToken).toHaveBeenLastCalledWith(session.actor, { channel: "whatsapp", claimId: ID, code: "123456" });
  });
});
