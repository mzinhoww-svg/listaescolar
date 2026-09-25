import { ERROR_MESSAGES } from "@/features/submissions/copy";
import { MAX_UPLOAD_BYTES } from "@/features/submissions/constants";

/** Conferência barata no navegador; o servidor e o banco repetem tudo. Devolve a mensagem ou null. */
export function clientCheck(form: HTMLFormElement): string | null {
  const data = new FormData(form);
  if (data.get("consent") !== "on") return ERROR_MESSAGES.consent_required;
  if (!data.get("grade")) return ERROR_MESSAGES.invalid_input;
  // Lê dos campos de arquivo (foto e galeria); só um deles tem arquivo.
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const file = inputs.flatMap((i) => Array.from(i.files ?? [])).find((f) => f.name !== "");
  if (!file) return ERROR_MESSAGES.no_file;
  if (file.size === 0) return ERROR_MESSAGES.empty_file;
  if (file.size > MAX_UPLOAD_BYTES) return ERROR_MESSAGES.file_too_large;
  return null;
}

export const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
