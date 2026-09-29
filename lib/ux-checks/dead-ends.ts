const CHROME = "header, footer";
const BREADCRUMB = 'nav[aria-label*="breadcrumb" i], nav[aria-label*="trilha" i], [aria-label*="breadcrumb" i], ol[data-breadcrumb], nav[data-breadcrumb]';

function isForwardAction(el: Element): boolean {
  if (el.closest(CHROME)) return false;
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return false;
  if (el.tagName === "A") {
    const href = (el.getAttribute("href") ?? "").trim();
    return href !== "" && !href.startsWith("#") && !href.startsWith("javascript:");
  }
  return true;
}

/**
 * Motivos de a tela ser um beco sem saída: nenhum link ou botão que leve adiante (fora de header/footer) ou
 * nenhum caminho de volta (link "Voltar", breadcrumb ou header com o logo linkado).
 * O parâmetro `path` fica disponível para exceções por rota; hoje nenhuma rota é isenta.
 */
export function findDeadEnds(doc: Document, path: string): string[] {
  void path;
  const reasons: string[] = [];
  const forward = Array.from(doc.querySelectorAll("a[href], button")).some(isForwardAction);
  if (!forward) reasons.push("sem ação adiante");

  const back = Array.from(doc.querySelectorAll("a[href]")).some((a) => /voltar/i.test(`${a.textContent ?? ""} ${a.getAttribute("aria-label") ?? ""}`));
  const crumbs = doc.querySelector(BREADCRUMB) !== null;
  const logo = Array.from(doc.querySelectorAll("header a[href]")).some((a) => (a.getAttribute("href") ?? "") === "/");
  if (!back && !crumbs && !logo) reasons.push("sem caminho de volta");
  return reasons;
}
