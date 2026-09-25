import type { SessionActor } from "@/features/stationeries/actor";

import type { LeadStatus } from "./state";

/** Contexto público da lista (nada de estudante). O leitor real é da S11; nesta fatia só o de demonstração. */
export type LeadListContext = {
  schoolName: string;
  gradeLabel: string;
  schoolYear: number;
  items: { name: string; quantity: number }[];
  isDemo: boolean;
  /** Município da escola (quando a fonte souber); senão vale o município da papelaria escolhida. */
  municipalityId?: string;
};
export interface LeadListContextReader {
  getContext(listId: string): Promise<LeadListContext | null>;
}

export type CartSnapshot = {
  id: string;
  ownerId: string;
  listId: string | null;
  isDemo: boolean;
  items: { name: string; itemKey: string; quantity: number }[];
};
/** Carrinho do próprio solicitante; inexistente e alheio devolvem o mesmo `null`. */
export interface LeadCartReader {
  getOwnedCart(actor: SessionActor, cartId: string): Promise<CartSnapshot | null>;
}

export type NewLeadNotification = { stationeryId: string; leadId: string; code: string };
export interface LeadNotifier {
  notifyNewLead(event: NewLeadNotification): Promise<void>;
}

export type PublicStationery = { id: string; name: string; municipalityId: string; whatsapp: string | null; isDemo: boolean };

export type NewLeadRecord = {
  cartId: string;
  listId: string;
  stationeryId: string;
  schoolName: string;
  gradeLabel: string;
  schoolYear: number;
  municipalityId: string;
  neighborhood: string | null;
  items: { name: string; itemKey: string; quantity: number }[];
  consentTextVersion: string;
  idempotencyKey: string;
  isDemo: boolean;
};

/** Lead como o solicitante o vê (inclui `cartId`; nunca o dado de outra pessoa). */
export type RequesterLead = {
  id: string;
  code: string;
  status: LeadStatus;
  stationeryId: string;
  cartId: string | null;
  listId: string;
  schoolName: string;
  gradeLabel: string;
  schoolYear: number;
  itemCount: number;
  expiresAt: Date;
  createdAt: Date;
};

export type TransitionRequest = {
  code: string;
  to: LeadStatus;
  as: "parent" | "stationery" | "admin";
  amountCents?: number;
  reason?: string;
};

/** Porta de persistência usada pelo serviço (implementada por `repository.ts`, com `SessionActor`). */
export interface LeadStore {
  createLead(actor: SessionActor, record: NewLeadRecord): Promise<{ leadId: string; code: string; created: boolean }>;
  getStationeryPublic(stationeryId: string): Promise<PublicStationery | null>;
  getForRequester(actor: SessionActor, code: string): Promise<RequesterLead | null>;
  transitionLead(actor: SessionActor, request: TransitionRequest): Promise<LeadStatus>;
  markViewed(actor: SessionActor, code: string): Promise<LeadStatus>;
  recordWhatsappOpen(actor: SessionActor, leadId: string): Promise<boolean>;
}
