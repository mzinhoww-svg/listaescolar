import type { B2bPartnerStatus } from "@/features/b2b/states";

// Selo de status (parceiro ou chave). Puro/apresentacional: quem chama decide o rótulo e o tom; os mapas de
// status do parceiro ficam aqui porque só os componentes de B2B precisam deles (Admin15, B2B01/02, PortalShell).

export type BadgeTone = "neutral" | "ok" | "warn" | "error" | "info";

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: "bg-campo text-texto-2",
  ok: "bg-verde-certo text-tinta",
  warn: "bg-[#FDEBD3] text-[#6B3A00]",
  error: "bg-erro-fundo text-erro-texto",
  info: "bg-tinta text-papel",
};

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return <span className={`rounded-botao inline-flex items-center px-3 py-1 text-[12px] font-extrabold ${TONE_CLASS[tone]}`}>{children}</span>;
}

export const PARTNER_STATUS_LABEL: Readonly<Record<B2bPartnerStatus, string>> = {
  pending: "Aguardando aprovação",
  sandbox: "Sandbox",
  active: "Ativa",
  rejected: "Recusada",
  suspended: "Suspensa",
};

export const PARTNER_STATUS_TONE: Readonly<Record<B2bPartnerStatus, BadgeTone>> = {
  pending: "warn",
  sandbox: "info",
  active: "ok",
  rejected: "error",
  suspended: "error",
};

export function PartnerStatusBadge({ status }: { status: B2bPartnerStatus }) {
  return <StatusBadge tone={PARTNER_STATUS_TONE[status]}>{PARTNER_STATUS_LABEL[status]}</StatusBadge>;
}

const KEY_STATUS_LABEL = { active: "Ativa", revoked: "Revogada" } as const;

/** Fora do componente de propósito (regra de pureza do React/eslint-plugin-react-hooks): `Date.now()` não pode
 * ser chamado direto no corpo de um componente. */
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function KeyStatusBadge({ status, expiresAt }: { status: "active" | "revoked"; expiresAt: string | null }) {
  if (status === "revoked") return <StatusBadge tone="error">{KEY_STATUS_LABEL.revoked}</StatusBadge>;
  if (expiresAt) {
    const days = daysUntil(expiresAt);
    return <StatusBadge tone="warn">Expira em {days} {days === 1 ? "dia" : "dias"}</StatusBadge>;
  }
  return <StatusBadge tone="ok">{KEY_STATUS_LABEL.active}</StatusBadge>;
}
