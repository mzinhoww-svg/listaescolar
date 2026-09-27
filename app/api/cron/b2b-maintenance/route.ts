import { NextResponse } from "next/server";

import { CRON_SECRET_MIN_LENGTH, isAuthorizedCron } from "@/features/leads/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

/** Job diário (Vercel Cron): poda `b2b_rate_windows` mais antigas que 2 dias. Idempotente. Sem segredo, 503;
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
    const { data, error } = await createAdminClient().rpc("b2b_prune_rate_windows", {});
    if (error) throw error;
    return NextResponse.json({ pruned: data ?? 0 }, { headers: NO_STORE });
  } catch (error) {
    console.error("podar janelas de rate limit b2b", error instanceof Error ? error.name : "erro");
    return NextResponse.json({ error: "falha ao podar janelas" }, { status: 500, headers: NO_STORE });
  }
}
