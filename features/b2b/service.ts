import type { SessionActor } from "@/features/auth/actor";
import { normalizeCnpj } from "@/features/stationeries/cnpj";

import { B2bServiceError } from "./errors";
import type { GeneratedApiKey, ApiKeyEnvironment } from "./keys/format";
import type { AdminPartnerRow, ApplyPartnerPayload, PartnerOverview } from "./repository";
import {
  ApplyPartnerInputSchema,
  CreateKeyInputSchema,
  DecidePartnerInputSchema,
  RevokeKeyInputSchema,
  RotateKeyInputSchema,
} from "./schemas";
import { isScopeAllowedForType, type B2bScope } from "./scopes";
import { B2B_TERMS_TEXT_VERSION } from "./terms";

// Casos de uso do portal B2B (S24). Dependências injetadas (repositório, gerador de chave, pepper, relógio):
// autorização final é do banco (SessionActor + funções SQL), aqui vão as regras de produto — mesmo padrão de
// `features/leads/service.ts`. O texto claro da chave nasce e morre aqui e no retorno da Server Action: nunca é
// logado (`console.*` só recebe código/id, nunca `plaintext`/`secret`).

export type B2bRepository = {
  applyPartner: (actor: SessionActor, payload: ApplyPartnerPayload, termsVersion: string) => Promise<{ partnerId: string }>;
  myPartnerId: (actor: SessionActor) => Promise<string | null>;
  getMyPartner: (actor: SessionActor) => Promise<PartnerOverview | null>;
  getKeyEnvironment: (keyId: string) => Promise<ApiKeyEnvironment | null>;
  createKey: (
    actor: SessionActor,
    partnerId: string,
    input: { environment: ApiKeyEnvironment; publicId: string; keyHash: string; hashVersion: number; last4: string; scopes: readonly B2bScope[] },
  ) => Promise<{ keyId: string }>;
  rotateKey: (
    actor: SessionActor,
    input: { oldKeyId: string; publicId: string; keyHash: string; hashVersion: number; last4: string; graceDays?: number },
  ) => Promise<{ keyId: string }>;
  revokeKey: (actor: SessionActor, keyId: string, reason?: string) => Promise<void>;
  listPartners: (actor: SessionActor, filter?: { status?: string; partnerType?: string }) => Promise<AdminPartnerRow[]>;
  getPartner: (actor: SessionActor, partnerId: string) => Promise<PartnerOverview | null>;
  decide: (actor: SessionActor, partnerId: string, input: Record<string, unknown> & { to: string }) => Promise<string>;
  adminRevokeKey: (actor: SessionActor, keyId: string, reason?: string) => Promise<void>;
};

export type B2bServiceDeps = {
  repo: B2bRepository;
  generateKey: (environment: ApiKeyEnvironment) => GeneratedApiKey;
  hashSecret: (secret: string, pepper: string, hashVersion?: number) => string;
  /** `undefined` = pepper não configurado (emissão de chave indisponível). */
  pepper: () => string | undefined;
  now: () => Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireAdmin(actor: SessionActor): void {
  if (actor.role !== "admin") throw new B2bServiceError("só admin executa esta ação", "forbidden");
}

export class B2bService {
  constructor(private readonly deps: B2bServiceDeps) {}

  /** Cadastro (B2B00). Sem consentimento, nem toca o repositório. CNPJ é validado (DV) e normalizado aqui. */
  async applyPartner(actor: SessionActor, raw: unknown): Promise<{ partnerId: string }> {
    if (isRecord(raw) && raw.termsAccepted !== true) throw new B2bServiceError("aceite dos termos obrigatório", "consent_required");
    const parsed = ApplyPartnerInputSchema.safeParse(raw);
    if (!parsed.success) throw new B2bServiceError("cadastro inválido", "invalid_input");
    const input = parsed.data;
    const cnpj = normalizeCnpj(input.cnpj);
    if (!cnpj) throw new B2bServiceError("CNPJ inválido", "invalid_input");
    const payload: ApplyPartnerPayload = {
      tradeName: input.tradeName,
      legalName: input.legalName,
      cnpj,
      contactName: input.contactName,
      partnerType: input.partnerType,
      coverageUfs: input.coverageUfs ?? null,
    };
    return this.deps.repo.applyPartner(actor, payload, B2B_TERMS_TEXT_VERSION);
  }

  async getMyPartner(actor: SessionActor): Promise<PartnerOverview | null> {
    return this.deps.repo.getMyPartner(actor);
  }

  /** Cria uma chave nova; devolve o texto claro (`plaintext`) UMA VEZ. Nunca logado. */
  async createKey(actor: SessionActor, raw: unknown): Promise<GeneratedApiKey> {
    const parsed = CreateKeyInputSchema.safeParse(raw);
    if (!parsed.success) throw new B2bServiceError("pedido de chave inválido", "invalid_input");
    const { environment, scopes } = parsed.data;
    const pepper = this.deps.pepper();
    if (!pepper) throw new B2bServiceError("emissão de chaves indisponível no momento", "service_unavailable");

    const partnerId = await this.deps.repo.myPartnerId(actor);
    if (!partnerId) throw new B2bServiceError("parceiro não encontrado", "not_found");

    const key = this.deps.generateKey(environment);
    const keyHash = this.deps.hashSecret(key.secret, pepper);
    await this.deps.repo.createKey(actor, partnerId, { environment, publicId: key.publicId, keyHash, hashVersion: 1, last4: key.last4, scopes: scopes as readonly B2bScope[] });
    return key;
  }

  /** Rotaciona; devolve o texto claro da chave NOVA uma vez. A antiga continua válida durante a carência. */
  async rotateKey(actor: SessionActor, raw: unknown): Promise<GeneratedApiKey> {
    const parsed = RotateKeyInputSchema.safeParse(raw);
    if (!parsed.success) throw new B2bServiceError("pedido de rotação inválido", "invalid_input");
    const { keyId, graceDays } = parsed.data;
    const pepper = this.deps.pepper();
    if (!pepper) throw new B2bServiceError("emissão de chaves indisponível no momento", "service_unavailable");

    const environment = await this.deps.repo.getKeyEnvironment(keyId);
    if (!environment) throw new B2bServiceError("chave não encontrada", "not_found");

    const key = this.deps.generateKey(environment);
    const keyHash = this.deps.hashSecret(key.secret, pepper);
    await this.deps.repo.rotateKey(actor, { oldKeyId: keyId, publicId: key.publicId, keyHash, hashVersion: 1, last4: key.last4, graceDays });
    return key;
  }

  async revokeKey(actor: SessionActor, raw: unknown): Promise<void> {
    const parsed = RevokeKeyInputSchema.safeParse(raw);
    if (!parsed.success) throw new B2bServiceError("pedido de revogação inválido", "invalid_input");
    await this.deps.repo.revokeKey(actor, parsed.data.keyId, parsed.data.reason);
  }

  // -- Admin ----------------------------------------------------------------

  async listPartners(actor: SessionActor, filter?: { status?: string; partnerType?: string }): Promise<AdminPartnerRow[]> {
    requireAdmin(actor);
    return this.deps.repo.listPartners(actor, filter);
  }

  async getPartner(actor: SessionActor, partnerId: string): Promise<PartnerOverview | null> {
    requireAdmin(actor);
    return this.deps.repo.getPartner(actor, partnerId);
  }

  async decidePartner(actor: SessionActor, partnerId: string, raw: unknown): Promise<string> {
    requireAdmin(actor);
    const parsed = DecidePartnerInputSchema.safeParse(raw);
    if (!parsed.success) throw new B2bServiceError("decisão inválida", "invalid_input");
    const { to, ...rest } = parsed.data;
    return this.deps.repo.decide(actor, partnerId, { to, ...rest });
  }

  async adminRevokeKey(actor: SessionActor, keyId: string, reason?: string): Promise<void> {
    requireAdmin(actor);
    await this.deps.repo.adminRevokeKey(actor, keyId, reason);
  }
}

/** Escopo fora do permitido para o tipo do parceiro: checagem cliente-visível antes do banco (UX; o banco recusa
 * de qualquer forma com `scope_not_allowed`). Exportado para a tela de "Nova chave" (Task 3). */
export function scopesAllowedFor(type: "retailer" | "brand" | "edtech", scopes: readonly B2bScope[]): boolean {
  return scopes.every((s) => isScopeAllowedForType(type, s));
}
