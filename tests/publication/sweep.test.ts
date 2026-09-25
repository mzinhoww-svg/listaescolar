import { describe, expect, it, vi } from "vitest";
import { decideListPublication } from "../../supabase/functions/_shared/publication/decide";
import { runPublicationSweep } from "../../supabase/functions/_shared/publication/sweep";
import type { PendingRow } from "../../supabase/functions/_shared/publication/ports";
import { SUBMISSION, kit, transient } from "./helpers";

describe("runPublicationSweep", () => {
  it("decide envio review_needed sem veredito (state decide)", async () => {
    const k = kit();
    k.clock.advance(60_000);
    const s = await runPublicationSweep(k.deps, { limit: 10, deadlineMs: 30_000 });
    expect(s).toMatchObject({ found: 1, handled: 1, errors: 0 });
    expect(k.store.status).toBe("published");
  });

  it("retoma envio approved (state publish) depois da lease", async () => {
    const k = kit({ publisher: { publish: async () => { throw transient("port_down"); } } });
    await decideListPublication(SUBMISSION, k.deps);
    expect(k.store.status).toBe("approved");
    k.deps.publisher = k.publisher;
    k.clock.advance(200_000);
    const s = await runPublicationSweep(k.deps, { limit: 10, deadlineMs: 30_000 });
    expect(s.handled).toBe(1);
    expect(k.store.status).toBe("published");
  });

  it("não reprocessa envio já decidido nem publicado", async () => {
    const k = kit();
    await decideListPublication(SUBMISSION, k.deps);
    k.clock.advance(60_000);
    expect(await runPublicationSweep(k.deps, { limit: 10, deadlineMs: 30_000 })).toMatchObject({ found: 0, handled: 0 });
    expect(k.publisher.calls).toHaveLength(1);
  });

  it("roda sem portas nem pipeline: registra human_review com publisher_unavailable", async () => {
    const k = kit({ context: null, publisher: null });
    k.clock.advance(60_000);
    await runPublicationSweep(k.deps, { limit: 10, deadlineMs: 30_000 });
    expect(k.store.rows[0]!.reasons).toEqual(expect.arrayContaining(["publisher_unavailable", "context_unavailable"]));
  });

  it("respeita o prazo: sem tempo restante não toca em nada", async () => {
    const k = kit();
    k.clock.advance(60_000);
    const spy = vi.spyOn(k.store, "loadInput");
    const s = await runPublicationSweep(k.deps, { limit: 10, deadlineMs: 0 });
    expect(s).toMatchObject({ handled: 0, skipped: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("erro de um envio (store fora do ar) é contado e não derruba o varredor", async () => {
    const k = kit();
    k.clock.advance(60_000);
    vi.spyOn(k.store, "loadInput").mockRejectedValueOnce(new Error("db down"));
    const s = await runPublicationSweep(k.deps, { limit: 10, deadlineMs: 30_000 });
    expect(s).toMatchObject({ found: 1, handled: 0, errors: 1 });
  });

  it("falha do próprio pending propaga (o tick registra em onError)", async () => {
    const k = kit();
    vi.spyOn(k.store, "pending").mockRejectedValueOnce(new Error("db down"));
    await expect(runPublicationSweep(k.deps, { limit: 10, deadlineMs: 30_000 })).rejects.toThrow("db down");
  });

  it("limite passado ao store e envios lentos consomem o prazo", async () => {
    const k = kit();
    const rows: PendingRow[] = [
      { submissionId: SUBMISSION, state: "decide", updatedAt: new Date(0).toISOString() },
      { submissionId: SUBMISSION, state: "decide", updatedAt: new Date(0).toISOString() },
    ];
    const pending = vi.spyOn(k.store, "pending").mockResolvedValue(rows);
    vi.spyOn(k.store, "loadInput").mockImplementation(async () => { k.clock.advance(20_000); return { ...(await k.store.input), status: "published" }; });
    const s = await runPublicationSweep(k.deps, { limit: 7, deadlineMs: 25_000 });
    expect(pending).toHaveBeenCalledWith(7, expect.any(Number));
    expect(s.handled).toBe(1);
    expect(s.skipped).toBe(1);
  });
});
