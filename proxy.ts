import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";
import { baseSecurityHeaders, buildCsp, cspOriginsFromEnv } from "@/lib/security-headers";

// D-072/S19: cabeçalhos de segurança e CSP com nonce por requisição, encaixados no proxy que já existia (S02,
// renomeado de "middleware" para "proxy" pelo Next 16) para não duplicar um segundo arquivo de proxy — o Next
// só aceita um. `/api/widget/**` e `/widget.js` (S25) ficam de fora do CSP: entregam JSON/JS estático por CORS a
// terceiros (o widget desenha DOM na página do PARCEIRO via fetch, nunca um iframe deste site — nenhuma
// exceção de `frame-ancestors` foi necessária, ver Ruling no ledger) e já têm seus próprios cabeçalhos CORS por
// rota; adicionar CSP ali não teria efeito útil. `updateSession` (sessão/controle de rota) roda sem alteração de
// comportamento para TODAS as rotas do matcher existente, inclusive as do widget.
const NO_CSP_PREFIXES = ["/api/widget", "/widget.js"];

function skipsCsp(pathname: string): boolean {
  return NO_CSP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function proxy(request: NextRequest) {
  const skipCsp = skipsCsp(request.nextUrl.pathname);
  let csp: string | null = null;
  if (!skipCsp) {
    const nonce = generateNonce();
    csp = buildCsp(nonce, cspOriginsFromEnv(process.env));
    // Revisão S19 (B1): o Next 16 extrai o nonce do cabeçalho `content-security-policy` da REQUISIÇÃO (padrão
    // `'nonce-…'`), não de `x-nonce`; sem isso os scripts do framework saem sem nonce e o `strict-dynamic` os
    // bloqueia todos. `x-nonce` continua para o Server Component ler o nonce (JSON-LD). Mutar `request.headers`
    // aqui vale porque `updateSession` cria as respostas com `NextResponse.next({ request })`.
    request.headers.set("content-security-policy", csp);
    request.headers.set("x-nonce", nonce);
  }

  const response = await updateSession(request);
  // Cabeçalhos base valem para TODA rota do matcher; só o CSP (que precisa do nonce/renderização dinâmica) é
  // pulado nas rotas do widget (revisão M1).
  for (const [key, value] of Object.entries(baseSecurityHeaders())) response.headers.set(key, value);
  if (csp) response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Tudo, exceto `_next/`, `brand/` e `v1/`. Não excluir por extensão: `/admin.json` não pode contornar o gate.
// `v1/` (API B2B, S24) fica fora de propósito: sem cookie, sem refresh de sessão, sem redirect de login — a
// autenticação é só pela chave `x-listacerta-key`, verificada no próprio handler de cada rota.
export const config = {
  matcher: ["/((?!_next/|brand/|v1/).*)"],
};
