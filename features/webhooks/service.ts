import type { SessionActor } from "@/features/auth/actor";

import { generateWebhookSecret, encryptSecret, decryptSecret } from "./crypto";
import { WebhookServiceError } from "./errors";
import type { DeliveryRow, EndpointRow } from "./repository";
import { EndpointIdInputSchema, ResendInputSchema, SaveEndpointInputSchema } from "./schemas";

// Casos de uso do domínio de webhooks (S25), mesmo padrão de `features/b2b/service.ts`: dependências injetadas
// (repositório e chave de cifra), o texto claro do segredo nasce e morre aqui e no retorno da Server Action
// (nunca logado). Autorização final é sempre do banco (SessionActor + funções SQL).

export type WebhookRepository = {
  listMyEndpoints: (actor: SessionActor) => Promise<EndpointRow[]>;
  createEndpoint: (actor: SessionActor, input: { url: string; events: readonly string[]; ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number }) => Promise<{ endpointId: string }>;
  updateEndpoint: (actor: SessionActor, endpointId: string, input: { url: string; events: readonly string[] }) => Promise<void>;
  rotateSecret: (actor: SessionActor, endpointId: string, secret: { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number }) => Promise<void>;
  revealSecret: (actor: SessionActor, endpointId: string) => Promise<{ ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number }>;
  listMyDeliveries: (actor: SessionActor, limit?: number) => Promise<DeliveryRow[]>;
  resendDelivery: (actor: SessionActor, deliveryId: string) => Promise<{ deliveryId: string }>;
};

export type WebhookServiceDeps = {
  repo: WebhookRepository;
  /** `undefined` = chave de cifra não configurada (criar/rotacionar segredo fica indisponível). */
  encryptionKey: () => string | undefined;
};

export const CURRENT_SECRET_KEY_VERSION = 1;

export class WebhookService {
  constructor(private readonly deps: WebhookServiceDeps) {}

  async listEndpoints(actor: SessionActor): Promise<EndpointRow[]> {
    return this.deps.repo.listMyEndpoints(actor);
  }

  async listDeliveries(actor: SessionActor): Promise<DeliveryRow[]> {
    return this.deps.repo.listMyDeliveries(actor, 50);
  }

  /** Cria o endpoint; devolve o segredo em claro UMA VEZ ("copie agora"). */
  async createEndpoint(actor: SessionActor, raw: unknown): Promise<{ endpointId: string; secret: string }> {
    const parsed = SaveEndpointInputSchema.safeParse(raw);
    if (!parsed.success) throw new WebhookServiceError("endpoint inválido", "invalid_input");
    const key = this.deps.encryptionKey();
    if (!key) throw new WebhookServiceError("configuração de webhooks indisponível no momento", "service_unavailable");
    const secret = generateWebhookSecret();
    const enc = encryptSecret(secret, key);
    const { endpointId } = await this.deps.repo.createEndpoint(actor, { url: parsed.data.url, events: parsed.data.events, ...enc, keyVersion: CURRENT_SECRET_KEY_VERSION });
    return { endpointId, secret };
  }

  async updateEndpoint(actor: SessionActor, endpointId: string, raw: unknown): Promise<void> {
    const parsedId = EndpointIdInputSchema.safeParse({ endpointId });
    const parsed = SaveEndpointInputSchema.safeParse(raw);
    if (!parsedId.success || !parsed.success) throw new WebhookServiceError("endpoint inválido", "invalid_input");
    await this.deps.repo.updateEndpoint(actor, endpointId, { url: parsed.data.url, events: parsed.data.events });
  }

  /** Rotaciona; devolve o segredo NOVO uma vez. O anterior é invalidado na hora (sem carência dupla). */
  async rotateSecret(actor: SessionActor, endpointId: string): Promise<{ secret: string }> {
    const parsedId = EndpointIdInputSchema.safeParse({ endpointId });
    if (!parsedId.success) throw new WebhookServiceError("endpoint inválido", "invalid_input");
    const key = this.deps.encryptionKey();
    if (!key) throw new WebhookServiceError("configuração de webhooks indisponível no momento", "service_unavailable");
    const secret = generateWebhookSecret();
    const enc = encryptSecret(secret, key);
    await this.deps.repo.rotateSecret(actor, endpointId, { ...enc, keyVersion: CURRENT_SECRET_KEY_VERSION });
    return { secret };
  }

  /** "Revelar" (B2B05): decifra sob demanda, só para o dono/admin (checado pelo repositório/banco). */
  async revealSecret(actor: SessionActor, endpointId: string): Promise<{ secret: string }> {
    const parsedId = EndpointIdInputSchema.safeParse({ endpointId });
    if (!parsedId.success) throw new WebhookServiceError("endpoint inválido", "invalid_input");
    const key = this.deps.encryptionKey();
    if (!key) throw new WebhookServiceError("configuração de webhooks indisponível no momento", "service_unavailable");
    const enc = await this.deps.repo.revealSecret(actor, endpointId);
    try {
      return { secret: decryptSecret(enc, key) };
    } catch {
      throw new WebhookServiceError("não foi possível decifrar o segredo (chave de cifra rotacionada?)", "service_unavailable");
    }
  }

  async resendDelivery(actor: SessionActor, raw: unknown): Promise<{ deliveryId: string }> {
    const parsed = ResendInputSchema.safeParse(raw);
    if (!parsed.success) throw new WebhookServiceError("pedido de reenvio inválido", "invalid_input");
    return this.deps.repo.resendDelivery(actor, parsed.data.deliveryId);
  }
}
