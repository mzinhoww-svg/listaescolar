import { NextResponse, type NextRequest } from "next/server";

import { ConcluirRequestSchema } from "@/lib/pesquisa/schemas";
import { markCompleted } from "@/lib/pesquisa/repositorio";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = ConcluirRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers: NO_STORE });
  }
  const ok = await markCompleted(parsed.data.session_id);
  if (!ok) return NextResponse.json({ error: "not_ready" }, { status: 409, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
