import type { ClaimMethod, ClaimStatus } from "./state";
import type { ConfirmResult } from "./types";

/** Textos fixos. Nada de prazo, nada de "avisaremos por e-mail" (S11), nada que afirme verificação antes da aprovação. */
export const STATUS_LABEL: Record<ClaimStatus, string> = {
  submitted: "Pedido iniciado",
  awaiting_verification: "Em análise",
  token_expired: "Confirmação vencida",
  insufficient_evidence: "Precisa de mais evidências",
  rejected: "Recusada",
  approved: "Aprovada",
};

export const STATUS_HINT: Record<ClaimStatus, string> = {
  submitted: "Conclua o pedido para a equipe ListaCerta analisar.",
  awaiting_verification: "Acompanhe o status nesta página.",
  token_expired: "O código ou link venceu. Peça um novo para continuar.",
  insufficient_evidence: "A equipe ListaCerta pediu mais evidências. Veja o motivo e reenvie.",
  rejected: "A reivindicação foi recusada. Veja o motivo abaixo.",
  approved: "Escola verificada pela equipe ListaCerta.",
};

export const METHOD_LABEL: Record<ClaimMethod, string> = {
  institutional_email: "E-mail da escola registrado no INEP",
  institutional_whatsapp: "WhatsApp da escola registrado no INEP",
  documents: "Documentos",
};

export const INEP_NOTE = "Escola encontrada no cadastro do INEP. O cadastro do INEP não é verificação.";
export const PRIVACY_TEXT =
  "Aceito que a ListaCerta guarde meu nome, cargo e e-mail da conta para analisar esta reivindicação.";
export const EVIDENCE_WARNING = "Não envie documentos com dados de alunos.";
export const ROLE_BLOCK_MESSAGE = "Só uma conta de responsável ou de escola pode reivindicar uma escola. Entre com essa conta para continuar.";
export const ADMIN_ONLY_MESSAGE = "Esta ação é só para administradores.";

export const CONFIRM_MESSAGE: Record<ConfirmResult, string> = {
  confirmed: "Canal confirmado. A equipe ListaCerta segue com a análise; acompanhe o status na página da reivindicação.",
  already_confirmed: "Este canal já foi confirmado.",
  expired: "O link ou código venceu. Peça um novo na página da reivindicação.",
  invalid: "Link ou código inválido para esta conta.",
  locked: "Tentativas esgotadas. Peça um novo código na página da reivindicação.",
};

export type ClaimErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_state"
  | "invalid_argument"
  | "school_closed"
  | "limit"
  | "wait"
  | "delivery_unavailable"
  | "delivery_failed"
  | "storage"
  | "invalid_file"
  | "file_too_large"
  | "conflict"
  | "account_email"
  | "approval_needs_channel"
  | "approval_needs_evidence"
  | "database";

const BY_CODE: Record<ClaimErrorCode, string> = {
  not_found: "Reivindicação não encontrada.",
  forbidden: "Você não tem permissão para esta ação.",
  invalid_state: "Esta ação não está disponível no estado atual da reivindicação.",
  invalid_argument: "Dados inválidos. Revise e tente de novo.",
  school_closed: "Esta escola não aceita reivindicação agora.",
  limit: "Você atingiu um limite (reivindicações, evidências ou códigos). Tente mais tarde ou use outro método.",
  wait: "Aguarde um minuto para pedir outro código.",
  delivery_unavailable: "Envio indisponível no momento. Use o método de documentos.",
  delivery_failed: "Não foi possível enviar agora. Aguarde um minuto e tente de novo.",
  storage: "Não foi possível guardar o arquivo agora. Tente de novo.",
  invalid_file: "Arquivo inválido. Envie um PDF, PNG ou JPEG que corresponda ao tipo do arquivo.",
  file_too_large: "O arquivo passa de 4 MB.",
  conflict: "Já existe uma reivindicação em aberto ou aprovada para esta escola.",
  account_email: "O e-mail da sua conta está ausente ou inválido. Corrija o e-mail da conta e tente de novo.",
  approval_needs_channel: "Não dá para aprovar: o canal (e-mail ou WhatsApp) ainda não foi confirmado.",
  approval_needs_evidence: "Não dá para aprovar: falta ao menos uma evidência enviada.",
  database: "Não foi possível concluir agora. Tente de novo.",
};

/** Mensagem fixa para um erro do repositório; erro desconhecido vira a mensagem genérica (nunca o texto do banco). */
export function errorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  return (BY_CODE as Record<string, string>)[code] ?? BY_CODE.database;
}
