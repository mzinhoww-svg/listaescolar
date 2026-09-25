// Suíte de contrato da porta `ListPublisher` (ADR-004). Reutilizável: a S11 a roda contra a implementação real
// (lists/versions de verdade); a S09 a roda contra `MemoryListPublisher`.
import { describe, expect, it } from "vitest";
import type { ListPublisher, PublishRequest } from "../../supabase/functions/_shared/publication/ports";

export type PublisherHarness = {
  publisher: ListPublisher;
  /** Arquiva a lista-alvo (escola, série, ano) para provar que a porta recusa lista arquivada. */
  archiveList(target: { schoolId: string; gradeSlug: string; schoolYear: number }): Promise<void> | void;
  /** Faz a PRÓXIMA chamada falhar com um `PortError` transitório (queda de rede/banco simulada). */
  failNextTransiently(): Promise<void> | void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function request(over: Partial<PublishRequest> = {}): PublishRequest {
  const id = over.submissionId ?? "10000000-0000-4000-8000-0000000000c1";
  return {
    idempotencyKey: id,
    submissionId: id,
    schoolId: "50000000-0000-4000-8000-0000000000c1",
    gradeSlug: "ef-4",
    schoolYear: 2027,
    source: "school_upload",
    actor: { kind: "system" },
    items: [{ position: 1, originalName: "Caderno", normalizedName: "caderno", category: "papelaria", quantity: 2, unit: "un", confidence: 0.9 }],
    ...over,
  };
}

async function rejection(p: Promise<unknown>): Promise<{ name?: string; code?: string; transient?: boolean }> {
  try {
    await p;
  } catch (e) {
    return e as { name?: string; code?: string; transient?: boolean };
  }
  throw new Error("a porta deveria ter recusado");
}

export function runListPublisherContract(name: string, make: () => PublisherHarness | Promise<PublisherHarness>): void {
  describe(`contrato ListPublisher: ${name}`, () => {
    it("publica e devolve listId, previousVersionId nulo na primeira e newVersionId uuid", async () => {
      const { publisher } = await make();
      const r = await publisher.publish(request());
      expect(r.previousVersionId).toBeNull();
      expect(r.newVersionId).toMatch(UUID);
      expect(r.listId).toMatch(UUID);
    });

    it("idempotente pela chave: repetir devolve o mesmo resultado e não cria outra versão", async () => {
      const { publisher } = await make();
      const a = await publisher.publish(request());
      const b = await publisher.publish(request());
      expect(b).toEqual(a);
      const next = await publisher.publish(request({ idempotencyKey: "10000000-0000-4000-8000-0000000000c2", submissionId: "10000000-0000-4000-8000-0000000000c2" }));
      expect(next.previousVersionId).toBe(a.newVersionId); // só houve UMA versão antes: a repetição não criou outra
    });

    it("a versão anterior é a publicada antes na mesma lista", async () => {
      const { publisher } = await make();
      const a = await publisher.publish(request());
      const b = await publisher.publish(request({ idempotencyKey: "10000000-0000-4000-8000-0000000000c3", submissionId: "10000000-0000-4000-8000-0000000000c3" }));
      const c = await publisher.publish(request({ idempotencyKey: "10000000-0000-4000-8000-0000000000c4", submissionId: "10000000-0000-4000-8000-0000000000c4" }));
      expect(b.previousVersionId).toBe(a.newVersionId);
      expect(c.previousVersionId).toBe(b.newVersionId);
      expect(b.listId).toBe(a.listId);
    });

    it("listas diferentes (escola, série ou ano) não compartilham versões", async () => {
      const { publisher } = await make();
      const a = await publisher.publish(request());
      const other = await publisher.publish(request({ idempotencyKey: "k-outra", submissionId: "10000000-0000-4000-8000-0000000000c5", gradeSlug: "ef-5" }));
      expect(other.previousVersionId).toBeNull();
      expect(other.listId).not.toBe(a.listId);
    });

    it("lista arquivada é recusada com erro permanente", async () => {
      const h = await make();
      await h.publisher.publish(request());
      await h.archiveList({ schoolId: request().schoolId, gradeSlug: "ef-4", schoolYear: 2027 });
      const e = await rejection(h.publisher.publish(request({ idempotencyKey: "10000000-0000-4000-8000-0000000000c6", submissionId: "10000000-0000-4000-8000-0000000000c6" })));
      expect(e.name).toBe("PortError");
      expect(e.transient).toBe(false);
      expect(e.code).toMatch(/^[a-z][a-z0-9_]{0,59}$/);
    });

    it("sem itens é recusado com erro permanente", async () => {
      const { publisher } = await make();
      const e = await rejection(publisher.publish(request({ items: [] })));
      expect(e.name).toBe("PortError");
      expect(e.transient).toBe(false);
    });

    it("duas chamadas simultâneas com a mesma chave: uma versão só e resultados iguais", async () => {
      const { publisher } = await make();
      const [a, b] = await Promise.all([publisher.publish(request()), publisher.publish(request())]);
      expect(b).toEqual(a);
      const next = await publisher.publish(request({ idempotencyKey: "10000000-0000-4000-8000-0000000000c7", submissionId: "10000000-0000-4000-8000-0000000000c7" }));
      expect(next.previousVersionId).toBe(a.newVersionId);
    });

    it("erro transitório é tipado (PortError com transient true) e a repetição da mesma chave depois funciona", async () => {
      const h = await make();
      await h.failNextTransiently();
      const e = await rejection(h.publisher.publish(request()));
      expect(e.name).toBe("PortError");
      expect(e.transient).toBe(true);
      expect(e.code).toMatch(/^[a-z][a-z0-9_]{0,59}$/);
      const ok = await h.publisher.publish(request());
      expect(ok.newVersionId).toMatch(UUID);
    });

    it("mesma chave com payload diferente é recusada com erro permanente", async () => {
      const { publisher } = await make();
      await publisher.publish(request());
      const e = await rejection(publisher.publish(request({ gradeSlug: "ef-5" })));
      expect(e.name).toBe("PortError");
      expect(e.transient).toBe(false);
      const e2 = await rejection(publisher.publish(request({ items: [{ position: 1, originalName: "Outro", normalizedName: "outro", category: "papelaria", quantity: 1, unit: null, confidence: 0.9 }] })));
      expect(e2.transient).toBe(false);
    });

    // S10: publicação humana. A porta real (S11) precisa aceitar ator admin, origem parent_upload e chave = id da versão aprovada.
    it("aceita ator admin e origem parent_upload, com chave própria (id da versão aprovada)", async () => {
      const { publisher } = await make();
      const admin = { kind: "admin" as const, profileId: "00000000-0000-4000-8000-000000000003" };
      const versionId = "80000000-0000-4000-8000-0000000000d1";
      const a = await publisher.publish(request({ idempotencyKey: versionId, actor: admin, source: "parent_upload" }));
      expect(a.newVersionId).toMatch(UUID);
      expect(await publisher.publish(request({ idempotencyKey: versionId, actor: admin, source: "parent_upload" }))).toEqual(a);
    });

    it("a chave da versão aprovada é distinta da chave automática: mesma lista, nova versão, versão anterior encadeada", async () => {
      const { publisher } = await make();
      const auto = await publisher.publish(request());
      const humano = await publisher.publish(
        request({ idempotencyKey: "80000000-0000-4000-8000-0000000000d2", actor: { kind: "admin", profileId: "00000000-0000-4000-8000-000000000003" }, source: "school_upload" }),
      );
      expect(humano.listId).toBe(auto.listId);
      expect(humano.previousVersionId).toBe(auto.newVersionId);
    });
  });
}
