/** Destino do redirect: montado só a partir do `search_url_template` do varejista (allowlist do banco). */

export const MAX_QUERY_LENGTH = 120;

export type RetailerTarget = {
  slug: string;
  baseUrl: string;
  searchUrlTemplate: string;
  affiliateKind: "none" | "mercadolivre" | "amazon";
  isActive: boolean;
};

export type RedirectErrorCode =
  "unknown_retailer" | "inactive_retailer" | "empty_query" | "unsafe_target";

export class RedirectTargetError extends Error {
  constructor(readonly code: RedirectErrorCode) {
    super(code);
    this.name = "RedirectTargetError";
  }
}

/** Remove controles (CR/LF/NUL...), normaliza, colapsa espaços e trunca por code point. */
export function sanitizeQuery(raw: string): string {
  const cleaned = raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, MAX_QUERY_LENGTH).join("").trim();
}

function hostAllowed(host: string, baseHost: string): boolean {
  const root = baseHost.replace(/^www\./, "");
  return host === baseHost || host === root || host.endsWith(`.${root}`);
}

/**
 * URL de busca sem afiliado. A query é sanitizada e passa por encodeURIComponent, então `&`, `#`, `/`,
 * `?`, CRLF e unicode não escapam do lugar do `{query}`. Confere https, ausência de credenciais e que o
 * host final é o do template e pertence ao domínio do `base_url`.
 */
export function buildSearchUrl(retailer: RetailerTarget, rawQuery: string): URL {
  if (!retailer.isActive) throw new RedirectTargetError("inactive_retailer");
  const query = sanitizeQuery(rawQuery);
  if (query === "") throw new RedirectTargetError("empty_query");
  // encodeURIComponent deixa "." e ".." intactos e o URL os resolveria como segmentos de caminho.
  if (query === "." || query === "..") throw new RedirectTargetError("unsafe_target");
  const template = retailer.searchUrlTemplate;
  // Exatamente um {query}, e fora da parte do host (senão a query escolheria o host).
  const afterOrigin = template.replace(/^https:\/\/[^/?#]*/, "");
  if (template.split("{query}").length !== 2 || afterOrigin.split("{query}").length !== 2) {
    throw new RedirectTargetError("unsafe_target");
  }
  let url: URL;
  let probe: URL;
  let base: URL;
  try {
    url = new URL(template.replace("{query}", encodeURIComponent(query)));
    probe = new URL(template.replace("{query}", "x"));
    base = new URL(retailer.baseUrl);
  } catch {
    throw new RedirectTargetError("unsafe_target");
  }
  const safe =
    url.protocol === "https:" &&
    base.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.origin === probe.origin &&
    hostAllowed(url.hostname, base.hostname);
  if (!safe) throw new RedirectTargetError("unsafe_target");
  return url;
}
