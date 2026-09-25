import { describe, expect, it, vi } from "vitest";
import { getSessionActor, type SessionActor } from "@/features/auth/actor";
import { createParentCopyService } from "@/features/review/parent-copy";
import { item, PARENT_ID } from "./support";

const auth = vi.hoisted(() => ({ user: { id: "x" } as { id: string } | null, role: "parent" as string | null }));
vi.mock("@/features/auth/queries", () => ({ getCurrentUser: async () => auth.user, getCurrentRole: async () => auth.role }));
async function actor(id = PARENT_ID, role = "parent"): Promise<SessionActor> {
  auth.user = { id };
  auth.role = role;
  return (await getSessionActor())!;
}

const COPY = "70000000-0000-4000-8000-0000000000c1";
const SUB = "10000000-0000-4000-8000-0000000000a1";

/** Cliente falso: só `rpc` e um select encadeado; registra tudo. */
function fakeClient(rpc: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const selects: string[] = [];
  const chain = { eq: () => chain, maybeSingle: async () => ({ data: { grade: "4º ano", school_year: 2027 }, error: null }) };
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), rpc(fn, args)),
    from: (t: string) => ({ select: () => (selects.push(t), chain) }),
  };
  return { client: client as never, calls, selects };
}

describe("createParentCopyService", () => {
  it("open: dono só da sessão; devolve itens, série e ano; só toca parent_copy_open e list_submissions do dono", async () => {
    const f = fakeClient(() => ({ data: { copyId: COPY, version: 1, items: [item()] }, error: null }));
    const svc = createParentCopyService(f.client);
    const out = await svc.open(await actor(), SUB);
    expect(out).toEqual({ copyId: COPY, version: 1, items: [item()], grade: "4º ano", schoolYear: 2027 });
    expect(f.calls).toEqual([{ fn: "parent_copy_open", args: { p_submission_id: SUB, p_owner_id: PARENT_ID } }]);
    expect(f.selects).toEqual(["list_submissions"]);
  });

  it("open: P0002 (outro dono, envio de escola, sem resultado) e id inválido -> null (404 igual)", async () => {
    const f = fakeClient(() => ({ data: null, error: { code: "P0002", message: "x" } }));
    const svc = createParentCopyService(f.client);
    expect(await svc.open(await actor(), SUB)).toBeNull();
    expect(await svc.open(await actor(), "nao-uuid")).toBeNull();
    expect(f.calls).toHaveLength(1);
  });

  it("save: Zod na borda; versão otimista; saved/stale; sem actorId nem campos extras", async () => {
    const f = fakeClient(() => ({ data: "saved", error: null }));
    const svc = createParentCopyService(f.client);
    const a = await actor();
    expect(await svc.save(a, COPY, { items: [item({ origin: "edited" })], expectedVersion: 3 })).toBe("saved");
    expect(f.calls[0]).toEqual({ fn: "parent_copy_save", args: { p_copy_id: COPY, p_owner_id: PARENT_ID, p_expected_version: 3, p_items: [item({ origin: "edited" })] } });
    await expect(svc.save(a, COPY, { items: [item({ quantity: 0 })], expectedVersion: 1 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.save(a, COPY, { items: [], expectedVersion: 1, actorId: "x" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(svc.save(a, "nao-uuid", { items: [], expectedVersion: 1 })).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.calls).toHaveLength(1);
    const stale = createParentCopyService(fakeClient(() => ({ data: "stale", error: null })).client);
    expect(await stale.save(a, COPY, { items: [], expectedVersion: 1 })).toBe("stale");
  });

  it("objeto forjado é recusado antes de qualquer RPC; erro do banco vira código fixo", async () => {
    const f = fakeClient(() => ({ data: null, error: { code: "XX000", message: "detalhe interno com SQL" } }));
    const svc = createParentCopyService(f.client);
    await expect(svc.open({ userId: PARENT_ID, role: "parent" } as unknown as SessionActor, SUB)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.save({ userId: PARENT_ID, role: "parent" } as unknown as SessionActor, COPY, { items: [], expectedVersion: 1 })).rejects.toMatchObject({ code: "forbidden" });
    expect(f.calls).toHaveLength(0);
    await expect(svc.open(await actor(), SUB)).rejects.toMatchObject({ code: "unavailable", message: "unavailable" });
  });
});
