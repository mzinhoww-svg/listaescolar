const CHROME = "header, footer";
const BACK_LABEL = /\b(voltar|cancelar|fechar|dispensar)\b/i;
const BACK_LINK_LABEL = /\b(voltar|cancelar)\b/i;
const CRUMB_LABEL = /migalha|breadcrumb|trilha/i;
const FAKE_ORIGIN = "http://local.invalid";

/** Rotas de entrada: nelas o logo do header linkado para "/" já é o caminho de volta. */
export const ENTRY_ROUTES: readonly string[] = [
  "/", "/escolas", "/entrar", "/conta", "/papelaria", "/escola", "/admin", "/b2b", "/parceiros",
  "/termos", "/privacidade", "/sobre", "/como-funciona", "/pesquisa",
];

/** Caminho normalizado de um href interno (relativo ou absoluto do mesmo origin, sem query/hash); `null` se externo/sem destino. */
export function normalizeHref(href: string | null, origin?: string): string | null {
  const raw = (href ?? "").trim();
  if (raw === "" || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) return null;
  try {
    const base = origin ?? FAKE_ORIGIN;
    const url = new URL(raw, base);
    if (url.origin !== new URL(base).origin) return null;
    const p = url.pathname.replace(/\/+$/, "");
    return p === "" ? "/" : p;
  } catch {
    return null;
  }
}

const labelOf = (el: Element) => `${(el.textContent ?? "").replace(/\s+/g, " ").trim()} ${el.getAttribute("aria-label") ?? ""}`;

function isIconOrMenuButton(el: Element): boolean {
  if (el.tagName !== "BUTTON") return false;
  if (el.hasAttribute("aria-expanded") || el.hasAttribute("aria-controls") || el.hasAttribute("aria-haspopup")) return true;
  const c = el.classList;
  if (c.contains("w-11") && c.contains("h-11")) return true; // variante `icon` do Button
  return (el.textContent ?? "").trim() === "" && el.hasAttribute("aria-label");
}

function isForwardAction(el: Element, origin?: string): boolean {
  if (el.closest(CHROME) || el.closest("nav")) return false;
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return false;
  if (BACK_LABEL.test(labelOf(el))) return false;
  if (el.tagName === "A") {
    const raw = (el.getAttribute("href") ?? "").trim();
    if (raw === "" || raw.startsWith("#") || /^javascript:/i.test(raw)) return false;
    return normalizeHref(raw, origin) !== null || /^(https?:)?\/\//i.test(raw) || /^(mailto|tel):/i.test(raw);
  }
  return !isIconOrMenuButton(el);
}

function pathOnly(path: string): string {
  const p = path.split(/[?#]/)[0] ?? "/";
  const n = p.replace(/\/+$/, "");
  return n === "" ? "/" : n;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

function hasBack(doc: Document, path: string, origin?: string): boolean {
  if (ENTRY_ROUTES.includes(path)) {
    return Array.from(doc.querySelectorAll("header a[href]")).some((a) => normalizeHref(a.getAttribute("href"), origin) === "/");
  }
  const main = doc.querySelector("main");
  if (!main) return false;
  const parent = parentOf(path);
  const links = Array.from(main.querySelectorAll("a[href]"));
  if (links.some((a) => BACK_LINK_LABEL.test(labelOf(a)))) return true;
  if (Array.from(main.querySelectorAll("nav[aria-label]")).some((n) => CRUMB_LABEL.test(n.getAttribute("aria-label") ?? ""))) return true;
  return links.some((a) => normalizeHref(a.getAttribute("href"), origin) === parent);
}

/**
 * Motivos de a tela ser um beco sem saída.
 * "Adiante": link ou botão fora de header/footer/nav que não seja Voltar/Cancelar/Fechar nem botão de ícone/menu.
 * "Volta": logo do header em "/" só nas rotas de entrada; nas demais, dentro de `main`, link Voltar/Cancelar,
 * migalha (`nav[aria-label]` com migalha/breadcrumb/trilha) ou link para a rota-pai.
 */
export function findDeadEnds(doc: Document, path: string, origin?: string): string[] {
  const reasons: string[] = [];
  if (!Array.from(doc.querySelectorAll("a[href], button")).some((el) => isForwardAction(el, origin))) reasons.push("sem ação adiante");
  if (!hasBack(doc, pathOnly(path), origin)) reasons.push("sem caminho de volta");
  return reasons;
}
