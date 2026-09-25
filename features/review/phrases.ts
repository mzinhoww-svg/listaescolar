// Frases da revisão humana (S10). Só códigos entram em ai_decisions; o texto mostrado ao admin vem daqui, nunca de texto livre.
// Alertas são sinalizações para revisão, não parecer jurídico (regra de produto do repositório): rótulos neutros.
import { REASON_CODE_PATTERN, type ReasonCode } from "../../supabase/functions/_shared/publication/codes";

import type { ItemCategory } from "../../supabase/functions/_shared/extraction-schema";

import type { BlockerCode, RejectReason } from "./codes";

/** Exaustivo: código novo na S09 quebra o typecheck aqui. */
const REASON_PHRASES: Record<ReasonCode, string> = {
  overall_below_threshold: "Confiança geral abaixo do mínimo configurado",
  low_confidence_extraction: "Extração aceita com confiança baixa",
  critical_alert: "Alerta crítico no documento",
  empty_list: "Nenhum item lido no documento",
  item_below_threshold: "Itens com confiança abaixo do mínimo",
  item_without_quantity: "Itens sem quantidade",
  item_flagged: "Itens sinalizados para conferência",
  missing_school: "Escola não informada no envio",
  missing_grade: "Série não informada no envio",
  missing_school_year: "Ano letivo não informado no envio",
  item_incomplete: "Itens sem nome padronizado ou categoria",
  extraction_metadata_missing: "Resultado da leitura incompleto",
  invalid_extraction_result: "Resultado da leitura inválido",
  school_not_found: "Escola não encontrada",
  school_not_verified: "Escola ainda não verificada",
  school_suspended: "Escola suspensa",
  municipality_not_enabled: "Município não habilitado",
  grade_unresolved: "Série não reconhecida no catálogo",
  school_year_invalid: "Ano letivo fora dos anos válidos",
  school_grade_year_mismatch: "Escola, série e ano não conferem",
  list_archived: "A lista de destino está arquivada",
  parent_submission: "Enviada por família: sempre revisada pela equipe",
  submitter_not_linked: "Remetente sem vínculo confirmado com a escola",
  demo_submission: "Envio de demonstração",
  auto_publish_disabled: "Publicação automática desligada",
  publisher_unavailable: "Publicação automática indisponível neste ambiente",
  context_unavailable: "Dados da escola indisponíveis neste ambiente",
  settings_unavailable: "Configuração indisponível",
};

/** Falhas de publicação (linhas publish_failed da S09 e da S10) que não são motivo de veredito. */
const FAILURE_PHRASES: Record<string, string> = {
  publish_expired: "A publicação não foi concluída a tempo",
  publish_rejected: "A publicação foi recusada",
  invalid_publish_result: "A publicação devolveu um resultado inválido",
  idempotency_conflict: "Conflito na publicação: mesma chave com conteúdo diferente",
  no_items: "A publicação foi recusada: lista sem itens",
  publish_timeout: "A publicação demorou demais",
};

const isReason = (c: string): c is ReasonCode => Object.hasOwn(REASON_PHRASES, c);

/** Frase para um código de motivo/falha. Código fora do alfabeto (texto livre) nunca é ecoado. */
export function reasonPhrase(code: string): string {
  if (isReason(code)) return REASON_PHRASES[code];
  if (Object.hasOwn(FAILURE_PHRASES, code)) return FAILURE_PHRASES[code] as string;
  return `Falha técnica na publicação (código ${REASON_CODE_PATTERN.test(code) ? code : "desconhecido"})`;
}

const ALERT_LABELS: Record<string, string> = {
  low_confidence_item: "Leitura com baixa confiança: conferir com o documento.",
  ambiguous_item: "Item ambíguo: conferir com o documento.",
  handwritten: "Documento manuscrito: conferir cada item com o original.",
  possible_collective_item: "Possível item coletivo: conferir se vale para todos.",
  restrictive_brand_or_spec: "Marca ou especificação exigida: conferir antes de publicar.",
  text_document_mismatch: "Texto e documento podem não corresponder: conferir.",
  invalid_school_grade_year: "Escola, série ou ano podem estar incorretos: conferir.",
};
export const alertLabel = (code: string): string => (Object.hasOwn(ALERT_LABELS, code) ? (ALERT_LABELS[code] as string) : "Alerta do documento");

const BLOCKER_PHRASES: Record<BlockerCode, string> = {
  no_items: "A lista precisa ter ao menos um item.",
  item_name_missing: "Há item sem nome.",
  item_quantity_missing: "Há item sem quantidade: informe um número de 1 a 9999.",
  item_category_missing: "Há item sem categoria.",
  grade_missing: "Informe a série.",
  school_year_missing: "Informe o ano letivo.",
  school_missing: "O envio não tem escola: só é possível recusar até a integração de escolas.",
  critical_alerts_unconfirmed: "Confirme que conferiu o documento original.",
  context_unavailable: "Os dados da escola não estão disponíveis neste ambiente.",
  school_not_found: "Escola não encontrada.",
  school_suspended: "A escola está suspensa.",
  municipality_not_enabled: "O município da escola não está habilitado.",
  grade_unresolved: "A série não foi reconhecida no catálogo.",
  school_year_invalid: "O ano letivo não está entre os anos válidos.",
  list_archived: "A lista de destino está arquivada.",
};
export const blockerPhrase = (code: BlockerCode): string => BLOCKER_PHRASES[code];

const REJECT_LABELS: Record<RejectReason, string> = {
  not_a_school_list: "Não é uma lista escolar",
  illegible_document: "Documento ilegível",
  wrong_school_grade_year: "Escola, série ou ano incorretos",
  duplicate_submission: "Envio duplicado",
  incomplete_list: "Lista incompleta",
  inappropriate_content: "Conteúdo inadequado",
  other: "Outro motivo",
};
export const rejectReasonLabel = (code: RejectReason): string => REJECT_LABELS[code];

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  papelaria: "Papelaria",
  escrita: "Escrita",
  arte: "Arte",
  tecnologia: "Tecnologia",
  higiene: "Higiene",
  livros: "Livros",
  uniforme: "Uniforme",
  outros: "Outros",
};
/** Rótulo legível da categoria; o valor cru só vai no `value` do campo. Categoria desconhecida nunca é ecoada. */
export const categoryLabel = (c: string | null): string => (c !== null && Object.hasOwn(CATEGORY_LABELS, c) ? (CATEGORY_LABELS[c as ItemCategory] as string) : "indisponível");
