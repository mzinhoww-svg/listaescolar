import { getAnalyticsConfig, isAllowedHost } from "./config";

/**
 * Proxy de medição (ADR-007, revisão de segurança I1/I2/M1/M2). Route Handler, não `rewrite`: um rewrite repassa TODOS
 * os cabeçalhos do navegador (cookie, referer, user-agent, x-forwarded-for) ao PostHog. Aqui só sai `content-type`.
 */
export const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_PATHS = new Set(["i/v0/e", "batch"]);
const TIMEOUT_MS = 5_000;
const NO_STORE = { "cache-control": "no-store" } as const;

const json = (status: number, body = "{}") =>
  new Response(body, { status, headers: { "content-type": "application/json", ...NO_STORE } });

/** Lê o corpo até o teto; `null` se passar dele (nunca guarda mais que o limite + um pedaço). */
async function readCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export type IngestDeps = { env: Record<string, string | undefined>; fetchImpl?: typeof fetch };

/**
 * `segments` são os segmentos depois de `/ingest/`. Só POST, só `i/v0/e` e `batch`, sem barra final. O destino é o
 * host configurado (validado por `isAllowedHost`), nunca algo vindo da requisição.
 */
export async function forwardIngest(req: Request, segments: string[], deps: IngestDeps): Promise<Response> {
  const cfg = getAnalyticsConfig(deps.env);
  if (!cfg.enabled || !isAllowedHost(cfg.host)) return json(404);
  const path = segments.join("/");
  if (!ALLOWED_PATHS.has(path) || new URL(req.url).pathname.endsWith("/")) return json(404);
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST", ...NO_STORE } });

  const body = await readCapped(req);
  if (body === null) return json(413);

  const contentType = req.headers.get("content-type");
  try {
    const upstream = await (deps.fetchImpl ?? fetch)(`${cfg.host}/${path}`, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: contentType ? { "content-type": contentType } : {},
      body,
    });
    // Resposta limpa: só status e JSON. Nada do que o PostHog devolva (set-cookie, etc.) chega ao navegador.
    return json(upstream.status >= 200 && upstream.status < 300 ? 200 : 502, upstream.ok ? '{"status":1}' : "{}");
  } catch {
    return json(502);
  }
}
