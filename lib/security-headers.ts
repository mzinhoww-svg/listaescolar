/**
 * Cabeçalhos de segurança e CSP (S19). Função pura (mesmo espírito de `lib/robots-header.ts`): sem imports,
 * testável sem mocks. Usada pelo `middleware.ts` (precisa do nonce por requisição, então não pode viver no
 * `next.config.ts`, que só roda uma vez no build/boot).
 *
 * `frame-ancestors 'self'`: nenhuma página HTML deste site é embutida por iframe em outro site hoje (o widget da
 * S25, `public/widget.js`, desenha DOM na página do parceiro via `fetch` — nunca um iframe); ver Ruling 2 do plano
 * da S19. `script-src` sem `'unsafe-inline'`: o nonce cobre os scripts do próprio Next e o único `<script>`
 * manual do produto (JSON-LD de `app/escolas/[inep]/page.tsx`).
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'", // Tailwind gera estilos inline em runtime (className dinâmico só via CSS já compilado; sem risco de injeção — nunca HTML de terceiro)
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
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
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  };
}

/** Todos os cabeçalhos de segurança, incluindo o CSP com o nonce desta requisição. */
export function securityHeaders(nonce: string): SecurityHeaders {
  return { ...baseSecurityHeaders(), "Content-Security-Policy": buildCsp(nonce) };
}
