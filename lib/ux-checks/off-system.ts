/** Classe-assinatura de `buttonClass()` (components/ui/Button.tsx): presente em todo botão do sistema. */
export const BUTTON_SIGNATURE_CLASS = "rounded-botao";

function describe(el: Element): string {
  const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).slice(0, 4).join(".");
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${text}"`;
}

/**
 * Botão de texto (variante `text`, gatilho em linha de tabela): sem fundo e sem contorno, com sublinhado ou altura
 * mínima de 44 px. O CSS global (`app/globals.css`, camada base) dá 44 px de alvo a todo `button`, então o que conta
 * é o alvo, não o tamanho do texto (L-C2).
 */
function isTextButton(el: Element): boolean {
  if (el.tagName !== "BUTTON") return false;
  const cls = Array.from(el.classList);
  if (cls.some((c) => /^bg-/.test(c) && c !== "bg-transparent")) return false;
  if (cls.some((c) => c === "border" || /^border-(\[|\d|x|y|t|b|l|r)/.test(c) || /^border-\[/.test(c))) return false;
  return cls.includes("underline") || cls.includes("min-h-11");
}

/** `button` e `a[role=button]` sem a assinatura do sistema, sem ser botão de texto e sem `data-ui="native-ok"`. */
export function findOffSystemButtons(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('button, a[role="button"]'))
    .filter((el) => !el.classList.contains(BUTTON_SIGNATURE_CLASS) && el.getAttribute("data-ui") !== "native-ok" && !isTextButton(el))
    .map(describe);
}

const DESTRUCTIVE = /^\W*(?:excluir|apagar|revogar|remover|desativar|suspender|cancelar\s+(?:assinatura|pedido|conta))\b/i;
const NOT_DESTRUCTIVE = /\b(?:filtros?|busca|sele[cç][aã]o)\b/i;

/**
 * Ações irreversíveis sem confirmação, até onde o HTML deixa ver: botão de rótulo destrutivo (excluir, apagar, revogar,
 * remover, desativar, suspender, cancelar assinatura/pedido/conta) que não esteja dentro de um `<dialog>` nem seja o
 * gatilho de um (o `ConfirmDialog` renderiza o gatilho e o `<dialog>` lado a lado). `window.confirm` não é visível aqui.
 */
export function findUnconfirmedDestructive(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('button, a[role="button"]'))
    .filter((el) => {
      const label = ((el.getAttribute("aria-label") ?? "") || (el.textContent ?? "")).replace(/\s+/g, " ").trim();
      if (!DESTRUCTIVE.test(label) || NOT_DESTRUCTIVE.test(label)) return false;
      if (el.getAttribute("data-ui") === "native-ok") return false;
      if (el.closest("dialog")) return false;
      return el.nextElementSibling?.tagName !== "DIALOG";
    })
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
    // CSS Modules trocam o nome do keyframe por `<arquivo>-module__<hash>__<nome>`: casa pelo sufixo `__<nome>` também.
    return names.some((n) => (LOADING_EXEMPT.keyframes as readonly string[]).some((k) => n === k || n.endsWith(`__${k}`)));
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
