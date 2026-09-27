export const REPORT_TARGET_TYPES = ["school_list", "stationery", "catalog_item"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export const REPORT_TARGET_TYPE_LABEL: Record<ReportTargetType, string> = {
  school_list: "Lista",
  stationery: "Papelaria",
  catalog_item: "Item de catálogo",
};

export const REPORT_REASONS = [
  "preco_incorreto",
  "informacao_desatualizada",
  "conteudo_inadequado",
  "suspeita_fraude",
  "outro",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  preco_incorreto: "Preço incorreto",
  informacao_desatualizada: "Informação desatualizada",
  conteudo_inadequado: "Conteúdo inadequado",
  suspeita_fraude: "Suspeita de fraude",
  outro: "Outro",
};

export const REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Aberta",
  reviewing: "Em análise",
  resolved: "Resolvida",
  dismissed: "Arquivada sem ação",
};
/** Fila (Admin): estados que ainda pedem atenção do admin. */
export const OPEN_REPORT_STATUSES: readonly ReportStatus[] = ["open", "reviewing"];

export const REPORT_RESOLUTIONS = ["upheld", "no_action"] as const;
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];
export const REPORT_RESOLUTION_LABEL: Record<ReportResolution, string> = {
  upheld: "Procede",
  no_action: "Não procede",
};

export type ReportView = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  detailCode: string | null;
  reporterId: string;
  status: ReportStatus;
  resolution: ReportResolution | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

export type ReportQueueFilter = { status?: readonly ReportStatus[] };

export type CreateReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  detailCode?: string | null;
};

export type ResolveReportInput = {
  reportId: string;
  status: "reviewing" | "resolved" | "dismissed";
  resolution?: ReportResolution | null;
  resolutionNote?: string | null;
};
