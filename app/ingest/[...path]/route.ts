import { forwardIngest } from "@/lib/analytics/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

/** Proxy de medição (ADR-007): ver `lib/analytics/ingest.ts`. Só POST; o resto responde 405/404. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const { path } = await params;
  return forwardIngest(request, path, { env: process.env });
}

const notAllowed = () => new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
export { notAllowed as GET, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE };
