import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { EVIDENCE_BUCKET, createSupabaseEvidenceStorage } from "@/features/claims/evidence-storage";

import { pdf, png } from "../helpers/files";
import { localEnv } from "../claims/support";

let service: SupabaseClient;
const created: string[] = [];
const newPath = (ext: string) => {
  const p = `${randomUUID()}/${randomUUID()}.${ext}`;
  created.push(p);
  return p;
};

beforeAll(() => {
  const env = localEnv();
  service = createClient(env.url, env.secret, { auth: { persistSession: false, autoRefreshToken: false } });
});
afterAll(async () => {
  if (created.length > 0) await service.storage.from(EVIDENCE_BUCKET).remove(created);
});

describe("createSupabaseEvidenceStorage (Storage local real)", () => {
  it("nome do bucket, put, URL assinada, remove", async () => {
    expect(EVIDENCE_BUCKET).toBe("claim-evidence");
    const storage = createSupabaseEvidenceStorage(service);
    const path = newPath("pdf");
    await storage.put(path, pdf(), "application/pdf");

    const url = await storage.signedUrl(path, 60, "Certidão 1.pdf");
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/pdf/);
    expect(res.headers.get("content-disposition") ?? "").toMatch(/attachment/i);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf());

    await storage.remove(path);
    expect((await fetch(url)).status).toBeGreaterThanOrEqual(400);
    const { data } = await service.storage.from(EVIDENCE_BUCKET).list(path.split("/")[0]);
    expect(data ?? []).toHaveLength(0);
  });

  it("put usa upsert:false (segundo put no mesmo caminho falha) e o Storage recusa MIME fora da lista", async () => {
    const storage = createSupabaseEvidenceStorage(service);
    const path = newPath("png");
    await storage.put(path, png(), "image/png");
    await expect(storage.put(path, png(), "image/png")).rejects.toThrow("falha ao gravar");
    await expect(storage.put(newPath("gif"), new Uint8Array([71, 73, 70, 56]), "image/gif")).rejects.toThrow("falha ao gravar");
    await expect(storage.put(newPath("html"), new TextEncoder().encode("<html>"), "text/html")).rejects.toThrow("falha ao gravar");
  });

  it("passa o bucket e o upsert:false ao cliente", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upload });
    const fake = { storage: { from } } as unknown as SupabaseClient;
    await createSupabaseEvidenceStorage(fake).put("a/b.pdf", pdf(), "application/pdf");
    expect(from).toHaveBeenCalledWith("claim-evidence");
    expect(upload).toHaveBeenCalledWith("a/b.pdf", expect.anything(), { contentType: "application/pdf", upsert: false });
  });

  it("signedUrl de objeto inexistente falha com texto fixo", async () => {
    const storage = createSupabaseEvidenceStorage(service);
    await expect(storage.signedUrl(`${randomUUID()}/nao-existe.pdf`, 60)).rejects.toThrow("falha ao assinar");
  });
});
