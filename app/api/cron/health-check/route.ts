import { NextResponse } from "next/server";

import { CRON_SECRET_MIN_LENGTH, isAuthorizedCron } from "@/features/leads/cron-auth";
import { runHealthCheck } from "@/features/health/service";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * Job periódico (Vercel Cron/pg_cron): fila morta e taxa de erro do provedor de IA (S19). Acima do limiar,
 * notifica todo admin pela central (S11), sem dado pessoal. Sem segredo, 503; segredo errado, 401.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) {
    return NextResponse.json({ error: "cron não configurado" }, { status: 503, headers: NO_STORE });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401, headers: NO_STORE });
  }
  try {
    const result = await runHealthCheck();
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    console.error("verificação de saúde", error instanceof Error ? error.name : "erro");
    return NextResponse.json({ error: "falha na verificação de saúde" }, { status: 500, headers: NO_STORE });
  }
}
