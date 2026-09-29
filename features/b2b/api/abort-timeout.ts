import "server-only";

/**
 * D-158 (S19): extraído de handler.ts (549 linhas) — sem mudança de comportamento, só posição.
 *
 * Timeout com cancelamento de verdade via `AbortSignal` (achado 3, revisão de segurança independente; rodada 2,
 * achado D, estendeu o uso para o `impl` de cada endpoint, não só `lookupKey`/`consumeRate`): quando o timeout
 * vence, aborta de verdade o `AbortController` (a chamada real ao Postgres/PostgREST é cancelada via
 * `.abortSignal()` do supabase-js, não só ignorada depois de resolver em segundo plano).
 */
export class TimeoutError extends Error {}

export function withAbortTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError("tempo esgotado"));
    }, ms);
    fn(controller.signal).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
