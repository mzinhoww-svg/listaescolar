import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

import { Agent, buildConnector, fetch as undiciFetch } from "undici";

import { isPublicIp } from "./ip-range";

// `fetch` anti-SSRF para o envio de webhooks (S25): só HTTPS (exceto loopback local, só para o E2E), sem IP
// literal no host, DNS resolvido e o endereço usado REALMENTE pinado na conexão (proteção a DNS rebinding: uma
// segunda resolução diferente no `connect()` do socket nunca é usada — undici conecta no IP que ESTE módulo
// validou, com `servername`/Host do domínio original para SNI e para o servidor de destino), sem seguir
// redirecionamento, timeout e teto de leitura da resposta (nunca persiste o corpo).

export type ValidatedUrl = { protocol: "http:" | "https:"; hostname: string; port: number; href: string };
export type ValidationFailure = { ok: false; reason: "invalid_url" | "scheme_not_allowed" | "literal_ip_not_allowed" };

/** Só formato (sem I/O). `appEnv === "local"` é a ÚNICA exceção que permite `http://127.0.0.1|localhost`. */
export function validateWebhookUrl(rawUrl: string, appEnv: string | undefined): (ValidatedUrl & { ok: true }) | ValidationFailure {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  const hostname = url.hostname.toLowerCase();
  const isLoopbackHost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  const localException = appEnv === "local" && isLoopbackHost;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localException)) {
    return { ok: false, reason: "scheme_not_allowed" };
  }
  if (url.username || url.password) return { ok: false, reason: "invalid_url" };
  const bareHostname = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  const isLiteralIp = net.isIP(bareHostname) !== 0;
  if (isLiteralIp && !(localException && hostname === "127.0.0.1")) return { ok: false, reason: "literal_ip_not_allowed" };
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  return { ok: true, protocol: url.protocol as "http:" | "https:", hostname, port, href: url.href };
}

export type ResolveFailure = { ok: false; reason: "dns_error" | "no_public_address" };
export type ResolvedAddress = { ok: true; address: string; family: 4 | 6 };

/** DNS resolvido e filtrado por endereço público a cada tentativa de envio (não só na criação do endpoint):
 * o host pode ter mudado de IP. `localhost`/`127.0.0.1` (exceção local) nunca passa por DNS de verdade. */
export async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress | ResolveFailure> {
  if (hostname === "127.0.0.1") return { ok: true, address: "127.0.0.1", family: 4 };
  if (hostname === "localhost") return { ok: true, address: "127.0.0.1", family: 4 };
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "dns_error" };
  }
  const pub = addresses.find((a) => isPublicIp(a.address, a.family === 6 ? 6 : 4));
  if (!pub) return { ok: false, reason: "no_public_address" };
  return { ok: true, address: pub.address, family: pub.family === 6 ? 6 : 4 };
}

export type SafeFetchOutcome =
  | { kind: "sent"; status: number }
  | { kind: "transient"; code: string; status?: number }
  | { kind: "permanent"; code: string; status?: number };

export type SafeFetchOptions = {
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  appEnv?: string;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8_192;

/** Lê no máximo `maxBytes` do corpo da resposta e descarta o resto (nunca guardamos o corpo do parceiro). */
async function drainCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value?.byteLength ?? 0;
      if (read >= maxBytes) {
        await reader.cancel("response_too_large").catch(() => undefined);
        break;
      }
    }
  } catch {
    // corpo cortado no meio (conexão caiu etc.): irrelevante, já temos o status.
  }
}

/** POST assinado, seguro contra SSRF. Nunca lança: toda falha vira `SafeFetchOutcome`. */
export async function postWebhookSafely(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchOutcome> {
  const validated = validateWebhookUrl(rawUrl, opts.appEnv);
  if (!validated.ok) return { kind: "permanent", code: `invalid_url_${validated.reason}` };

  const resolved = await resolvePublicAddress(validated.hostname);
  if (!resolved.ok) return { kind: "permanent", code: resolved.reason };

  const baseConnector = buildConnector({});
  const pinnedConnector: ReturnType<typeof buildConnector> = (connectOpts, callback) => {
    const originalHostname = connectOpts.hostname;
    return baseConnector({ ...connectOpts, hostname: resolved.address, servername: connectOpts.servername ?? originalHostname }, callback);
  };
  const agent = new Agent({ connect: pinnedConnector, keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  try {
    const res = await undiciFetch(validated.href, {
      method: "POST",
      headers: opts.headers,
      body: opts.body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher: agent,
    });
    await drainCapped(res.body as unknown as ReadableStream<Uint8Array> | null, maxResponseBytes);
    if (res.status >= 300 && res.status < 400) return { kind: "permanent", code: "redirect_blocked", status: res.status };
    if (res.status >= 200 && res.status < 300) return { kind: "sent", status: res.status };
    if (res.status === 429 || res.status >= 500) return { kind: "transient", code: res.status === 429 ? "rate_limited" : "upstream_5xx", status: res.status };
    return { kind: "permanent", code: "upstream_4xx", status: res.status };
  } catch (error) {
    const name = error instanceof Error ? error.name : "erro";
    if (name === "TimeoutError" || name === "AbortError") return { kind: "transient", code: "timeout" };
    return { kind: "transient", code: "network_error" };
  } finally {
    await agent.close().catch(() => undefined);
  }
}
