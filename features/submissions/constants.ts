/** Orçamento síncrono do pipeline de extração. Injetável em `submitList` para os testes. */
export const SYNC_BUDGET_MS = 10_000;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Imagem acima disto (por lado ou em pixels) é recusada antes de chegar ao pipeline. */
export const MAX_IMAGE_SIDE_PX = 12_000;
export const MAX_IMAGE_PIXELS = 100_000_000;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export const UPLOAD_BUCKET = "list-uploads";

/** Consentimento: só o texto da tela App15; a versão muda quando o texto mudar. */
export const CONSENT_PURPOSE = "list_upload";
export const CONSENT_TEXT_VERSION = "2026-09-v1";

export const OCR_JOB_KIND = "ocr_jobs";
