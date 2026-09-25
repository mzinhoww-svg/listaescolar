import type { ClaimTokenSender, SendContext } from "./ports";

export type SenderEnv = { DEMO_CLAIM_DELIVERY?: string; APP_ENV?: string; VERCEL_ENV?: string };

/** Só imprime no log do servidor (demonstração local). Nunca chega ao cliente. */
export class ConsoleClaimTokenSender implements ClaimTokenSender {
  readonly demo = true;
  readonly channels = { email: true, whatsapp: true } as const;
  constructor(private readonly log: (line: string) => void = (l) => console.info(l)) {}
  async sendEmailLink(_to: string, link: string, ctx: SendContext): Promise<void> {
    this.log(`[demo] link de reivindicação (${ctx.inep}): ${link}`);
  }
  async sendWhatsappCode(_to: string, code: string, ctx: SendContext): Promise<void> {
    this.log(`[demo] código de reivindicação (${ctx.inep}): ${code}`);
  }
}

/** Entregador em memória para testes. */
export class MemoryClaimTokenSender implements ClaimTokenSender {
  readonly channels = { email: true, whatsapp: true } as const;
  readonly sent: Array<{ channel: "email" | "whatsapp"; to: string; secret: string; ctx: SendContext }> = [];
  failNext = false;
  private maybeFail(): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("falha simulada de entrega");
    }
  }
  async sendEmailLink(to: string, link: string, ctx: SendContext): Promise<void> {
    this.maybeFail();
    this.sent.push({ channel: "email", to, secret: link, ctx });
  }
  async sendWhatsappCode(to: string, code: string, ctx: SendContext): Promise<void> {
    this.maybeFail();
    this.sent.push({ channel: "whatsapp", to, secret: code, ctx });
  }
}

const t = (v: string | undefined) => (v ?? "").trim();

/**
 * Entregador do ambiente: console só com `DEMO_CLAIM_DELIVERY=1` E `APP_ENV` local/development (e `VERCEL_ENV` vazio ou development) E escola demonstrativa. Fora disso não há provedor (`null`): os métodos por token ficam
 * "indisponíveis" e nada finge envio.
 */
export function getClaimTokenSender(env: SenderEnv, school: { isDemo: boolean }): ClaimTokenSender | null {
  const allowedEnv = t(env.APP_ENV) === "local" || t(env.APP_ENV) === "development";
  if (t(env.DEMO_CLAIM_DELIVERY) === "1" && allowedEnv && (t(env.VERCEL_ENV) === "" || t(env.VERCEL_ENV) === "development") && school.isDemo) {
    return new ConsoleClaimTokenSender();
  }
  return null;
}
