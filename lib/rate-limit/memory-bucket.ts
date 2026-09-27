import "server-only";

// Balde de taxa em memória, por instância (S25, rotas públicas do widget). Mesma ressalva já registrada para a
// API B2B (S24/PROGRESS): esta é só a PRIMEIRA camada (contém o caso comum); o limite de verdade entre todas as
// instâncias/lambdas é o Firewall da Vercel, configurado pelo humano. Teto de chaves rastreadas para nunca
// crescer sem limite (mesmo padrão do limitador por IP da API B2B).

export const MAX_TRACKED_KEYS = 10_000;
type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, b] of buckets) {
    if (now - b.windowStart >= windowMs) buckets.delete(key);
  }
}

/** `true` = permitido (e já contabilizado); `false` = acima do limite (não contabiliza de novo). */
export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    if (!buckets.has(key) && buckets.size >= MAX_TRACKED_KEYS) {
      pruneExpired(now, windowMs);
      // Revisão de segurança (Menor): ainda cheio (muitas chaves distintas ativas ao mesmo tempo) — despeja só a
      // mais ANTIGA (primeira do `Map`, que preserva ordem de inserção) para abrir uma vaga, nunca `clear()`
      // global (que descartaria a contagem em andamento de todo mundo, inclusive quem nem estava perto do limite).
      if (buckets.size >= MAX_TRACKED_KEYS) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }
    }
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Só para testes. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
