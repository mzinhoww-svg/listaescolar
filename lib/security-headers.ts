/**
 * Cabeçalhos de segurança e CSP (S19). Função pura (mesmo espírito de `lib/robots-header.ts`): sem imports,
 * testável sem mocks. Usada pelo `proxy.ts` (precisa do nonce por requisição, então não pode viver no
 * `next.config.ts`, que só roda uma vez no build/boot).
 *
 * `frame-ancestors 'self'`: nenhuma página HTML deste site é embutida por iframe em outro site hoje (o widget da
 * S25, `public/widget.js`, desenha DOM na página do parceiro via `fetch` — nunca um iframe); ver Ruling 2 do plano
 * da S19. `script-src` sem `'unsafe-inline'`: o nonce cobre os scripts do próprio Next e o único `<script>`
 * manual do produto (JSON-LD de `app/escolas/[inep]/page.tsx`).
 */
export type CspOrigins = {
  /** `NEXT_PUBLIC_SUPABASE_URL`: Storage (img/iframe do documento da revisão) e supabase-js no navegador. */
  supabaseUrl?: string | undefined;
  /** DSN do Sentry (só o host de ingestão entra no `connect-src`). */
  sentryDsn?: string | undefined;
  /** `next dev`: o React precisa de `eval` para reconstruir pilhas de erro; nunca em produção. */
  isDev?: boolean | undefined;
};

/** Lê as origens permitidas do ambiente (função pura: recebe o objeto de ambiente). */
export function cspOriginsFromEnv(env: Record<string, string | undefined>): CspOrigins {
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    sentryDsn: env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN,
    isDev: env.NODE_ENV === "development",
  };
}

function originOf(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function buildCsp(nonce: string, origins: CspOrigins = {}): string {
  const supabase = originOf(origins.supabaseUrl);
  const sentry = originOf(origins.sentryDsn);
  const supabaseHttp = supabase ? [supabase.origin] : [];
  // Realtime do Supabase usa wss (ou ws em http local).
  const supabaseWs = supabase ? [`${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`] : [];
  const sentryOrigin = sentry ? [sentry.origin] : [];
  const list = (...parts: string[][]) => ["'self'", ...parts.flat()].join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${origins.isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // Tailwind gera estilos inline em runtime (className dinâmico só via CSS já compilado; sem risco de injeção — nunca HTML de terceiro)
    `img-src ${list(["data:", "blob:"], supabaseHttp)}`,
    "font-src 'self' data:",
    `connect-src ${list(supabaseHttp, supabaseWs, sentryOrigin)}`,
    `frame-src ${list(supabaseHttp)}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export type SecurityHeaders = Record<string, string>;

/** Cabeçalhos sem o CSP (que depende do nonce por requisição; ver `buildCsp`). */
export function baseSecurityHeaders(): SecurityHeaders {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Frame-Options": "SAMEORIGIN", // defesa em profundidade; frame-ancestors do CSP é a regra moderna
    // HSTS: a Vercel só serve https; inofensivo em http local (o navegador ignora o cabeçalho fora de https).
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  };
}

/** Todos os cabeçalhos de segurança, incluindo o CSP com o nonce desta requisição. */
export function securityHeaders(nonce: string, origins: CspOrigins = {}): SecurityHeaders {
  return { ...baseSecurityHeaders(), "Content-Security-Policy": buildCsp(nonce, origins) };
}
