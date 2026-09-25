import type { SenderCapabilities } from "./channels";

export type SendContext = { schoolName: string; inep: string };

/**
 * Entrega do token ao contato REGISTRADO da escola (nunca a endereço digitado). Sem provedor real nesta fatia:
 * e-mail entra na S11; WhatsApp depende de credencial do humano.
 */
export interface ClaimTokenSender {
  /** `true` = entrega de demonstração (só log local). */
  readonly demo?: boolean;
  readonly channels: { readonly email: boolean; readonly whatsapp: boolean };
  sendEmailLink(to: string, link: string, ctx: SendContext): Promise<void>;
  sendWhatsappCode(to: string, code: string, ctx: SendContext): Promise<void>;
}

/** Storage privado das evidências (bucket `claim-evidence`); só o servidor com service role usa. */
export interface EvidenceStorage {
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  remove(path: string): Promise<void>;
  signedUrl(path: string, seconds: number, downloadName?: string): Promise<string>;
}

export type { SenderCapabilities };
