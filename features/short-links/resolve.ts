import { parseShortCode, shortLinkTarget } from "./code";

/** Página estática do estado "Link inválido ou expirado?" (Sis01). Texto constante: nada da requisição é ecoado. */
export function renderInvalidLinkHtml(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link inválido · ListaCerta</title><style>
body{margin:0;background:#F5F2EA;color:#0F1B2D;font-family:"Plus Jakarta Sans",system-ui,sans-serif}
main{box-sizing:border-box;max-width:420px;min-height:100vh;margin:0 auto;padding:96px 24px 36px;display:flex;flex-direction:column;gap:16px}
h1{margin:0;font-size:28px;line-height:1.1;font-weight:800;letter-spacing:-.035em}
p{margin:0;font-size:15px;line-height:1.4;font-weight:500;color:#3D4A5C}
a{display:flex;align-items:center;justify-content:center;height:56px;margin-top:16px;border-radius:14px;background:#0F1B2D;color:#F5F2EA;font-size:16px;font-weight:800;text-decoration:none}
a:hover{background:#0B6B4A}a:focus-visible{outline:3px solid #0B6B4A;outline-offset:3px}
</style></head><body><main><h1>Link inválido ou expirado?</h1><p>Busque a escola pelo nome e encontre a lista oficial.</p><a href="/escolas">Buscar escola</a></main></body></html>`;
}

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex",
  "Cache-Control": "no-store",
} as const;

export type ResolveDeps = { loadSchool: (inep: string) => Promise<{ inep: string } | null> };

export function invalidLinkResponse(): Response {
  return new Response(renderInvalidLinkHtml(), { status: 404, headers: HTML_HEADERS });
}

/**
 * Decide a resposta do link curto: 307 relativo para a lista vigente, 404 (código inválido ou escola inexistente)
 * ou 503 (banco indisponível). O destino vem só do inteiro decodificado.
 */
export async function resolveShortLink(rawCode: unknown, deps: ResolveDeps): Promise<Response> {
  const parsed = parseShortCode(rawCode);
  if (parsed === null) return invalidLinkResponse();
  let school: { inep: string } | null;
  try {
    school = await deps.loadSchool(parsed.inep);
  } catch (error) {
    console.error("[short-link]", { code: error instanceof Error ? error.name : "unknown" });
    return new Response("Serviço temporariamente indisponível.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }
  if (school === null) return invalidLinkResponse();
  return new Response(null, {
    status: 307,
    headers: { Location: shortLinkTarget(parsed), "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" },
  });
}
