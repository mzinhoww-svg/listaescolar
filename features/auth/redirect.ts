const FALLBACK = "/conta";
const PROBE_ORIGIN = "http://x.invalid";

function isUnsafe(value: string): boolean {
  return value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value);
}

/** Segmento `.` ou `..` no caminho (antes de `?`/`#`); navegadores os normalizam e `/.//x` vira `//x`. */
function hasDotSegment(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0] ?? "";
  return path.split("/").some((seg) => seg === "." || seg === "..");
}

/**
 * Aceita só caminho relativo interno; qualquer outra coisa vira `/conta`.
 * Devolve a entrada original quando aprovada (sem reescrever).
 */
export function safeNextPath(input: unknown): string {
  if (typeof input !== "string" || !input.startsWith("/") || isUnsafe(input)) return FALLBACK;
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return FALLBACK;
  }
  if (isUnsafe(decoded) || hasDotSegment(input) || hasDotSegment(decoded)) return FALLBACK;
  try {
    const u = new URL(input, PROBE_ORIGIN);
    if (u.origin !== PROBE_ORIGIN || u.pathname.startsWith("//")) return FALLBACK;
  } catch {
    return FALLBACK;
  }
  return input;
}
