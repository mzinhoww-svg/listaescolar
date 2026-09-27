// runRetention (D-012, S17): orquestração com cliente Supabase MOCADO (o comportamento real das funções SQL já
// está em tests/db/lgpd-privacy.test.ts e a integração real com Storage em tests/privacy/repository.test.ts,
// pnpm test:db). Aqui cobrimos especificamente o caminho de FALHA do Storage pedido pela revisão de
// segurança/privacidade: uma falha real nunca deve levar ao `retention_purge` daquele id.
import { describe, expect, it, vi } from "vitest";

import { runRetention } from "@/features/privacy/retention";

type Row = { id: string; storage_path: string | null };

function fakeAdmin(opts: {
  candidates: Record<string, Row[]>;
  removeResult?: (paths: string[]) => { data: { name: string }[] | null; error: { name: string; message: string } | null };
  listResult?: (folder: string, search: string) => { data: { name: string }[] | null; error: unknown };
  purged?: Record<string, number>;
}) {
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const removeCalls: string[][] = [];
  const admin = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "retention_candidates") return { data: opts.candidates[args.p_resource as string] ?? [], error: null };
      if (fn === "retention_purge") return { data: opts.purged?.[args.p_resource as string] ?? (args.p_ids as string[]).length, error: null };
      return { data: null, error: null };
    }),
    storage: {
      from: () => ({
        remove: vi.fn(async (paths: string[]) => {
          removeCalls.push(paths);
          return opts.removeResult ? opts.removeResult(paths) : { data: paths.map((name) => ({ name })), error: null };
        }),
        list: vi.fn(async (folder: string, o: { search: string }) => (opts.listResult ? opts.listResult(folder, o.search) : { data: [], error: null })),
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { admin, rpcCalls, removeCalls };
}

describe("runRetention: claim_evidence", () => {
  it("Storage falha na remoção: NÃO purga a linha (fica candidata de novo); storageFailed conta certo", async () => {
    const { admin, rpcCalls } = fakeAdmin({
      candidates: {
        claim_evidence: [{ id: "00000000-0000-4000-8000-0000000000e1", storage_path: "claim-1/a.pdf" }],
        claim_tokens: [],
      },
      removeResult: () => ({ data: null, error: { name: "StorageApiError", message: "indisponível" } }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outcomes = await runRetention(admin);
    spy.mockRestore();

    const ev = outcomes.find((o) => o.resource === "claim_evidence")!;
    expect(ev.purged).toBe(0);
    expect(ev.storageFailed).toBe(1);
    // nunca chama retention_purge para claim_evidence quando nada foi confirmado removido
    expect(rpcCalls.some((c) => c.fn === "retention_purge" && c.args && (c.args as { p_resource: string }).p_resource === "claim_evidence")).toBe(false);
  });

  it("Storage remove com sucesso: confirma pelo nome devolvido e só então purga", async () => {
    const { admin, rpcCalls } = fakeAdmin({
      candidates: { claim_evidence: [{ id: "00000000-0000-4000-8000-0000000000e1", storage_path: "claim-1/a.pdf" }], claim_tokens: [] },
    });
    const outcomes = await runRetention(admin);
    const ev = outcomes.find((o) => o.resource === "claim_evidence")!;
    expect(ev.purged).toBe(1);
    expect(ev.storageFailed).toBe(0);
    const purgeCall = rpcCalls.find((c) => c.fn === "retention_purge" && (c.args as { p_resource: string }).p_resource === "claim_evidence");
    expect((purgeCall!.args as { p_ids: string[] }).p_ids).toEqual(["00000000-0000-4000-8000-0000000000e1"]);
  });

  it("arquivo já ausente do Storage (não veio na remoção, list confirma que não existe): ainda purga, sem travar para sempre", async () => {
    const { admin } = fakeAdmin({
      candidates: { claim_evidence: [{ id: "00000000-0000-4000-8000-0000000000e1", storage_path: "claim-1/a.pdf" }], claim_tokens: [] },
      removeResult: () => ({ data: [], error: null }), // ninguém confirmado no data (já não existia)
      listResult: () => ({ data: [], error: null }), // list confirma: realmente não está lá
    });
    const outcomes = await runRetention(admin);
    const ev = outcomes.find((o) => o.resource === "claim_evidence")!;
    expect(ev.purged).toBe(1);
    expect(ev.storageFailed).toBe(0);
  });

  it("arquivo AINDA presente depois da tentativa de remover (list mostra que existe): não purga, conta falha real", async () => {
    const { admin } = fakeAdmin({
      candidates: { claim_evidence: [{ id: "00000000-0000-4000-8000-0000000000e1", storage_path: "claim-1/a.pdf" }], claim_tokens: [] },
      removeResult: () => ({ data: [], error: null }),
      listResult: () => ({ data: [{ name: "a.pdf" }], error: null }), // ainda está lá: falha real
    });
    const outcomes = await runRetention(admin);
    const ev = outcomes.find((o) => o.resource === "claim_evidence")!;
    expect(ev.purged).toBe(0);
    expect(ev.storageFailed).toBe(1);
  });
});

describe("runRetention: nunca toca survey_*", () => {
  it("candidatos vazios para qualquer recurso fora de claim_evidence/claim_tokens (o mock nem simula outro)", async () => {
    const { admin, rpcCalls } = fakeAdmin({ candidates: { claim_evidence: [], claim_tokens: [] } });
    await runRetention(admin);
    for (const call of rpcCalls) {
      if (call.fn === "retention_candidates") {
        expect(["claim_evidence", "claim_tokens"]).toContain((call.args as { p_resource: string }).p_resource);
      }
    }
  });
});
