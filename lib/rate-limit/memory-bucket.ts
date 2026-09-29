import "server-only";

// Balde de taxa em memória, por instância (S25, rotas públicas do widget). Mesma ressalva já registrada para a
// API B2B (S24/PROGRESS): esta é só a PRIMEIRA camada (contém o caso comum); o limite de verdade entre todas as
// instâncias/lambdas é o Firewall da Vercel, configurado pelo humano. Teto de chaves rastreadas para nunca
// crescer sem limite (mesmo padrão do limitador por IP da API B2B).

// Revisão S19 (I5): um Map por NAMESPACE (prefixo antes do primeiro ":" — `login`, `lead`, `submit`, `widget`,
// `campaign-*`), cada um com o próprio teto. Chaves controladas por terceiros (ex.: `partnerId` do widget) só
// conseguem expulsar chaves do próprio namespace, nunca as de login/lead/envio. Os prefixos são fixos no código.
export const MAX_TRACKED_KEYS = 10_000;
type Bucket = { count: number; windowStart: number; windowMs: number };
const namespaces = new Map<string, Map<string, Bucket>>();

function namespaceOf(key: string): string {
  const i = key.indexOf(":");
  return i > 0 ? key.slice(0, i) : "default";
}

function bucketsFor(ns: string): Map<string, Bucket> {
  let m = namespaces.get(ns);
  if (!m) {
    m = new Map();
    namespaces.set(ns, m);
  }
  return m;
}

function pruneExpired(buckets: Map<string, Bucket>, now: number): void {
  for (const [key, b] of buckets) {
    if (now - b.windowStart >= b.windowMs) buckets.delete(key);
  }
}

/** `true` = permitido (e já contabilizado); `false` = acima do limite (não contabiliza de novo). */
export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const buckets = bucketsFor(namespaceOf(key));
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    if (!buckets.has(key) && buckets.size >= MAX_TRACKED_KEYS) {
      pruneExpired(buckets, now);
      // Ainda cheio (muitas chaves distintas ativas ao mesmo tempo NESTE namespace) — despeja só a mais ANTIGA
      // (primeira do `Map`, que preserva ordem de inserção), nunca `clear()` global.
      if (buckets.size >= MAX_TRACKED_KEYS) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }
    }
    b = { count: 0, windowStart: now, windowMs };
    buckets.delete(key); // reinsere no fim: a ordem do Map continua sendo a da última janela aberta
    buckets.set(key, b);
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Só para testes. */
export function __resetRateLimitForTests(): void {
  namespaces.clear();
}

/** Só para testes: chaves rastreadas de um namespace. */
export function trackedKeyCount(namespace: string): number {
  return namespaces.get(namespace)?.size ?? 0;
}
