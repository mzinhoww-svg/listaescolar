/** Classe-assinatura de `buttonClass()` (components/ui/Button.tsx): presente em todo botão do sistema. */
export const BUTTON_SIGNATURE_CLASS = "rounded-botao";

function describe(el: Element): string {
  const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).slice(0, 4).join(".");
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${text}"`;
}

/** `button` e `a[role=button]` sem a assinatura do sistema e sem `data-ui="native-ok"`. */
export function findOffSystemButtons(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('button, a[role="button"]'))
    .filter((el) => !el.classList.contains(BUTTON_SIGNATURE_CLASS) && el.getAttribute("data-ui") !== "native-ok")
    .map(describe);
}

/** Durações permitidas (ms) e as formas em variável (tokens de movimento do DESIGN.md §7.3). */
export const ALLOWED_MOTION_MS = [120, 200, 320] as const;
const TOKEN_VARS = ["--mov-rapido", "--mov-base", "--mov-entrada"];

/**
 * Isenção explícita (Ruling da S29): indicadores de carregamento. Casam pelo nome da classe Tailwind, da
 * propriedade customizada do tema ou do keyframe usado em `animation`.
 */
export const LOADING_EXEMPT = {
  classes: ["animate-spin", "animate-pulse"],
  properties: ["--animate-spin", "--animate-pulse"],
  keyframes: ["spin", "pulse", "pesquisa-pulso"],
} as const;

/** Divide `s` em `sep` fora de parênteses. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth === 0 && (sep === " " ? /\s/.test(ch) : ch === sep)) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const TIME = /^(\d*\.?\d+)(ms|s)$/i;

/** Devolve o motivo se o token de tempo estiver fora dos tokens; `null` se for aceito ou não for tempo. */
function badTime(token: string): string | null {
  const t = token.trim().toLowerCase();
  const m = TIME.exec(t);
  if (m) {
    const ms = Math.round(Number(m[1]) * (m[2] === "s" ? 1000 : 1));
    return ms === 0 || (ALLOWED_MOTION_MS as readonly number[]).includes(ms) ? null : `${ms} ms`;
  }
  return null;
}

function isTokenVar(token: string): boolean {
  // `var(--tw-duration, ...)` delega ao utilitário `duration-*`, que é checado por conta própria.
  return /^var\(/i.test(token) && (TOKEN_VARS.some((v) => token.includes(v)) || token.includes("--tw-duration") || token.includes("--default-transition-duration"));
}

function durationsOf(prop: string, value: string): string[] {
  const clean = value.replace(/!important/i, "").trim();
  const items = splitTop(clean, ",");
  const bad: string[] = [];
  for (const item of items) {
    if (prop === "transition" || prop === "animation") {
      // Em atalho, o primeiro tempo é a duração; o segundo é atraso e não conta.
      const first = splitTop(item, " ").find((tok) => TIME.test(tok) || isTokenVar(tok));
      if (first && !isTokenVar(first)) {
        const b = badTime(first);
        if (b) bad.push(b);
      }
    } else {
      const tok = item.trim();
      if (isTokenVar(tok)) continue;
      const b = badTime(tok);
      if (b) bad.push(b);
    }
  }
  return bad;
}

const DURATION_PROPS = new Set(["transition", "transition-duration", "animation", "animation-duration", "--tw-duration", "--default-transition-duration"]);

function exempt(selector: string, prop: string, value: string): boolean {
  if (LOADING_EXEMPT.properties.some((p) => prop === p)) return true;
  if (LOADING_EXEMPT.classes.some((c) => selector.includes(`.${c}`))) return true;
  if (prop === "animation") {
    const names = splitTop(value, ",").flatMap((i) => splitTop(i, " "));
    return names.some((n) => (LOADING_EXEMPT.keyframes as readonly string[]).includes(n));
  }
  return false;
}

/** `transition`/`animation` com duração literal fora de 120/200/320 ms (aceita `s` e `var(--mov-*)`). */
export function findOffTokenMotion(cssText: string): string[] {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Set<string>();
  const block = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = block.exec(css); m; m = block.exec(css)) {
    const selector = (m[1] ?? "").trim();
    for (const decl of (m[2] ?? "").split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1).trim();
      if (!DURATION_PROPS.has(prop) || exempt(selector, prop, value)) continue;
      for (const bad of durationsOf(prop, value)) found.add(`${selector} { ${prop}: ${value} } (${bad})`);
    }
  }
  return Array.from(found);
}
