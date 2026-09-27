import { StatusBadge, type BadgeTone } from "./StatusBadge";

// Selo de status de campanha (B2B06/B2B07/Admin16). Mesmo padrão de components/b2b/StatusBadge.tsx.

export type CampaignStatus = "draft" | "pending_review" | "approved" | "rejected" | "paused" | "completed";

export const CAMPAIGN_STATUS_LABEL: Readonly<Record<CampaignStatus, string>> = {
  draft: "Rascunho",
  pending_review: "Aguardando aprovação",
  approved: "Ativa",
  rejected: "Recusada",
  paused: "Pausada",
  completed: "Concluída",
};

const CAMPAIGN_STATUS_TONE: Readonly<Record<CampaignStatus, BadgeTone>> = {
  draft: "neutral",
  pending_review: "warn",
  approved: "ok",
  rejected: "error",
  paused: "warn",
  completed: "info",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <StatusBadge tone={CAMPAIGN_STATUS_TONE[status]}>{CAMPAIGN_STATUS_LABEL[status]}</StatusBadge>;
}

export const GRADE_STAGE_LABEL: Readonly<Record<"ei" | "ef" | "em", string>> = {
  ei: "Educação infantil",
  ef: "Ensino fundamental",
  em: "Ensino médio",
};

export const PRICING_MODEL_LABEL: Readonly<Record<"cpm" | "cpc", string>> = {
  cpm: "CPM (por mil exibições)",
  cpc: "CPC (por clique)",
};
