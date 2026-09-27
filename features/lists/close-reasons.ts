/**
 * Motivo de arquivamento de lista, por código (revisão de segurança, S16) — mesmo padrão de
 * `lead_reviews.hidden_reason` (0402) e `lead_disputes.reason` (0402): nunca texto livre do admin, só um código
 * de um vocabulário fixo, com uma observação curta opcional (mesma regra de código de `reports.detail_code`,
 * 0604 — nunca prosa/dado pessoal). `list_status_events.reason` (0103) aceita texto livre até 1000 chars a nível
 * de banco; esta fatia decide não usar essa liberdade.
 */
export const LIST_CLOSE_REASONS = [
  "denuncia_procedente",
  "solicitacao_escola",
  "conteudo_indevido",
  "duplicada",
  "outro",
] as const;
export type ListCloseReason = (typeof LIST_CLOSE_REASONS)[number];
export const LIST_CLOSE_REASON_LABEL: Record<ListCloseReason, string> = {
  denuncia_procedente: "Denúncia procedente",
  solicitacao_escola: "Solicitação da escola",
  conteudo_indevido: "Conteúdo indevido",
  duplicada: "Lista duplicada",
  outro: "Outro",
};

const OBSERVATION_RE = /^[a-z][a-z0-9_.-]{0,59}$/;

/** Código + observação opcional -> string única gravada em list_status_events.reason ("codigo" ou "codigo:observacao"). */
export function composeCloseReason(code: ListCloseReason, observation?: string | null): string {
  const obs = observation ? observation.trim().toLowerCase() : "";
  return obs ? `${code}:${obs}` : code;
}

export function isValidObservationCode(v: string): boolean {
  return OBSERVATION_RE.test(v);
}
