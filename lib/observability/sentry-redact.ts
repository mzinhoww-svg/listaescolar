import type { Breadcrumb, ErrorEvent, Event } from "@sentry/nextjs";

type ExtrasLike = Record<string, unknown>;

/**
 * Defesa em profundidade para o Sentry (S19): `dataCollection` já desligado em `sentry.*.config.ts` (SDK 11)
 * cobre a maior parte (sem `user`/cookies/headers/corpo/query string por padrão). Este redator cuida do que
 * ainda pode vir dentro de TEXTO livre — mensagem da exceção, `extra`, migalhas — e remove por completo qualquer
 * `request.data`/`query_string`/`cookies`/`headers` que uma integração futura venha a preencher. Função pura,
 * sem `Sentry.*`: pode ser chamada de `sentry.server.config.ts` e `sentry.client.config.ts` como `beforeSend`.
 */

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/giu;
// Telefone: dois grupos finais de 4–5 e 4 dígitos (formatos BR/internacionais comuns), com ou sem separador.
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// CNPJ (14 dígitos) e CPF (11 dígitos), com ou sem pontuação, sem colar em números maiores (revisão S19, M5).
const CNPJ_RE = /(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g;
const CPF_RE = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;
// URL absoluta ou caminho iniciado por "/" (não colado a uma palavra: "e/ou" não conta); corta em `?` e `#`.
const URL_TOKEN_RE = /(https?:\/\/[^\s"'<>]+|(?<![\w:/])\/[^\s"'<>]*)/g;
const QUERY_KEY_RE = /query|fragment/i;
const MAX_DEPTH = 8;

// Caminho relativo sem "/" inicial ("auth/confirm?token_hash=x"): só corta quando a query tem `chave=valor`, para
// não comer o "?" de uma frase (revisão S19, reverificação N5).
const RELATIVE_QUERY_RE = /([\w.~%-]+(?:\/[\w.~%-]+)*)\?[^\s"'<>]*=[^\s"'<>]*/g;
// Rotas com segredo no CAMINHO (reverificação N2): o token do webhook Pix (`/api/billing/pix/webhook/<token>/pix`)
// e os códigos de cotação/lead. Só o primeiro segmento depois do prefixo é o segredo.
const SECRET_PATH_RE = /^(\/api\/billing\/pix\/webhook\/|\/cotacao\/|\/papelaria\/leads\/|\/l\/)[^/]+/;

function maskSecretPath(token: string): string {
  const abs = /^https?:\/\/[^/]*/.exec(token);
  const head = abs ? abs[0] : "";
  const path = token.slice(head.length);
  return head + path.replace(SECRET_PATH_RE, (_m, prefix: string) => `${prefix}[token]`);
}

/** Remove `?query` e `#fragmento` de cada URL/caminho dentro de um texto (revisão S19, I4). */
export function stripUrlQuery(text: string): string {
  return text
    .replace(URL_TOKEN_RE, (token) => token.split(/[?#]/)[0] ?? token)
    .replace(RELATIVE_QUERY_RE, "$1");
}

function redactText(value: string): string {
  return stripUrlQuery(value)
    .replace(URL_TOKEN_RE, maskSecretPath)
    .replace(EMAIL_RE, "[e-mail]")
    .replace(IPV4_RE, "[ip]")
    .replace(CNPJ_RE, "[cnpj]")
    .replace(CPF_RE, "[cpf]")
    .replace(PHONE_RE, "[telefone]");
}

/** Redige recursivamente todo texto de um valor (contexts, dados de span/migalha, extra). Chaves de query/fragmento somem. */
function deepRedact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactText(value);
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => deepRedact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = typeof v === "string" && QUERY_KEY_RE.test(key) ? "[removido]" : deepRedact(v, depth + 1);
  }
  return out;
}

function redactExtras(extra: ExtrasLike | undefined): ExtrasLike | undefined {
  if (!extra) return extra;
  return deepRedact(extra) as ExtrasLike;
}

/** `beforeBreadcrumb` e parte do `beforeSend`: texto e URLs (fetch/xhr/navegação) sem dados pessoais nem query. */
export function redactBreadcrumb(b: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = { ...b };
  if (typeof out.message === "string") out.message = redactText(out.message);
  if (out.data && typeof out.data === "object") out.data = deepRedact(out.data) as Record<string, unknown>;
  return out;
}

/** `beforeSend`/`beforeSendTransaction`: nunca lança; evento sempre sai mais limpo do que entrou. */
export function redactEvent<E extends Event | ErrorEvent>(event: E): E {
  const out: E = { ...event };

  if (typeof out.message === "string") out.message = redactText(out.message);

  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => {
        const next = { ...v };
        if (typeof next.value === "string") next.value = redactText(next.value);
        if (next.stacktrace) next.stacktrace = deepRedact(next.stacktrace) as typeof next.stacktrace;
        return next;
      }),
    };
  }

  if (typeof out.transaction === "string") out.transaction = redactText(out.transaction);
  if (out.tags) out.tags = deepRedact(out.tags) as typeof out.tags;
  if (out.fingerprint) out.fingerprint = out.fingerprint.map((f) => redactText(f));
  if (out.logentry) {
    out.logentry = {
      ...out.logentry,
      ...(typeof out.logentry.message === "string" ? { message: redactText(out.logentry.message) } : {}),
      ...(out.logentry.params ? { params: deepRedact(out.logentry.params) as typeof out.logentry.params } : {}),
    };
  }
  if (out.contexts) out.contexts = deepRedact(out.contexts) as typeof out.contexts;
  const spans = (out as Event).spans;
  if (spans) (out as Event).spans = deepRedact(spans) as typeof spans;

  out.extra = redactExtras(out.extra);
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(redactBreadcrumb);

  // Corpo, query string, cookies e cabeçalhos da requisição nunca saem — mesmo se uma integração futura os
  // preencher (defesa em profundidade além do `dataCollection` desligado no `Sentry.init`).
  if (out.request) {
    const { url, method, env } = out.request;
    out.request = { ...(typeof url === "string" ? { url: maskSecretPath(stripUrlQuery(url)) } : {}), method, env };
  }

  // Nunca definimos `Sentry.setUser`, mas se algo vier preenchido, tira qualquer campo que não seja o `id`
  // opaco (e mesmo esse não é usado: o escopo desta fatia é por PAPEL, nunca por pessoa).
  if (out.user) out.user = {};

  return out;
}

type StreamedSpanLike = { name?: string; attributes?: Record<string, unknown> };

/**
 * `beforeSendSpan` (SDK 11, `traceLifecycle: 'stream'` por padrão): com spans em streaming, `beforeSend*Transaction`
 * não roda e cada span sai por conta própria com `name` e `attributes` (`url.path`, `http.target`, `url.full`…).
 * Mesma redação do texto livre; chaves de query/fragmento somem (reverificação N5).
 */
export function redactSpan<S extends StreamedSpanLike>(span: S): S {
  const out: S = { ...span };
  if (typeof out.name === "string") out.name = redactText(out.name);
  if (out.attributes) out.attributes = deepRedact(out.attributes) as S["attributes"];
  return out;
}
