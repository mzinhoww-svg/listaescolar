import type { Breadcrumb, ErrorEvent, Event } from "@sentry/nextjs";

type ExtrasLike = Record<string, unknown>;

/**
 * Defesa em profundidade para o Sentry (S19): `dataCollection` já desligado em `sentry.*.config.ts` (SDK 11)
 * cobre a maior parte (sem `user`/cookies/headers/corpo/query string por padrão). Este redator cuida do que
 * ainda pode vir dentro de TEXTO livre — mensagem da exceção, `extra`, migalhas — e remove por completo qualquer
 * `request.data`/`query_string`/`cookies`/`headers` que uma integração futura venha a preencher. Função pura,
 * sem `Sentry.*`: pode ser chamada de `sentry.server.config.ts` e `sentry.client.config.ts` como `beforeSend`.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Telefone: dois grupos finais de 4–5 e 4 dígitos (formatos BR/internacionais comuns), com ou sem separador.
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

function redactText(value: string): string {
  return value.replace(EMAIL_RE, "[e-mail]").replace(PHONE_RE, "[telefone]").replace(IPV4_RE, "[ip]");
}

function redactExtras(extra: ExtrasLike | undefined): ExtrasLike | undefined {
  if (!extra) return extra;
  const out: ExtrasLike = {};
  for (const [key, value] of Object.entries(extra)) {
    out[key] = typeof value === "string" ? redactText(value) : value;
  }
  return out;
}

function redactBreadcrumb(b: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = { ...b };
  if (typeof out.message === "string") out.message = redactText(out.message);
  if (out.data && typeof out.data === "object") {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out.data)) {
      data[key] = typeof value === "string" ? redactText(value) : value;
    }
    out.data = data;
  }
  return out;
}

/** `beforeSend`/`beforeSendTransaction`: nunca lança; evento sempre sai mais limpo do que entrou. */
export function redactEvent<E extends Event | ErrorEvent>(event: E): E {
  const out: E = { ...event };

  if (typeof out.message === "string") out.message = redactText(out.message);

  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => (typeof v.value === "string" ? { ...v, value: redactText(v.value) } : v)),
    };
  }

  out.extra = redactExtras(out.extra);
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(redactBreadcrumb);

  // Corpo, query string, cookies e cabeçalhos da requisição nunca saem — mesmo se uma integração futura os
  // preencher (defesa em profundidade além do `dataCollection` desligado no `Sentry.init`).
  if (out.request) {
    const { url, method, env } = out.request;
    out.request = { url, method, env };
  }

  // Nunca definimos `Sentry.setUser`, mas se algo vier preenchido, tira qualquer campo que não seja o `id`
  // opaco (e mesmo esse não é usado: o escopo desta fatia é por PAPEL, nunca por pessoa).
  if (out.user) out.user = {};

  return out;
}
