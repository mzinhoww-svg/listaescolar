import { timingSafeEqual } from "node:crypto";

import { runWebhookDispatchCycle } from "@/features/webhooks/dispatch/service";

// Cron do despacho de webhooks (S25), mesmo padrão de `app/api/notifications/dispatch/route.ts`: `POST` (pg_cron
// / kick manual) e `GET` (Vercel Cron), mesmo segredo em `Authorization: Bearer` (comparação em tempo constante).

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function secrets(): string[] {
  return [process.env.WEBHOOKS_DISPATCH_SECRET, process.env.CRON_SECRET].map((s) => (s ?? "").trim()).filter((s) => s.length >= 16);
}

function authorized(req: Request, known: string[]): boolean {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return false;
  const got = Buffer.from(m[1]!);
  return known.some((s) => {
    const want = Buffer.from(s);
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

async function handle(req: Request): Promise<Response> {
  const known = secrets();
  if (known.length === 0) return json({ error: "not_configured" }, 503);
  if (!authorized(req, known)) return json({ error: "unauthorized" }, 401);
  try {
    return json(await runWebhookDispatchCycle(), 200);
  } catch {
    return json({ error: "dispatch_failed" }, 500);
  }
}

export const POST = handle;
export const GET = handle;
