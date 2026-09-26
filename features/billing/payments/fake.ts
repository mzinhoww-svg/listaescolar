import { randomUUID } from "node:crypto";

import { DEFAULT_CHARGE_TTL_SECONDS } from "../limits";
import type { Charge, ChargeInput, ChargeStatus, PaymentProvider } from "../ports";

type FakeChargeState = { amountCents: number; status: ChargeStatus["status"]; paidAt: Date | null };

/** Provedor determinístico em memória, só para teste: nenhuma chamada de rede, nunca usado fora de `tests/`. */
export class FakePaymentProvider implements PaymentProvider {
  readonly id = "fake" as const;
  private readonly charges = new Map<string, FakeChargeState>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async createCharge(input: ChargeInput): Promise<Charge> {
    const chargeId = `fake_${input.invoiceId}_${randomUUID()}`;
    this.charges.set(chargeId, { amountCents: input.amountCents, status: "pending", paidAt: null });
    const ttl = input.expiresInSeconds ?? DEFAULT_CHARGE_TTL_SECONDS;
    return { chargeId, copyPaste: `00020126fake${chargeId}`, expiresAt: new Date(this.clock().getTime() + ttl * 1000) };
  }

  async getCharge(chargeId: string): Promise<ChargeStatus> {
    const c = this.charges.get(chargeId);
    if (!c) return { status: "unknown", paidAmountCents: null, paidAt: null };
    return { status: c.status, paidAmountCents: c.status === "paid" ? c.amountCents : null, paidAt: c.paidAt };
  }

  /** Só para teste: simula a confirmação do PSP sem rede. */
  markPaid(chargeId: string, paidAt: Date = this.clock()): void {
    const c = this.charges.get(chargeId);
    if (!c) throw new Error(`cobrança fake desconhecida: ${chargeId}`);
    c.status = "paid";
    c.paidAt = paidAt;
  }
}
