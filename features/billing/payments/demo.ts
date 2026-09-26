import { randomUUID } from "node:crypto";

import { isDemoEnabled, type DemoEnv } from "@/features/cart/demo-provider";

import { DEFAULT_CHARGE_TTL_SECONDS } from "../limits";
import type { Charge, ChargeInput, ChargeStatus, PaymentProvider } from "../ports";

/**
 * Carteira de demonstração: nenhum dinheiro real, nenhuma cobrança de PSP. "Simular pagamento (demonstração)"
 * confirma a fatura diretamente no serviço (sem consultar `getCharge`, que aqui nunca sai de `pending`). Fail-closed
 * na CONSTRUÇÃO (defesa em profundidade: mesmo que a fábrica tenha um bug, o provedor recusa carteira real e
 * produção) — nunca em `VERCEL_ENV=production`, nunca fora de `isDemoEnabled`.
 */
export class DemoPaymentProvider implements PaymentProvider {
  readonly id = "demo" as const;

  constructor(opts: { isDemo: boolean; env: DemoEnv }) {
    if (!opts.isDemo) throw new Error("DemoPaymentProvider: carteira não é de demonstração");
    if (!isDemoEnabled(opts.env)) throw new Error("DemoPaymentProvider: demonstração desligada neste ambiente");
  }

  async createCharge(input: ChargeInput): Promise<Charge> {
    const ttl = input.expiresInSeconds ?? DEFAULT_CHARGE_TTL_SECONDS;
    return { chargeId: `demo_${input.invoiceId}_${randomUUID()}`, copyPaste: null, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  /** Não usado pelo fluxo de simulação (que confirma direto no serviço); devolvido por completude da interface. */
  async getCharge(chargeId: string): Promise<ChargeStatus> {
    void chargeId;
    return { status: "pending", paidAmountCents: null, paidAt: null };
  }
}
