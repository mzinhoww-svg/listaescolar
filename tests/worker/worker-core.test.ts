import { describe, expect, it, vi } from "vitest";

import {
  createRpcWorkerJobs,
  detectMime,
  handleTick,
  nextDelaySeconds,
  processJob,
  processMessage,
  sanitizeError,
  type ClaimResult,
  type WorkerDeps,
  type WorkerInput,
  type WorkerJobRow,
  type WorkerJobs,
  type WorkerQueue,
} from "../../supabase/functions/_shared/worker-core";
import { extractionResultSchema } from "../../supabase/functions/_shared/extraction-schema";
import { FakeClock } from "../helpers/fake-clock";
import { pdf } from "../helpers/files";

const LEASE_MS = 5 * 60_000;

type FakeJob = { status: string; attempts: number; maxAttempts: number; runAfter: number; lockedAt: number | null; submissionId: string | null };

/** Emula as funções SQL jobs_* (claim atômico, lease de 5 min, fail com retry/dead). */
function fakeJobsDb(clock: FakeClock) {
  const jobs = new Map<string, FakeJob>();
  const failRequeue = { on: false };
  const effects: string[] = [];
  const api: WorkerJobs = {
    async get(id) {
      const j = jobs.get(id);
      if (!j) return null;
      return {
        id,
        status: j.status,
        attempts: j.attempts,
        maxAttempts: j.maxAttempts,
        submissionId: j.submissionId,
        runAfter: new Date(j.runAfter).toISOString(),
      } satisfies WorkerJobRow;
    },
    async claim(id): Promise<ClaimResult> {
      const j = jobs.get(id);
      if (!j || j.status === "succeeded" || j.status === "dead") return "finished";
      const leaseValid = j.lockedAt !== null && j.lockedAt > clock.now() - LEASE_MS;
      if (j.status === "running" && leaseValid) return "busy";
      if (j.status !== "running" && j.runAfter > clock.now()) return "not_due";
      j.status = "running";
      j.attempts += 1;
      j.lockedAt = clock.now();
      return "claimed";
    },
    async complete(id, _result, _ms, fence) {
      const j = jobs.get(id)!;
      if (j.status !== "running" || j.attempts !== fence.attempts) return; // fencing por tentativa
      j.status = "succeeded";
      effects.push(`complete:${id}`);
      if (fence.isDemo) effects.push(`demo:${id}`);
    },
    async fail(id, _e, retryIn, permanent, attempts) {
      const j = jobs.get(id)!;
      if (j.status !== "running") return j.status;
      if (attempts !== undefined && j.attempts !== attempts) return j.status; // fencing por tentativa
      if (permanent || j.attempts >= j.maxAttempts) {
        j.status = "dead";
        effects.push(`dead:${id}`);
      } else {
        j.status = "retrying";
        j.runAfter = clock.now() + retryIn * 1000;
      }
      j.lockedAt = null;
      return j.status;
    },
    async requeueStale() {
      effects.push("requeueStale");
      if (failRequeue.on) throw new Error("banco fora");
    },
  };
  const add = (id: string, over: Partial<FakeJob> = {}) =>
    jobs.set(id, { status: "queued", attempts: 0, maxAttempts: 5, runAfter: 0, lockedAt: null, submissionId: `sub-${id}`, ...over });
  return { api, jobs, effects, add, failRequeue };
}

const GOOD: WorkerInput = { bytes: pdf(), mime: "application/pdf", fileName: "lista.pdf" };
const RESULT = { items: [], overallConfidence: 1, warnings: [] };

function setup(over: { extract?: WorkerDeps["pipeline"]["extract"]; input?: WorkerInput | null; isDemo?: boolean } = {}) {
  const clock = new FakeClock();
  const db = fakeJobsDb(clock);
  db.add("j1");
  const extract = vi.fn(over.extract ?? (async () => RESULT));
  const deps: WorkerDeps = {
    jobs: db.api,
    pipeline: { extract, isDemo: over.isDemo },
    resultSchema: extractionResultSchema,
    loadInput: async () => (over.input === undefined ? GOOD : over.input),
    clock,
  };
  return { clock, db, extract, deps };
}

describe("nextDelaySeconds", () => {
  it.each([
    [1, 30],
    [2, 60],
    [3, 120],
    [4, 240],
    [5, 480],
    [6, 900],
    [7, 900],
    [50, 900],
    [0, 30],
  ])("tentativa %i -> %i s", (attempt, expected) => {
    expect(nextDelaySeconds(attempt)).toBe(expected);
  });
  it("jitter limitado a 20% e nunca acima do teto", () => {
    expect(nextDelaySeconds(1, 0.5)).toBe(33);
    expect(nextDelaySeconds(1, 5)).toBeLessThanOrEqual(36);
    expect(nextDelaySeconds(6, 0.99)).toBe(900);
  });
  it("determinístico", () => {
    expect(nextDelaySeconds(3, 0.3)).toBe(nextDelaySeconds(3, 0.3));
  });
});

describe("processJob", () => {
  it("sucesso: done, um único efeito", async () => {
    const { deps, db, extract } = setup();
    await expect(processJob("j1", deps)).resolves.toBe("done");
    expect(db.jobs.get("j1")?.status).toBe("succeeded");
    expect(db.effects).toEqual(["complete:j1"]);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("duplicado (já concluído): skipped, ack e sem novo processamento", async () => {
    const { deps, extract } = setup();
    await processJob("j1", deps);
    const again = await processMessage("j1", deps);
    expect(again).toEqual({ outcome: "skipped", ack: true });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("job removido: skipped com ack", async () => {
    const { deps } = setup();
    expect(await processMessage("nao-existe", deps)).toEqual({ outcome: "skipped", ack: true });
  });

  it("falha transitória: retry com atraso crescente até o teto, sem ack", async () => {
    const { deps, db, clock } = setup({ extract: async () => { throw new Error("provedor fora"); } });
    db.jobs.get("j1")!.maxAttempts = 10;
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await processMessage("j1", deps);
      expect(r.outcome).toBe("retry");
      expect(r.ack).toBe(false);
      delays.push(r.retryInSeconds!);
      clock.advance(r.retryInSeconds! * 1000);
    }
    expect(delays).toEqual([30, 60, 120, 240, 480, 900, 900]);
    expect(db.jobs.get("j1")?.status).toBe("retrying");
  });

  it("antes da hora (not_due): não confirma e reagenda até run_after", async () => {
    const { deps, db, clock, extract } = setup({ extract: async () => { throw new Error("x"); } });
    await processMessage("j1", deps); // -> retrying, run_after = +30 s
    clock.advance(10_000);
    const r = await processMessage("j1", deps);
    expect(r).toEqual({ outcome: "skipped", ack: false, retryInSeconds: 20 });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(db.jobs.get("j1")?.attempts).toBe(1);
  });

  it("esgotamento: última tentativa vira dead, com ack (a DLQ é feita no banco)", async () => {
    const { deps, db, clock } = setup({ extract: async () => { throw new Error("sempre falha"); } });
    db.jobs.get("j1")!.maxAttempts = 3;
    const outcomes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await processMessage("j1", deps);
      outcomes.push(`${r.outcome}:${r.ack}`);
      clock.advance(900_000);
    }
    expect(outcomes).toEqual(["retry:false", "retry:false", "dead:true"]);
    expect(db.jobs.get("j1")?.status).toBe("dead");
    expect(await processMessage("j1", deps)).toEqual({ outcome: "skipped", ack: true });
  });

  it("arquivo armazenado inválido (magic bytes): dead direto, motivo invalid_file, pipeline não roda", async () => {
    const { deps, db, extract } = setup({ input: { ...GOOD, bytes: new TextEncoder().encode("MZ....") } });
    const failSpy = vi.spyOn(deps.jobs, "fail");
    expect(await processMessage("j1", deps)).toEqual({ outcome: "dead", ack: true });
    expect(failSpy).toHaveBeenCalledWith("j1", "invalid_file", 30, true, 1);
    expect(db.jobs.get("j1")?.status).toBe("dead");
    expect(extract).not.toHaveBeenCalled();
  });

  it("arquivo ausente no storage: falha transitória (retry)", async () => {
    const { deps } = setup({ input: null });
    expect((await processMessage("j1", deps)).outcome).toBe("retry");
  });

  it("estouro do tempo do worker: cancela o pipeline e entra em retry", async () => {
    let signal: AbortSignal | undefined;
    const { deps, clock } = setup({
      extract: (_i, o) => {
        signal = o.signal;
        return new Promise(() => undefined);
      },
    });
    const run = processMessage("j1", { ...deps, timeoutMs: 90_000 });
    await vi.waitFor(() => expect(clock.pending()).toBe(1));
    clock.advance(90_000);
    expect((await run).outcome).toBe("retry");
    expect(signal?.aborted).toBe(true);
  });

  it("saída inválida do pipeline: nunca chega ao jobs_complete; falha com retry", async () => {
    const bad = [{ items: "x" }, { items: [], overallConfidence: 3, warnings: [] }, null, "texto"];
    for (const value of bad) {
      const { deps, db } = setup({ extract: async () => value });
      const completeSpy = vi.spyOn(deps.jobs, "complete");
      const r = await processMessage("j1", deps);
      expect(r).toMatchObject({ outcome: "retry", ack: false });
      expect(completeSpy).not.toHaveBeenCalled();
      expect(db.jobs.get("j1")?.status).toBe("retrying");
    }
  });

  it("entrega ao complete o resultado JÁ validado (sem campos extras) e o marcador de demonstração", async () => {
    const { deps } = setup({ isDemo: true, extract: async () => ({ ...RESULT, extra: "x" }) });
    const completeSpy = vi.spyOn(deps.jobs, "complete");
    await processMessage("j1", deps);
    expect(completeSpy).toHaveBeenCalledWith("j1", RESULT, expect.any(Number), { attempts: 1, isDemo: true });
  });

  it("pipeline real não marca demonstração", async () => {
    const { deps, db } = setup();
    await processMessage("j1", deps);
    expect(db.effects).toEqual(["complete:j1"]);
  });

  it("fencing: worker antigo (lease vencida, outro assumiu) não conclui nem falha o job do novo", async () => {
    const { deps, db, clock } = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    deps.pipeline = { extract: async () => { calls += 1; if (calls === 1) await gate; return RESULT; } };
    const stale = processMessage("j1", deps); // tentativa 1, fica presa
    await vi.waitFor(() => expect(calls).toBe(1));
    clock.advance(LEASE_MS + 1);
    expect((await processMessage("j1", deps)).outcome).toBe("done"); // tentativa 2 conclui
    expect(db.jobs.get("j1")?.attempts).toBe(2);
    release();
    await stale; // tentativa 1 termina depois: no-op
    expect(db.effects.filter((e) => e.startsWith("complete"))).toHaveLength(1);
    expect(db.jobs.get("j1")?.status).toBe("succeeded");
  });

  it("dois workers na mesma mensagem: só um processa, o outro vê busy (sem ack, vt 60 s)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { deps, extract, db } = setup({ extract: async () => { await gate; return RESULT; } });
    const a = processMessage("j1", deps);
    await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(1));
    const b = await processMessage("j1", deps);
    expect(b).toEqual({ outcome: "skipped", ack: false, retryInSeconds: 60 });
    release();
    expect((await a).outcome).toBe("done");
    expect(extract).toHaveBeenCalledTimes(1);
    expect(db.effects.filter((e) => e.startsWith("complete"))).toHaveLength(1);
  });

  it("worker que caiu no meio: lease vence (5 min) e outro assume", async () => {
    const { deps, db, clock } = setup();
    await db.api.claim("j1"); // "crash": ficou running
    expect((await processMessage("j1", deps)).ack).toBe(false); // busy
    clock.advance(LEASE_MS + 1);
    expect((await processMessage("j1", deps)).outcome).toBe("done");
    expect(db.jobs.get("j1")?.attempts).toBe(2);
  });
});

function fakeQueue(clock: FakeClock, ids: (string | null)[]) {
  const msgs = ids.map((jobId, i) => ({ msgId: i + 1, jobId, visibleAt: 0, reads: 0 }));
  const acked: number[] = [];
  const vts: Record<number, number> = {};
  const queue: WorkerQueue = {
    async read(qty, vt) {
      const out = msgs.filter((m) => m.visibleAt <= clock.now()).slice(0, qty);
      for (const m of out) {
        m.visibleAt = clock.now() + vt * 1000;
        m.reads += 1;
      }
      return out.map((m) => ({ msgId: m.msgId, readCount: m.reads, jobId: m.jobId }));
    },
    async ack(id) {
      acked.push(id);
      const i = msgs.findIndex((m) => m.msgId === id);
      if (i >= 0) msgs.splice(i, 1);
    },
    async setVt(id, vt) {
      vts[id] = vt;
      const m = msgs.find((x) => x.msgId === id);
      if (m) m.visibleAt = clock.now() + vt * 1000;
    },
  };
  return { queue, acked, vts, msgs };
}

describe("handleTick", () => {
  it("chama requeueStale antes de ler, confirma o que terminou e reagenda o retry", async () => {
    const { deps, db, clock } = setup();
    db.add("j2");
    db.jobs.get("j2")!.submissionId = null; // falha
    const q = fakeQueue(clock, ["j1", "j2", null]);
    const s = await handleTick(q.queue, deps);
    expect(db.effects[0]).toBe("requeueStale");
    expect(s).toMatchObject({ read: 3, done: 1, retry: 1, skipped: 1, errors: 0 });
    expect(q.acked.sort()).toEqual([1, 3]); // j1 concluída; mensagem sem job_id descartada
    expect(q.vts[2]).toBe(30);
  });

  it("crash depois de processar e antes do ack: a reentrega não repete o efeito", async () => {
    const { deps, db, clock, extract } = setup();
    const q = fakeQueue(clock, ["j1"]);
    // processa, mas o ack falha (crash antes de confirmar)
    const crashing = { ...q.queue, ack: async () => { throw new Error("crash"); } };
    const first = await handleTick(crashing, deps, { vtSeconds: 60 });
    expect(first).toMatchObject({ done: 1, errors: 1 });
    clock.advance(61_000); // vt expira: a mensagem volta
    const second = await handleTick(q.queue, deps, { vtSeconds: 60 });
    expect(second).toMatchObject({ read: 1, skipped: 1, done: 0 });
    expect(q.acked).toEqual([1]);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(db.effects.filter((e) => e.startsWith("complete"))).toHaveLength(1);
  });

  it("erro de infraestrutura em uma mensagem não derruba as outras nem confirma", async () => {
    const { deps, db, clock } = setup();
    db.add("j2");
    const boom = { ...deps, loadInput: vi.fn(async (sub: string) => { if (sub === "sub-j1") throw new Error("rede"); return GOOD; }) };
    const q = fakeQueue(clock, ["j1", "j2"]);
    const s = await handleTick(q.queue, boom);
    expect(s).toMatchObject({ errors: 1, done: 1 });
    expect(q.acked).toEqual([2]);
  });
});

describe("handleTick: prazo, lote e erros", () => {
  it("prazo do tick: depois dele não reivindica novas mensagens e devolve as lidas à fila", async () => {
    const { deps, db, clock } = setup({ extract: async () => { clock.advance(95_000); return RESULT; } });
    db.add("j2");
    db.add("j3");
    const q = fakeQueue(clock, ["j1", "j2", "j3"]);
    const s = await handleTick(q.queue, deps, { batch: 3 });
    expect(s).toMatchObject({ read: 3, done: 1, deferred: 2 });
    expect(db.jobs.get("j2")?.status).toBe("queued"); // nunca reivindicado (sem tentativa gasta)
    expect(db.jobs.get("j2")?.attempts).toBe(0);
    expect(q.acked).toEqual([1]);
    expect(q.vts[2]).toBeLessThanOrEqual(10);
    expect(q.vts[3]).toBeLessThanOrEqual(10);
  });

  it("o teto de cada extração respeita o que resta do prazo do tick", async () => {
    const { deps, db, clock } = setup({ extract: async () => { clock.advance(60_000); return RESULT; } });
    db.add("j2");
    const seen: number[] = [];
    deps.clock = { now: () => clock.now(), delay: (ms, sig) => { seen.push(ms); return clock.delay(ms, sig); } };
    const q = fakeQueue(clock, ["j1", "j2"]);
    await handleTick(q.queue, deps, { batch: 2, deadlineMs: 100_000 });
    expect(seen).toEqual([90_000, 40_000]); // 1ª: teto normal; 2ª: o que resta de 100 s
  });

  it("lote padrão é 3", async () => {
    const { deps, clock } = setup();
    const reads: number[] = [];
    const q = fakeQueue(clock, []);
    const wrapped = { ...q.queue, read: async (qty: number, vt: number) => { reads.push(qty); return q.queue.read(qty, vt); } };
    await handleTick(wrapped, deps);
    expect(reads).toEqual([3]);
  });

  it("falha do requeueStale não aborta o tick: segue lendo e processando, e registra sem PII", async () => {
    const { deps, db, clock } = setup();
    db.failRequeue.on = true;
    const errors: { stage: string; message: string }[] = [];
    const q = fakeQueue(clock, ["j1"]);
    const s = await handleTick(q.queue, deps, { onError: (e) => errors.push(e) });
    expect(s).toMatchObject({ read: 1, done: 1, errors: 1 });
    expect(errors).toEqual([{ stage: "requeue", message: expect.stringContaining("banco fora") }]);
  });

  it("erro de infra por mensagem é registrado sanitizado (sem e-mail nem número longo)", async () => {
    const { deps, clock } = setup();
    const boom = { ...deps, loadInput: async () => { throw new Error("rede ana@escola.com 12345678901"); } };
    const errors: { stage: string; jobId?: string; message: string }[] = [];
    const q = fakeQueue(clock, ["j1"]);
    const s = await handleTick(q.queue, boom, { onError: (e) => errors.push(e) });
    expect(s.errors).toBe(1);
    expect(errors[0]).toMatchObject({ stage: "message", jobId: "j1" });
    expect(errors[0]?.message).not.toMatch(/ana@escola|12345678901/);
  });
});

describe("utilitários", () => {
  it("sanitizeError: controle antes de tudo, tokens, JWT, Bearer e URLs com query", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF123_-xyz";
    // montado em tempo de execução: o literal completo dispararia a varredura de segredos do GitHub
    const fakeKey = ["sk", "live", "ABCDEFGHIJKLMNOPQRSTUV12"].join("_");
    const out = sanitizeError(new Error(`Bearer abc.def-123\u0000 ${jwt} https://x.co/a?token=SEGREDO&b=1 chave ${fakeKey}`));
    expect(out).not.toMatch(/eyJ|SEGREDO|abc\.def|ABCDEFGHIJKLMNOPQRSTUV12/);
    expect(out).not.toMatch(/[\u0000-\u001f]/);
    expect(sanitizeError("ab ".repeat(200)).length).toBe(300);
    expect(sanitizeError({ toString: () => "obj" })).toBe("obj");
  });
  it("sanitizeError remove e-mail e números longos e trunca", () => {
    const out = sanitizeError(new Error(`falhou para ana@escola.com cpf 12345678901 ${"x".repeat(500)}`));
    expect(out).not.toContain("ana@escola.com");
    expect(out).not.toContain("12345678901");
    expect(out.length).toBeLessThanOrEqual(300);
  });
  it("detectMime", () => {
    expect(detectMime(pdf())).toBe("application/pdf");
    expect(detectMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("adaptador RPC de jobs_fail", () => {
  it("envia p_permanent (padrão false) e devolve o status", async () => {
    const calls: { fn: string; args?: Record<string, unknown> }[] = [];
    const jobs = createRpcWorkerJobs(
      async (fn, args) => {
        calls.push({ fn, args });
        return { data: "dead", error: null };
      },
      async () => null,
    );
    expect(await jobs.fail("j1", "invalid_file", 30, true, 2)).toBe("dead");
    await jobs.fail("j1", "x", 30);
    expect(calls[0]?.args).toMatchObject({ p_job_id: "j1", p_permanent: true, p_attempts: 2 });
    expect(calls[1]?.args).toMatchObject({ p_permanent: false, p_attempts: null });
  });
  it("jobs_complete leva a tentativa (fencing) e o marcador de demonstração", async () => {
    const calls: { fn: string; args?: Record<string, unknown> }[] = [];
    const jobs = createRpcWorkerJobs(async (fn, args) => { calls.push({ fn, args }); return { data: null, error: null }; }, async () => null);
    await jobs.complete("j1", RESULT, 12, { attempts: 3, isDemo: true });
    expect(calls[0]).toEqual({ fn: "jobs_complete", args: { p_job_id: "j1", p_result: RESULT, p_duration_ms: 12, p_attempts: 3, p_is_demo: true } });
  });
});
