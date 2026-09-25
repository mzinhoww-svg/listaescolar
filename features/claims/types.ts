import type { ClaimMethod, ClaimStatus } from "./state";

export type ConfirmResult = "confirmed" | "expired" | "invalid" | "locked" | "already_confirmed";

export type ClaimEventView = { fromStatus: ClaimStatus | null; toStatus: ClaimStatus; actorKind: "claimant" | "admin" | "system"; reason: string | null; createdAt: string };
export type EvidenceView = { id: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string };

/** O que o reivindicante vê da própria reivindicação (sem `decided_by`, sem contato da escola). */
export type ClaimView = {
  id: string;
  schoolId: string;
  method: ClaimMethod;
  status: ClaimStatus;
  claimantName: string;
  claimantRoleTitle: string;
  evidenceNote: string | null;
  channelConfirmedAt: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  isDemo: boolean;
  createdAt: string;
};
export type ClaimStatusView = ClaimView & { events: ClaimEventView[]; evidence: EvidenceView[] };

export type QueueRow = {
  id: string;
  status: ClaimStatus;
  method: ClaimMethod;
  claimantName: string;
  claimantRoleTitle: string;
  contactEmail: string;
  channelConfirmedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  isDemo: boolean;
  evidenceCount: number;
  school: { inep: string; name: string };
};
export type AdminClaimView = QueueRow & {
  evidenceNote: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  events: ClaimEventView[];
  evidence: EvidenceView[];
  school: { id: string; inep: string; name: string; verificationStatus: string };
};

export type SchoolClaimContext = {
  school: { id: string; inep: string; name: string; municipality: string; verificationStatus: string; isDemo: boolean };
  /** Motivo fixo (texto) quando a escola não aceita reivindicação; `null` = pode reivindicar. */
  blockedReason: string | null;
  methods: Record<ClaimMethod, { available: true } | { available: false; reason: string }>;
};
