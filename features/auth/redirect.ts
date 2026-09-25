const FALLBACK = "/conta";

function isUnsafe(value: string): boolean {
  return value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value);
}

/** Aceita só caminho relativo interno; qualquer outra coisa vira `/conta`. */
export function safeNextPath(input: unknown): string {
  if (typeof input !== "string" || !input.startsWith("/") || isUnsafe(input)) return FALLBACK;
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return FALLBACK;
  }
  return isUnsafe(decoded) ? FALLBACK : input;
}
