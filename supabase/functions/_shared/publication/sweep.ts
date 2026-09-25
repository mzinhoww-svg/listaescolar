// Varredor: decide os envios parados (state decide) e retoma os `approved` sem publicação (state publish).
// Roda no fim do tick do worker (também sem pipeline). Erro de um envio não derruba os demais.
import { decideListPublication, resumePublication, type PublicationDeps } from "./decide.ts";

export type SweepSummary = { found: number; handled: number; skipped: number; errors: number };

/** Só toca em envio com esta idade mínima: dá tempo à decisão inline (Server Action e worker) de terminar. */
export const SWEEP_MIN_AGE_SECONDS = 30;
/** Não começa um envio se restam menos que isto do prazo. */
export const SWEEP_MIN_ITEM_WINDOW_MS = 10_000;

/** `deadlineMs`: orçamento total desta varredura, contado do início. Erro do `pending` propaga (o tick o registra). */
export async function runPublicationSweep(
  deps: PublicationDeps,
  opts: { limit: number; deadlineMs: number; minAgeSeconds?: number },
): Promise<SweepSummary> {
  const start = deps.clock.now();
  const rows = await deps.store.pending(opts.limit, opts.minAgeSeconds ?? SWEEP_MIN_AGE_SECONDS);
  const summary: SweepSummary = { found: rows.length, handled: 0, skipped: 0, errors: 0 };
  for (const row of rows) {
    if (opts.deadlineMs - (deps.clock.now() - start) < SWEEP_MIN_ITEM_WINDOW_MS) {
      summary.skipped += 1;
      continue;
    }
    try {
      await (row.state === "decide" ? decideListPublication(row.submissionId, deps) : resumePublication(row.submissionId, deps));
      summary.handled += 1;
    } catch {
      summary.errors += 1; // sem PII: o varredor repete no próximo tick
    }
  }
  return summary;
}
