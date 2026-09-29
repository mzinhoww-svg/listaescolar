import type { KeyLookupRow } from "../keys/verify";
import type { UsageStatusClass } from "./usage";

/**
 * D-158 (S19): tipos de `handler.ts` extraídos para um arquivo próprio, para `deps-real.ts` (implementação real
 * de `ApiHandlerDeps`) poder importá-los sem depender de `handler.ts` (evita import circular).
 */

export type RateConsumeResult = {
  allowed: boolean;
  keyValid: boolean;
  windowKind: "minute" | "day" | null;
  limitValue: number | null;
  remaining: number | null;
  resetAt: Date | null;
};

export type ApiHandlerDeps = {
  pepper: () => string | undefined;
  /** `signal` (achado 3, revisão de segurança independente): quando o timeout vence, o `AbortController` de dentro
   * do pipeline chama `.abort()` de verdade nele — a implementação real (`realLookupKey`) encaminha para
   * `.abortSignal()` do supabase-js, cancelando a consulta no Postgres/PostgREST, não só ignorando a resposta tarde. */
  lookupKey: (publicId: string, signal?: AbortSignal) => Promise<KeyLookupRow | null>;
  consumeRate: (keyId: string, signal?: AbortSignal) => Promise<RateConsumeResult>;
  recordUsage: (info: { keyId: string; endpoint: string; statusClass: UsageStatusClass; matchTotal?: number; matchMatched?: number }) => Promise<void>;
  /** `next/server`'s `after()` em produção; nos testes de domínio, uma função-espiã síncrona. */
  after: (cb: () => void | Promise<void>) => void;
  now: () => Date;
  requestId: () => string;
  timeoutMs: number;
};
