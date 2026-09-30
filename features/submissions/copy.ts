import type { UploadErrorCode } from "./file-validation";

/**
 * Texto do consentimento (S29 UX-067): diz que o arquivo é lido por serviço de inteligência artificial, que a equipe
 * revisa antes de a lista aparecer para outras famílias e pede para não mostrar dado do aluno. É o ÚNICO lugar do
 * formulário que fala da revisão. Se o texto mudar, mude também CONSENT_TEXT_VERSION (constants.ts).
 */
export const CONSENT_LABEL =
  "Concordo em enviar este arquivo. Ele pode ser lido por um serviço de inteligência artificial e a equipe revisa a lista antes de ela aparecer para outras famílias. Não deixe aparecer nome de aluno na foto ou no PDF.";
/** Prazo de guarda do arquivo: definição do humano (H-05); sem ela, "indisponível" (nada inventado). */
export const CONSENT_RETENTION_NOTE = "Prazo de guarda do arquivo: indisponível por enquanto.";
/** Dito quando a foto grande foi reduzida no navegador antes do envio (UX-071). */
export const REDUCED_NOTE = "Reduzimos a foto para caber.";
export const REVIEW_NOTICE = "Sua lista passa por revisão antes de aparecer para outras famílias.";

export type FormErrorCode =
  | "consent_required"
  | "invalid_input"
  | "no_file"
  | "forbidden"
  | "school_not_linked"
  | "unexpected"
  | "pdf_too_large"
  | "image_undecodable"
  | "rate_limited"
  | "network"
  | UploadErrorCode;

export const ERROR_MESSAGES: Record<FormErrorCode, string> = {
  consent_required: "Marque o consentimento para enviar a lista.",
  invalid_input: "Confira a série e o ano letivo.",
  no_file: "Escolha um arquivo (PDF ou foto) para enviar.",
  forbidden: "Seu perfil não pode enviar listas por aqui.",
  school_not_linked: "Você ainda não tem vínculo confirmado com esta escola. Reivindique a escola antes de enviar a lista.",
  unexpected: "Não foi possível enviar agora. Tente novamente em instantes.",
  network: "Não conseguimos enviar: a conexão falhou. O que você escolheu continua aqui.",
  rate_limited: "Muitos envios em pouco tempo. Aguarde um pouco e tente de novo.",
  empty_file: "O arquivo está vazio. Escolha outro.",
  file_too_large: "Este arquivo passa de 4 MB. Tire a foto de novo ou envie um PDF menor.",
  pdf_too_large: "Este PDF passa de 4 MB. Envie um PDF menor ou fotos das páginas.",
  image_undecodable: "Não conseguimos reduzir esta foto. Tire a foto de novo ou envie a lista como PDF.",
  unsupported_type: "Tipo de arquivo não aceito. Envie uma foto ou PDF da lista.",
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

/**
 * Estado da decisão de publicação (S09). Só o estado: nenhum prazo, contagem ou motivo em texto livre
 * (os códigos de motivo ficam em `ai_decisions`, para a equipe; a S10 os mostra ao admin).
 */
export const PUBLICATION_STATE_COPY: Record<"human_review" | "approved" | "published" | "published_auto" | "rejected", { title: string; body: string }> = {
  human_review: {
    title: "Em revisão pela equipe",
    body: "A equipe confere a lista antes de ela aparecer para outras famílias.",
  },
  approved: {
    title: "Aprovada pela equipe; publicação em andamento",
    body: "A lista foi aprovada e a publicação ainda não terminou.",
  },
  // Neutro: vale para publicação humana e para quando não se sabe quem publicou (D-071).
  published: {
    title: "Lista publicada",
    body: "Ela já aparece para outras famílias.",
  },
  // Só quando a linha `publication:published` prova que foi automática.
  published_auto: {
    title: "Publicada automaticamente",
    body: "Passou pelas verificações e já aparece para outras famílias.",
  },
  rejected: {
    title: "Lista não publicada",
    body: "A equipe não publicou esta lista como oficial.",
  },
};

export const REJECTED_COPY_HINT = "Você ainda pode usar sua cópia para montar o carrinho.";

export type ErrorField = "consent" | "grade" | "file";

const FILE_CODES: readonly FormErrorCode[] = [
  "no_file", "empty_file", "file_too_large", "pdf_too_large", "image_undecodable", "unsupported_type",
  "signature_mismatch", "encrypted_pdf", "corrupt_file", "image_too_large",
];

/** Campo a que a mensagem de erro se refere (para `aria-invalid`/`aria-describedby`); erro geral (rede, perfil) → null. */
export function errorFieldFor(message: string | null): ErrorField | null {
  if (!message) return null;
  const code = (Object.keys(ERROR_MESSAGES) as FormErrorCode[]).find((c) => ERROR_MESSAGES[c] === message);
  if (!code) return null;
  if (code === "consent_required") return "consent";
  if (code === "invalid_input") return "grade";
  return FILE_CODES.includes(code) ? "file" : null;
}

/** Id do parágrafo de erro do formulário, referenciado por `aria-describedby` dos campos com erro. */
export const FORM_ERROR_ID = "form-error";
