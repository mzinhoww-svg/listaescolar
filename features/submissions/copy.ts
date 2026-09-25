import type { UploadErrorCode } from "./file-validation";

/**
 * Texto do consentimento. As telas de referência (App15) só trazem o aviso de revisão; a primeira frase é o
 * mínimo para o aceite ser explícito. Se o texto mudar, mude também CONSENT_TEXT_VERSION (constants.ts).
 */
export const CONSENT_LABEL =
  "Concordo em enviar este arquivo. Sua lista passa por revisão antes de aparecer para outras famílias.";
export const REVIEW_NOTICE = "Sua lista passa por revisão antes de aparecer para outras famílias.";

export type FormErrorCode =
  | "consent_required"
  | "invalid_input"
  | "no_file"
  | "forbidden"
  | "unexpected"
  | "pdf_too_large"
  | "image_undecodable"
  | UploadErrorCode;

export const ERROR_MESSAGES: Record<FormErrorCode, string> = {
  consent_required: "Marque o consentimento para enviar a lista.",
  invalid_input: "Confira a série e o ano letivo.",
  no_file: "Escolha um arquivo (PDF ou foto) para enviar.",
  forbidden: "Seu perfil não pode enviar listas por aqui.",
  unexpected: "Não foi possível enviar agora. Tente novamente em instantes.",
  empty_file: "O arquivo está vazio. Escolha outro.",
  file_too_large: "O arquivo passa de 4 MB. Envie um arquivo menor.",
  pdf_too_large: "Este PDF passa de 4 MB. Comprima o PDF ou envie fotos das páginas.",
  image_undecodable: "Não conseguimos reduzir esta foto (formatos como HEIC). Envie em JPG ou PNG, ou como PDF.",
  unsupported_type: "Tipo de arquivo não aceito. Envie PDF, JPG, PNG, WEBP ou HEIC.",
  signature_mismatch: "O conteúdo do arquivo não confere com o tipo informado. Escolha outro arquivo.",
  encrypted_pdf: "Este PDF tem senha. Envie uma versão sem proteção.",
  corrupt_file: "Não conseguimos abrir este arquivo. Escolha outro.",
  image_too_large: "A imagem é grande demais. Envie uma foto menor.",
};

export const messageFor = (code: FormErrorCode): string => ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unexpected;

export const GRADE_OPTIONS = [
  "Educação infantil",
  "1º ano",
  "2º ano",
  "3º ano",
  "4º ano",
  "5º ano",
  "6º ano",
  "7º ano",
  "8º ano",
  "9º ano",
  "1ª série do ensino médio",
  "2ª série do ensino médio",
  "3ª série do ensino médio",
] as const;

export const ACCEPT_ATTR = "application/pdf,image/jpeg,image/png,image/webp,image/heic,.pdf,.jpg,.jpeg,.png,.webp,.heic";
