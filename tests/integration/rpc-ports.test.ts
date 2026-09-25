import { describe, expect, it, vi } from "vitest";
import { PortError, type PublishRequest } from "../../supabase/functions/_shared/publication/ports";
import { createRpcListPublisher, createRpcPublicationContextReader, resolveSchoolYears, SCHOOL_YEAR_LOOKAHEAD, SCHOOL_YEAR_TIMEZONE, type PortsRpc } from "../../supabase/functions/_shared/publication/rpc-ports";

const U = "10000000-0000-4000-8000-0000000000c1";
const V = "20000000-0000-4000-8000-0000000000c2";
const L = "30000000-0000-4000-8000-0000000000c3";
const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({
  idempotencyKey: U,
  submissionId: U,
  schoolId: "50000000-0000-4000-8000-0000000000c1",
  gradeSlug: "ef-4",
  schoolYear: 2027,
  source: "school_upload",
  actor: { kind: "system" },
  items: [{ position: 1, originalName: "Caderno", normalizedName: "caderno", category: "papelaria", quantity: 2, unit: "un", confidence: null, origin: "reviewed" }],
  ...over,
});
const rpcOf = (fn: (name: string, args?: Record<string, unknown>) => unknown): PortsRpc => ({ rpc: vi.fn(fn) as never });
const ok = (data: unknown) => Promise.resolve({ data, error: null });
const err = (error: unknown) => Promise.resolve({ data: null, error });
async function rejected(p: Promise<unknown>): Promise<PortError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(PortError);
    return e as PortError;
  }
  throw new Error("deveria rejeitar");
}

describe("resolveSchoolYears (ano corrente e o seguinte em America/Cuiaba)", () => {
  it("constantes nomeadas", () => {
    expect(SCHOOL_YEAR_TIMEZONE).toBe("America/Cuiaba");
    expect(SCHOOL_YEAR_LOOKAHEAD).toBe(1);
  });
  it("meio do ano", () => expect(resolveSchoolYears(new Date("2026-09-25T12:00:00Z"))).toEqual([2026, 2027]));
  it("virada de ano segue o fuso (UTC-4), não o UTC", () => {
    expect(resolveSchoolYears(new Date("2027-01-01T03:59:59Z"))).toEqual([2026, 2027]); // 23:59:59 de 31/12 em Cuiabá
    expect(resolveSchoolYears(new Date("2027-01-01T04:00:00Z"))).toEqual([2027, 2028]); // 00:00 de 01/01 em Cuiabá
    expect(resolveSchoolYears(new Date("2026-12-31T23:59:59Z"))).toEqual([2026, 2027]);
  });
});

describe("ListPublisher (RPC)", () => {
  it("monta o pedido: chave, ator system sem actorId, ator admin com actorId, itens intactos (confiança nula e origin)", async () => {
    const rpc = rpcOf(() => ok({ listId: L, previousVersionId: null, newVersionId: V, replay: false }));
    const p = createRpcListPublisher(rpc);
    expect(await p.publish(req())).toEqual({ listId: L, previousVersionId: null, newVersionId: V });
    const sent = (rpc.rpc as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(sent[0]).toBe("list_publish_from_pipeline");
    expect(sent[1].p_request).toMatchObject({ key: U, submissionId: U, actor: "system", items: [{ confidence: null, origin: "reviewed" }] });
    expect(sent[1].p_request).not.toHaveProperty("actorId");
    await p.publish(req({ actor: { kind: "admin", profileId: V } }));
    expect((rpc.rpc as ReturnType<typeof vi.fn>).mock.calls[1]![1].p_request).toMatchObject({ actor: "admin", actorId: V });
  });

  it.each(["invalid_request", "invalid_items", "no_items", "invalid_actor", "system_profile_missing", "school_not_found", "school_suspended", "grade_unknown", "demo_mismatch", "idempotency_conflict", "list_archived", "list_state_conflict"])(
    "hint %s -> PortError permanente com o próprio código",
    async (hint) => {
      const e = await rejected(createRpcListPublisher(rpcOf(() => err({ code: "22023", hint, message: "detalhe do banco" }))).publish(req()));
      expect(e).toMatchObject({ code: hint, transient: false });
      expect(e.message).toBe(hint); // sem eco da mensagem do banco
    },
  );

  it.each([
    ["rede (exceção)", () => Promise.reject(new TypeError("fetch failed"))],
    ["serialization_failure 40001", () => err({ code: "40001", message: "x" })],
    ["deadlock 40P01", () => err({ code: "40P01", message: "x" })],
    ["timeout 57014", () => err({ code: "57014", message: "canceling statement" })],
    ["hint desconhecido (não é da função)", () => err({ code: "PGRST202", hint: "Perhaps you meant to call another function" })],
    ["erro sem hint", () => err({ message: "boom" })],
  ])("%s -> PortError transitório (vale repetir)", async (_n, fn) => {
    const e = await rejected(createRpcListPublisher(rpcOf(fn)).publish(req()));
    expect(e).toMatchObject({ code: "publish_unavailable", transient: true });
  });

  it.each([null, {}, { listId: "x", previousVersionId: null, newVersionId: V }, { listId: L, previousVersionId: null, newVersionId: V, extra: 1 }])("resultado inválido %j -> invalid_publish_result permanente", async (data) => {
    expect(await rejected(createRpcListPublisher(rpcOf(() => ok(data))).publish(req()))).toMatchObject({ code: "invalid_publish_result", transient: false });
  });

  it("signal já abortado: não chama o banco; abortado durante a chamada: rejeita como transitório e pede abortSignal ao cliente", async () => {
    const rpc = rpcOf(() => ok(null));
    const done = new AbortController();
    done.abort();
    expect(await rejected(createRpcListPublisher(rpc).publish(req({ signal: done.signal })))).toMatchObject({ code: "publish_aborted", transient: true });
    expect(rpc.rpc).not.toHaveBeenCalled();

    const live = new AbortController();
    const abortSignal = vi.fn((s: AbortSignal) => new Promise(() => s.addEventListener("abort", () => undefined)));
    const hanging = { rpc: () => Object.assign(new Promise(() => undefined), { abortSignal }) } as unknown as PortsRpc;
    const p = rejected(createRpcListPublisher(hanging).publish(req({ signal: live.signal })));
    live.abort();
    expect(await p).toMatchObject({ code: "publish_aborted", transient: true });
    expect(abortSignal).toHaveBeenCalledWith(live.signal);
  });
});

describe("PublicationContextReader (RPC)", () => {
  const good = { school: { verification: "verified", municipalityEnabled: true }, gradeSlug: "ef-4", submitterLinked: true, currentList: { listId: L, status: "published", currentVersionId: V } };
  const q = { schoolId: "50000000-0000-4000-8000-0000000000c1", grade: "4º ano", schoolYear: 2027, submittedBy: U };

  it("devolve o contexto com os anos válidos calculados no fuso do ano letivo", async () => {
    const r = createRpcPublicationContextReader(rpcOf(() => ok(good)), { now: () => new Date("2027-01-01T04:00:00Z") });
    expect(await r.load(q)).toEqual({ ...good, validSchoolYears: [2027, 2028] });
  });
  it("chama publication_context com a consulta e nada além dela", async () => {
    const rpc = rpcOf(() => ok(good));
    await createRpcPublicationContextReader(rpc).load(q);
    expect(rpc.rpc).toHaveBeenCalledWith("publication_context", { p_query: q });
  });
  it("erro do banco/rede é transitório; resposta fora do formato é permanente (context_invalid)", async () => {
    expect(await rejected(createRpcPublicationContextReader(rpcOf(() => err({ code: "40001" }))).load(q))).toMatchObject({ code: "context_unavailable", transient: true });
    expect(await rejected(createRpcPublicationContextReader(rpcOf(() => Promise.reject(new Error("x")))).load(q))).toMatchObject({ transient: true });
    expect(await rejected(createRpcPublicationContextReader(rpcOf(() => ok({ ...good, extra: 1 }))).load(q))).toMatchObject({ code: "context_invalid", transient: false });
    expect(await rejected(createRpcPublicationContextReader(rpcOf(() => ok({ ...good, school: { verification: "x", municipalityEnabled: true } }))).load(q))).toMatchObject({ code: "context_invalid" });
  });
});
