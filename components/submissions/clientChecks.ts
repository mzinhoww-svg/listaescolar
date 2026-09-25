import { ERROR_MESSAGES } from "@/features/submissions/copy";
import { MAX_UPLOAD_BYTES } from "@/features/submissions/constants";

/** O arquivo escolhido (foto ou galeria; só um dos campos tem arquivo). */
export function pickedFile(form: HTMLFormElement): File | undefined {
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  return inputs.flatMap((i) => Array.from(i.files ?? [])).find((f) => f.name !== "");
}

/** Conferência barata no navegador; o servidor e o banco repetem tudo. Devolve a mensagem ou null. */
export function clientCheck(form: HTMLFormElement, opts: { compressImages?: boolean } = {}): string | null {
  const data = new FormData(form);
  if (data.get("consent") !== "on") return ERROR_MESSAGES.consent_required;
  if (!data.get("grade")) return ERROR_MESSAGES.invalid_input;
  const file = pickedFile(form);
  if (!file) return ERROR_MESSAGES.no_file;
  if (file.size === 0) return ERROR_MESSAGES.empty_file;
  if (file.size > MAX_UPLOAD_BYTES) {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return ERROR_MESSAGES.pdf_too_large;
    // fotos grandes são reduzidas no envio (prepareUpload); o resto passa do teto de 4 MB
    if (!(opts.compressImages && (file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)))) {
      return ERROR_MESSAGES.file_too_large;
    }
  }
  return null;
}

export const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
