import "server-only";

import { clientIp, ipRateKey } from "@/lib/net/client-ip";
import { checkRateLimit } from "@/lib/rate-limit/memory-bucket";

// Rotas públicas do widget (`app/api/widget/**`, S25): CORS aberto (dado público, sem cookie, sem credencial —
// qualquer site do parceiro pode embutir o widget), `no-store` (nunca cacheado por CDN/proxy: o conteúdo depende
// da cobertura/estado do parceiro) e um balde de taxa por IP+parceiro (primeira camada; ver `lib/rate-limit`).

const WIDGET_RATE_LIMIT = 30; // por janela
const WIDGET_RATE_WINDOW_MS = 60_000;
// Ruling (reverificação S19, N4b): teto por IP independente do `partnerId` — sem ele, quem gira `?partner=` ganha
// um balde novo a cada valor. 120/min por IP cobre um site de parceiro atrás de NAT com folga.
const WIDGET_IP_CEILING = 120;

const CORS_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;

export function widgetJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

export function widgetOptionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function widgetRateLimited(request: Request, partnerId: string | null): boolean {
  const raw = clientIp(request.headers);
  const ip = raw ? ipRateKey(raw) : "unknown";
  if (!checkRateLimit(`widget-ip:${ip}`, WIDGET_IP_CEILING, WIDGET_RATE_WINDOW_MS)) return true;
  return !checkRateLimit(`widget:${ip}:${partnerId ?? "-"}`, WIDGET_RATE_LIMIT, WIDGET_RATE_WINDOW_MS);
}
