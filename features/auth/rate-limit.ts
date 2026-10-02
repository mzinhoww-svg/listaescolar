import "server-only";

import { createHash } from "node:crypto";

import { clientIp, ipRateKey } from "@/lib/net/client-ip";
import { checkRateLimit } from "@/lib/rate-limit/memory-bucket";

// D-001 (S19): primeira camada de rate limit do link mágico. Balde em memória por instância — mesmo Ruling já
// aceito nas S24/S25 (API B2B, widget): é a primeira camada; o limite de verdade entre instâncias/lambdas da
// Vercel é o Firewall, pendência humana já registrada em PROGRESS.md.
//
// Revisão S19 (M4): duas chaves em vez de só IP. (1) IP + hash do e-mail: 5 tentativas por 10 min — o mesmo
// e-mail repetido não passa, e um NAT de operadora móvel (muitas famílias atrás do mesmo IP, campanha escolar)
// não bloqueia e-mails diferentes entre si. (2) Teto por IP mais alto (30 por 10 min) só contra quem varia
// e-mails. Sem IP identificável NÃO existe balde global "unknown": o teto agregado vai para um namespace
// próprio, bem mais alto (300), e o limite por e-mail continua valendo.
const LOGIN_EMAIL_LIMIT = 5;
const LOGIN_IP_CEILING = 30;
const LOGIN_NOIP_CEILING = 300;
// Ruling (reverificação N4c): teto por e-mail SEM IP (vários IPs atacando o mesmo endereço, e-mail bomb). Mais alto
// que o de IP+e-mail para que um atacante não consiga trancar o e-mail alheio por muito tempo: 15 por janela.
const LOGIN_EMAIL_CEILING = 15;
// Ruling (N4c): 30 por 10 min por IP fica; constante ajustável (NAT de operadora móvel é o risco de falso positivo).
const LOGIN_RATE_WINDOW_MS = 10 * 60_000;

type HeadersLike = { get(name: string): string | null };

function emailKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** `true` = acima do limite (recusar); `false` = pode seguir (e já contabilizado). */
export function loginRateLimited(headers: HeadersLike, email: string): boolean {
  const rawIp = clientIp(headers);
  const ip = rawIp ? ipRateKey(rawIp) : null;
  const key = emailKey(email);
  const ceilingOk = ip
    ? checkRateLimit(`login-ip:${ip}`, LOGIN_IP_CEILING, LOGIN_RATE_WINDOW_MS)
    : checkRateLimit("login-noip:all", LOGIN_NOIP_CEILING, LOGIN_RATE_WINDOW_MS);
  if (!ceilingOk) return true;
  if (!checkRateLimit(`login-email:${key}`, LOGIN_EMAIL_CEILING, LOGIN_RATE_WINDOW_MS)) return true;
  return !checkRateLimit(`login:${ip ?? "noip"}:${key}`, LOGIN_EMAIL_LIMIT, LOGIN_RATE_WINDOW_MS);
}

// T2 (D-163): verificação do código de 6 dígitos. Espaço de 1 milhão de códigos: limite apertado por IP + e-mail
// (8 por 10 min) e teto por e-mail (20) contra quem varia IPs. O Supabase Auth aplica o próprio limite por cima.
const CODE_EMAIL_IP_LIMIT = 8;
const CODE_EMAIL_CEILING = 20;

/** `true` = acima do limite (recusar); `false` = pode seguir (e já contabilizado). */
export function codeRateLimited(headers: HeadersLike, email: string): boolean {
  const rawIp = clientIp(headers);
  const ip = rawIp ? ipRateKey(rawIp) : null;
  const key = emailKey(email);
  if (!checkRateLimit(`code-email:${key}`, CODE_EMAIL_CEILING, LOGIN_RATE_WINDOW_MS)) return true;
  return !checkRateLimit(`code:${ip ?? "noip"}:${key}`, CODE_EMAIL_IP_LIMIT, LOGIN_RATE_WINDOW_MS);
}
