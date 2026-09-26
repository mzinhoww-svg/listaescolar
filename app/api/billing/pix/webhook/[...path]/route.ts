import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedPixWebhook, PIX_WEBHOOK_TOKEN_MIN_LENGTH } from "@/features/billing/webhook-auth";
import { pixWebhookBodySchema } from "@/features/billing/schemas";
import { getBillingService } from "@/features/billing/wiring";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * Webhook Pix (BACEN v2): o corpo só diz QUAL cobrança mudou. O valor NUNCA vem do corpo — o serviço sempre
 * reconsulta `GET /v2/cob/{txid}` e só confirma `CONCLUIDA` com valor igual. Rota "catch-all" (`[...path]`, não só
 * `[token]`): o BACEN entrega a notificação em `{urlCadastrada}/pix` — cadastrando
 * `.../api/billing/pix/webhook/<token>`, a chamada real chega em `.../webhook/<token>/pix`. Só o PRIMEIRO segmento é
 * o token; qualquer sufixo (`/pix` ou outro) é ignorado. Sem `PAYMENTS_PIX_ENABLED=1`, a rota não existe (404); sem
 * `PIX_WEBHOOK_TOKEN` configurado, 503; token do path errado, 401 (comparação em tempo constante). Sempre responde
 * 200 com token certo, mesmo que a cobrança seja desconhecida (idempotente, sem eco).
 *
 * A URL do webhook (com o token embutido) é, em si, um segredo: ela aparece em logs de acesso, no painel do PSP e
 * em qualquer proxy no caminho. Trate-a como uma credencial (não cole em issue, PR nem chat) — ver ledger.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  if (process.env.PAYMENTS_PIX_ENABLED !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const secret = process.env.PIX_WEBHOOK_TOKEN;
  if (!secret || secret.length < PIX_WEBHOOK_TOKEN_MIN_LENGTH) {
    return NextResponse.json({ error: "não configurado" }, { status: 503, headers: NO_STORE });
  }
  const { path } = await ctx.params;
  const token = path[0];
  if (!isAuthorizedPixWebhook(token, secret)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401, headers: NO_STORE });
  }

  let txids: string[] = [];
  try {
    const raw: unknown = await request.json();
    const body = pixWebhookBodySchema.parse(raw);
    txids = [...(body.pix?.map((p) => p.txid) ?? []), ...(body.txid ? [body.txid] : [])];
  } catch {
    // corpo malformado: nada a reconciliar, mas ainda respondemos 200 (o PSP não deve re-entregar às cegas).
  }

  const service = getBillingService();
  for (const txid of new Set(txids)) {
    try {
      await service.reconcileInvoiceByChargeId(txid);
    } catch (error) {
      console.error("reconciliar webhook Pix", error instanceof Error ? error.name : "erro");
    }
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
