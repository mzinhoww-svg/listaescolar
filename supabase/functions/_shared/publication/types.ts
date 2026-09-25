import type { ReasonCode } from "./codes.ts";

export type SubmissionSource = "parent" | "school";
export type SchoolVerification = "registered" | "claimed" | "verified" | "suspended";

/** Configuração lida de `ai_settings` no momento da decisão (nunca do resultado da extração). */
export type PublicationSettings = {
  confidenceThreshold: number;
  itemConfidenceThreshold: number;
  criticalAlerts: readonly string[];
  autoPublishEnabled: boolean;
};

/** Contexto vindo da porta `PublicationContextReader` (trilha Dados): só status, códigos e booleans. */
export type PublicationContext = {
  school: { verification: SchoolVerification; municipalityEnabled: boolean } | null;
  gradeSlug: string | null;
  validSchoolYears: readonly number[];
  submitterLinked: boolean | null;
  currentList: { listId: string; status: string; currentVersionId: string | null } | null;
};

/** Entrada do motor: sem nome, e-mail, telefone, arquivo ou caminho (nada de dado pessoal ou de menor). */
export type PublicationInput = {
  submissionId: string;
  schoolId: string | null;
  submittedBy: string;
  source: SubmissionSource;
  grade: string | null;
  schoolYear: number | null;
  isDemo: boolean;
  /** Resultado bruto do `ocr_jobs`; validado pelo motor com `extractionResultSchema`. */
  result: unknown;
  context: PublicationContext | null;
  publisherAvailable: boolean;
};

export type Verdict = {
  outcome: "auto_publish" | "human_review";
  reasons: ReasonCode[];
  justification: string;
};

/** Regra pura. `settings` nulo = configuração indisponível (falha fechada na regra `operational`). */
export type Rule = (input: PublicationInput, settings: PublicationSettings | null) => ReasonCode[];
