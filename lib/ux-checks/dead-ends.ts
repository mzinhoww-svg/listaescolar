const CHROME = "header, footer";
/**
 * Rótulo de volta: "Voltar ..." (com objeto) ou a palavra inteira Cancelar/Fechar/Dispensar (com ou sem "aviso", "janela"...).
 * Casa o rótulo inteiro, não o trecho: "Fechar pedido" e "Cancelar assinatura" são ações adiante (Ruling da S29).
 */
const BACK_LABEL = /^\W*(?:voltar\b.*|(?:cancelar|fechar|dispensar)(?:\s+(?:aviso|janela|di[aá]logo|mensagem|menu|painel|banner|notifica[cç][aã]o))?\W*)$/i;
const BACK_LINK_LABEL = /^\W*(?:voltar\b.*|cancelar\W*)$/i;
/** Raízes de painel: o menu lateral que leva à raiz do painel já é o caminho de volta das telas internas. */
const PANEL_ROOTS: readonly string[] = ["/admin", "/papelaria", "/escola", "/b2b", "/conta"];
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

/** Nome do controle: o texto visível e o `aria-label`, cada um avaliado à parte (o rótulo inteiro decide). */
const labelsOf = (el: Element): string[] =>
  [(el.textContent ?? "").replace(/\s+/g, " ").trim(), (el.getAttribute("aria-label") ?? "").trim()].filter(Boolean);
const matchesLabel = (el: Element, re: RegExp) => labelsOf(el).some((l) => re.test(l));

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
  if (matchesLabel(el, BACK_LABEL)) return false;
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
  // Nas rotas de entrada o link para "/" no header ou na lateral da casca (logo, "Ir para o site") basta; Voltar e migalha também valem (como nas demais rotas).
  if (ENTRY_ROUTES.includes(path) && Array.from(doc.querySelectorAll("header a[href], aside a[href]")).some((a) => normalizeHref(a.getAttribute("href"), origin) === "/")) return true;
  // Voltar/Cancelar e migalha valem em qualquer lugar da página; o link para a rota-pai só dentro de `main`.
  if (Array.from(doc.querySelectorAll("a[href]")).some((a) => matchesLabel(a, BACK_LINK_LABEL))) return true;
  // Casca de painel: menu (`nav`) com link para a raiz do painel dispensa o Voltar nas telas internas.
  const root = `/${path.split("/")[1] ?? ""}`;
  if (path !== root && PANEL_ROOTS.includes(root) && Array.from(doc.querySelectorAll("nav a[href]")).some((a) => normalizeHref(a.getAttribute("href"), origin) === root)) return true;
  if (Array.from(doc.querySelectorAll("nav[aria-label]")).some((n) => CRUMB_LABEL.test(n.getAttribute("aria-label") ?? ""))) return true;
  const main = doc.querySelector("main");
  if (!main) return false;
  const parent = parentOf(path);
  return Array.from(main.querySelectorAll("a[href]")).some((a) => normalizeHref(a.getAttribute("href"), origin) === parent);
}

/**
 * Motivos de a tela ser um beco sem saída.
 * "Adiante": link ou botão fora de header/footer/nav que não seja Voltar/Cancelar/Fechar nem botão de ícone/menu.
 * "Volta": logo do header em "/" (só nas rotas de entrada), link Voltar/Cancelar (rótulo inteiro), menu do painel com a raiz,
 * migalha (`nav[aria-label]` com migalha/breadcrumb/trilha) em qualquer lugar da página, ou link para a rota-pai dentro de `main`.
 */
export function findDeadEnds(doc: Document, path: string, origin?: string): string[] {
  const reasons: string[] = [];
  if (!Array.from(doc.querySelectorAll("a[href], button")).some((el) => isForwardAction(el, origin))) reasons.push("sem ação adiante");
  if (!hasBack(doc, pathOnly(path), origin)) reasons.push("sem caminho de volta");
  return reasons;
}
