import type { VerificationStatus } from "./types";

export type StatusLabel = {
  label: string;
  description: string;
  /** Selo extra "Demonstração" quando a escola é dado demonstrativo. */
  demoLabel: string | null;
  /** true só para `verified`: a única situação em que "verificada" é verdadeiro. */
  verified: boolean;
};

const BASE: Record<VerificationStatus, { label: string; description: string; verified: boolean }> = {
  registered: {
    label: "Cadastrada",
    description: "Cadastro a partir do INEP; não indica verificação pela escola.",
    verified: false,
  },
  claimed: {
    label: "Reivindicada",
    description: "Um representante pediu para administrar este perfil; a verificação ainda não foi concluída.",
    verified: false,
  },
  verified: {
    label: "Verificada",
    description: "A escola teve o vínculo do representante verificado.",
    verified: true,
  },
  suspended: {
    label: "Suspensa",
    description: "Este perfil está suspenso; as informações podem estar desatualizadas.",
    verified: false,
  },
};

export function statusLabel(status: VerificationStatus, isDemo: boolean): StatusLabel {
  const b = BASE[status];
  return { ...b, demoLabel: isDemo ? "Demonstração" : null };
}
