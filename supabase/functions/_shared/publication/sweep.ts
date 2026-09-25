// Varredor: decide os envios parados (state decide) e retoma os `approved` sem publicação (state publish).
// Roda no fim do tick do worker (também sem pipeline). Erro de um envio não derruba os demais.
import { asPortError } from "./ports.ts";
import { decideListPublication, resumePublication, type PublicationDeps } from "./decide.ts";

export type SweepSummary = { found: number; handled: number; skipped: number; errors: number };

/** Só toca em envio com esta idade mínima: dá tempo à decisão inline (Server Action e worker) de terminar. */
export const SWEEP_MIN_AGE_SECONDS = 30;
/**
 * Não começa um envio se restam menos que isto do prazo. O envio recebe o que resta como `budgetMs`: o teto da
 * chamada à porta é min(45 s, restante) e, abaixo de `MIN_PUBLISH_WINDOW_MS`, a porta nem é chamada. (No worker o
 * prazo do tick é `TICK_DEADLINE_MS` = 100 s.)
 */
export const SWEEP_MIN_ITEM_WINDOW_MS = 10_000;

/** `deadlineMs`: orçamento total desta varredura, contado do início. Erro do `pending` propaga (o tick o registra). */
export async function runPublicationSweep(
  deps: PublicationDeps,
  opts: {
    limit: number;
    deadlineMs: number;
    minAgeSeconds?: number;
    /** Erro de um envio: só código e id (nunca conteúdo, mensagem ou stack). */
    onError?: (e: { code: string; submissionId: string }) => void;
  },
): Promise<SweepSummary> {
  const start = deps.clock.now();
  const rows = await deps.store.pending(opts.limit, opts.minAgeSeconds ?? SWEEP_MIN_AGE_SECONDS);
  const summary: SweepSummary = { found: rows.length, handled: 0, skipped: 0, errors: 0 };
  for (const row of rows) {
    const left = opts.deadlineMs - (deps.clock.now() - start);
    if (left < SWEEP_MIN_ITEM_WINDOW_MS) {
      summary.skipped += 1;
      continue;
    }
    try {
      await (row.state === "decide"
        ? decideListPublication(row.submissionId, deps, { budgetMs: left })
        : resumePublication(row.submissionId, deps, { budgetMs: left }));
      summary.handled += 1;
    } catch (e) {
      summary.errors += 1; // o varredor repete no próximo tick
      try {
        opts.onError?.({ code: asPortError(e)?.code ?? "sweep_item_error", submissionId: row.submissionId });
      } catch {
        // o log nunca derruba o varredor
      }
    }
  }
  return summary;
}
