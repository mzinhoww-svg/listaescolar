import "server-only";

/**
 * D-158 (S19): extraído de handler.ts (549 linhas) — sem mudança de comportamento, só posição. Continua o mesmo
 * módulo de estado (as três funções `__*ForTests` continuam válidas para os testes existentes, que importam via
 * o barrel `@/features/b2b/api/handler`).
 *
 * ---- Limite por IP em memória (achado 1b, revisão de segurança independente; refinado na rodada 2, achados
 * A/B/C). Primeira camada, por INSTÂNCIA (um `Map` de módulo, não compartilhado entre lambdas/instâncias da
 * Vercel). Ruling (ver ledger-comercio.md, item 1b): 60 tentativas de autenticação FALHAS por minuto por IP,
 * janela fixa. O limite de VERDADE, entre todas as instâncias, é pendência do HUMANO no Vercel Firewall/Edge
 * Config (ver docs/superpowers/PROGRESS.md, "Pendências humanas") — este código nunca toca infraestrutura, só
 * aplica a primeira camada em memória do processo.
 *
 * Achado B (rodada 2): só CHAVE INVÁLIDA conta no balde do IP — uma chave válida (mesmo com escopo errado, que só
 * é checado DEPOIS da consulta da chave) nunca é barrada nem contabilizada aqui; ela sempre segue para o limite
 * por parceiro (`b2b_rate_consume`), configurado pelo próprio admin, sem o limite por IP (pensado para conter
 * martelamento com chaves inválidas) sendo mais restritivo do que o limite que o parceiro contratou. Por isso o
 * PEEK (leitura, sem incrementar) roda ANTES de tudo — antes até do pepper/`verifyApiKey`, sem tocar o banco, para
 * um IP já sobre o teto nem chegar a consultar a chave — e o REGISTRO (incremento) só roda depois que
 * `verifyApiKey` devolve `invalid_key` de verdade.
 */
const IP_RATE_LIMIT_WINDOW_MS = 60_000;
const IP_RATE_LIMIT_MAX_PER_WINDOW = 60;
// Achado A (rodada 2): teto de IPs distintos rastreados ao mesmo tempo — sem ele, um atacante variando o IP de
// origem (trivial com IPv6) cria uma entrada nova por IP para sempre, esgotando a memória da instância. `let` (não
// `const`) só para o teste poder baixar o teto e exercitar o comportamento sem precisar de 10 mil iterações reais.
const IP_RATE_LIMIT_DEFAULT_MAX_TRACKED_IPS = 10_000;
let ipRateLimitMaxTrackedIps = IP_RATE_LIMIT_DEFAULT_MAX_TRACKED_IPS;

type IpBucket = { windowStart: number; count: number };
const ipRateBuckets = new Map<string, IpBucket>();

/** Só para teste: o limitador por IP é estado de módulo (compartilhado entre chamadas no mesmo processo). */
export function __resetIpRateLimiterForTests(): void {
  ipRateBuckets.clear();
  ipRateLimitMaxTrackedIps = IP_RATE_LIMIT_DEFAULT_MAX_TRACKED_IPS;
}

/** Só para teste: tamanho atual do mapa de baldes por IP (confirma o teto do achado A). */
export function __ipRateLimiterSizeForTests(): number {
  return ipRateBuckets.size;
}

/** Só para teste: baixa o teto de IPs distintos rastreados (produção usa sempre 10.000; ver
 * `IP_RATE_LIMIT_DEFAULT_MAX_TRACKED_IPS`), para exercitar o comportamento de despejo sem 10 mil iterações reais.
 * `__resetIpRateLimiterForTests` devolve ao padrão. */
export function __setIpRateLimiterMaxTrackedIpsForTests(max: number): void {
  ipRateLimitMaxTrackedIps = max;
}

/** Achado C (rodada 2): prioridade corrigida — `x-vercel-forwarded-for` primeiro (escrito pela BORDA da Vercel,
 * não pode ser forjado por um proxy intermediário antes de chegar lá), depois `x-real-ip`, e só por último (se
 * nenhum dos dois existir) o primeiro valor de `x-forwarded-for` (que QUALQUER proxy no caminho pode ter
 * acrescentado ou reescrito antes da borda da Vercel — o menos confiável dos três, mantido só como fallback).
 * `null` quando nenhum dos três está presente — sem IP identificável, NÃO bloqueia (só loga); bloquear às cegas
 * puniria todo mundo atrás do mesmo proxy sem cabeçalho. */
export function clientIp(request: Request): string | null {
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelForwardedFor) return vercelForwardedFor;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

/** Leitura pura (nunca incrementa) — roda antes de tocar o banco, para um IP já sobre o teto nem chegar a
 * consultar a chave. */
export function peekIpRateLimit(ip: string, nowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const bucket = ipRateBuckets.get(ip);
  if (!bucket || nowMs - bucket.windowStart >= IP_RATE_LIMIT_WINDOW_MS) return { allowed: true, retryAfterSeconds: 0 };
  if (bucket.count >= IP_RATE_LIMIT_MAX_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStart + IP_RATE_LIMIT_WINDOW_MS - nowMs) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Libera janelas já vencidas — chamado só quando o mapa está no teto, antes de decidir se precisa zerar tudo. */
function pruneExpiredIpBuckets(nowMs: number): void {
  for (const [ip, bucket] of ipRateBuckets) {
    if (nowMs - bucket.windowStart >= IP_RATE_LIMIT_WINDOW_MS) ipRateBuckets.delete(ip);
  }
}

/** Achado B: só chamado depois que `verifyApiKey` confirma `invalid_key` de verdade (nunca para chave válida,
 * nunca só por escopo errado). Achado A: antes de criar uma entrada NOVA (IP nunca visto, ou janela anterior já
 * vencida) que levaria o mapa acima do teto, tenta liberar janelas vencidas; se mesmo assim ainda estiver no teto
 * (muitos IPs distintos ativos ao mesmo tempo — um ataque de verdade em andamento), zera o mapa inteiro e loga.
 * Mais simples e igualmente seguro do que uma política de despejo por LRU (Ruling); o custo é perder a contagem em
 * andamento de quem estava perto do limite quando o teto é atingido — aceitável: o pior caso vira "mais 60
 * tentativas até barrar de novo", nunca uma falha de disponibilidade. */
export function recordIpAuthFailure(ip: string, nowMs: number): void {
  const existing = ipRateBuckets.get(ip);
  if (existing && nowMs - existing.windowStart < IP_RATE_LIMIT_WINDOW_MS) {
    existing.count += 1;
    return;
  }
  if (ipRateBuckets.size >= ipRateLimitMaxTrackedIps) {
    pruneExpiredIpBuckets(nowMs);
    if (ipRateBuckets.size >= ipRateLimitMaxTrackedIps) {
      console.warn("b2b ip rate limit: teto de IPs rastreados atingido, limpando o mapa");
      ipRateBuckets.clear();
    }
  }
  ipRateBuckets.set(ip, { windowStart: nowMs, count: 1 });
}
