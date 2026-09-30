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
 * Aceita só caminho relativo interno; qualquer outra coisa vira o `fallback` (padrão `/conta`).
 * Devolve a entrada original quando aprovada (sem reescrever).
 */
export function safeNextPath(input: unknown, fallback: string = FALLBACK): string {
  if (typeof input !== "string" || !input.startsWith("/") || isUnsafe(input)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return fallback;
  }
  if (isUnsafe(decoded) || hasDotSegment(input) || hasDotSegment(decoded)) return fallback;
  try {
    const u = new URL(input, PROBE_ORIGIN);
    if (u.origin !== PROBE_ORIGIN || u.pathname.startsWith("//")) return fallback;
  } catch {
    return fallback;
  }
  return input;
}

/**
 * Caminho de `/entrar` que devolve a pessoa à `route` depois do login (UX-043). `route` passa por `safeNextPath`:
 * só caminho relativo interno; o resto vira `/conta`. `expired` avisa que havia sessão e ela terminou.
 */
export function loginPathFor(route: string, opts: { expired?: boolean } = {}): string {
  const next = encodeURIComponent(safeNextPath(route));
  return `/entrar?next=${next}${opts.expired ? "&sessao=terminou" : ""}`;
}

/** `/entrar?erro=<código>` guardando o destino original, quando ele for um caminho interno seguro (UX-044). */
export function loginErrorPath(code: "codigo" | "provedor", rawNext: unknown): string {
  const next = safeNextPath(rawNext, "");
  return `/entrar?erro=${code}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
}
