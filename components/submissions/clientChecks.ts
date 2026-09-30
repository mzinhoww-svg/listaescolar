import { ERROR_MESSAGES, type ErrorField } from "@/features/submissions/copy";
import { MAX_UPLOAD_BYTES } from "@/features/submissions/constants";

/** O arquivo escolhido (foto ou galeria; só um dos campos tem arquivo). */
export function pickedFile(form: HTMLFormElement): File | undefined {
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  return inputs.flatMap((i) => Array.from(i.files ?? [])).find((f) => f.name !== "");
}

export type FieldErrors = Partial<Record<ErrorField, string>>;

/** Conferência barata no navegador, de TODOS os campos de uma vez (S29 UX-064); o servidor e o banco repetem tudo. */
export function clientChecks(form: HTMLFormElement, opts: { compressImages?: boolean } = {}): FieldErrors {
  const data = new FormData(form);
  const errors: FieldErrors = {};
  if (data.get("consent") !== "on") errors.consent = ERROR_MESSAGES.consent_required;
  if (!data.get("grade")) errors.grade = ERROR_MESSAGES.invalid_input;
  const file = pickedFile(form);
  if (!file) errors.file = ERROR_MESSAGES.no_file;
  else if (file.size === 0) errors.file = ERROR_MESSAGES.empty_file;
  else if (file.size > MAX_UPLOAD_BYTES) {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) errors.file = ERROR_MESSAGES.pdf_too_large;
    // fotos grandes são reduzidas no envio (prepareUpload); o resto passa do teto de 4 MB
    else if (!(opts.compressImages && (file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)))) {
      errors.file = ERROR_MESSAGES.file_too_large;
    }
  }
  return errors;
}

/** Primeira mensagem (consentimento, série, arquivo): o formulário da escola mostra um erro só. */
export function clientCheck(form: HTMLFormElement, opts: { compressImages?: boolean } = {}): string | null {
  const e = clientChecks(form, opts);
  return e.consent ?? e.grade ?? e.file ?? null;
}

export const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
