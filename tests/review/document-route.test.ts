import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ actor: null as unknown }));
const ref = vi.hoisted(() => vi.fn());
const sign = vi.hoisted(() => vi.fn());
const bucket = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/actor", () => ({ getSessionActor: async () => session.actor }));
vi.mock("@/features/review/queries", () => ({ getReviewDocumentRef: (...a: unknown[]) => ref(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: (b: string) => { bucket(b); return { createSignedUrl: sign }; } } }) }));

import { GET } from "@/app/admin/revisao/documento/[id]/route";

const ID = "3f2b8c1e-5d4a-4b6f-9c3d-1a2b3c4d5e6f";
const call = (id: string) => GET(new Request("http://localhost/x"), { params: Promise.resolve({ id }) });
const admin = { userId: ID, role: "admin" };

beforeEach(() => {
  session.actor = admin;
  ref.mockReset().mockResolvedValue({ storagePath: "u/segredo/arquivo.pdf", mimeType: "application/pdf" });
  sign.mockReset().mockResolvedValue({ data: { signedUrl: "http://127.0.0.1:54321/storage/v1/object/sign/list-uploads/x?token=t" }, error: null });
  bucket.mockReset();
});

const expectSame404 = async (r: Response) => {
  expect(r.status).toBe(404);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(await r.text()).toBe("");
};

describe("GET /admin/revisao/documento/[id]", () => {
  it("admin: 307 para a URL assinada de 60 s do bucket list-uploads, no-store e sem referrer", async () => {
    const r = await call(ID);
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("/object/sign/list-uploads/");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(bucket).toHaveBeenCalledWith("list-uploads");
    expect(sign).toHaveBeenCalledWith("u/segredo/arquivo.pdf", 60);
    expect(await r.text()).not.toContain("segredo");
  });
  it("sem sessão e não-admin: 404 idêntico sem tocar em banco nem storage", async () => {
    for (const actor of [null, { userId: ID, role: "parent" }, { userId: ID, role: "school_member" }]) {
      session.actor = actor;
      await expectSame404(await call(ID));
    }
    expect(ref).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });
  it("UUID inválido, envio inexistente e erro do storage: o mesmo 404", async () => {
    await expectSame404(await call("nao-e-uuid"));
    ref.mockResolvedValueOnce(null);
    await expectSame404(await call(ID));
    sign.mockResolvedValueOnce({ data: null, error: { message: "boom segredo" } });
    await expectSame404(await call(ID));
    sign.mockRejectedValueOnce(new Error("rede"));
    await expectSame404(await call(ID));
    expect(ref).toHaveBeenCalledTimes(3);
  });
});
