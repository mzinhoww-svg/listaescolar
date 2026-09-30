import { LEAD_STATUS_LABEL } from "@/features/leads/state";

/** Rótulos em pt-BR das 5 categorias do dashboard (Admin01-Visao). Só apresentação; a contagem vem de `dashboard.ts`. */
export const SCHOOL_STATE_LABEL: Record<string, string> = {
  registered: "Cadastrada (INEP)",
  claimed: "Em verificação",
  verified: "Verificada",
  suspended: "Suspensa",
};

export const LIST_STATE_LABEL: Record<string, string> = {
  draft: "Rascunho",
  submitted: "Enviada",
  processing: "Processando",
  processing_async: "Processando (fila)",
  review_needed: "Precisa de revisão",
  human_review: "Em revisão humana",
  approved: "Aprovada",
  published: "Publicada",
  archived: "Arquivada",
  rejected: "Recusada",
};

export const CLAIM_STATE_LABEL: Record<string, string> = {
  submitted: "Enviada",
  awaiting_verification: "Aguardando verificação",
  token_expired: "Token expirado",
  insufficient_evidence: "Evidência insuficiente",
  rejected: "Recusada",
  approved: "Aprovada",
};

export const STATIONERY_STATE_LABEL: Record<string, string> = {
  signup: "Cadastro iniciado",
  accreditation: "Credenciamento",
  under_review: "Em revisão",
  approved: "Aprovada",
  active: "Ativa",
  paused: "Pausada",
  suspended: "Suspensa",
  rejected: "Recusada",
};

export const LEAD_STATE_LABEL: Record<string, string> = LEAD_STATUS_LABEL;

export const DASHBOARD_CATEGORY_LABEL: Record<"schools" | "lists" | "claims" | "stationeries" | "leads", string> = {
  schools: "Escolas",
  lists: "Listas",
  claims: "Reivindicações",
  stationeries: "Papelarias",
  leads: "Leads",
};
