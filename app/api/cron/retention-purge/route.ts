import { NextResponse } from "next/server";

import { CRON_SECRET_MIN_LENGTH, isAuthorizedCron } from "@/features/leads/cron-auth";
import { runRetention } from "@/features/privacy/retention";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

/** Job de retenção (D-012, S17): apaga evidência de reivindicação e token vencidos. Idempotente. Sem segredo, 503;
 * segredo errado, 401; reusa `features/leads/cron-auth.ts` (comparação em tempo constante). */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) {
    return NextResponse.json({ error: "cron não configurado" }, { status: 503, headers: NO_STORE });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401, headers: NO_STORE });
  }
  try {
    const outcomes = await runRetention(createAdminClient());
    return NextResponse.json({ outcomes }, { headers: NO_STORE });
  } catch (error) {
    console.error("job de retenção", error instanceof Error ? error.name : "erro");
    return NextResponse.json({ error: "falha na retenção" }, { status: 500, headers: NO_STORE });
  }
}
