import { NextResponse } from "next/server";

import { CRON_SECRET_MIN_LENGTH, isAuthorizedCron } from "@/features/leads/cron-auth";
import { getBillingService } from "@/features/billing/wiring";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

/** Job diário (Vercel Cron): reconsulta toda fatura Pix aberta com cobrança anexada. Sem segredo, 503; errado, 401. */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) {
    return NextResponse.json({ error: "cron não configurado" }, { status: 503, headers: NO_STORE });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401, headers: NO_STORE });
  }
  try {
    const result = await getBillingService().reconcileOpenInvoices();
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    console.error("reconciliar faturas Pix", error instanceof Error ? error.name : "erro");
    return NextResponse.json({ error: "falha ao reconciliar" }, { status: 500, headers: NO_STORE });
  }
}
