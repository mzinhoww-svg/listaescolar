const REGION_SELECTOR = "main, header, footer, form, dialog, [data-region]";
const PRIMARY_SELECTOR = "button, a";

export type RegionCount = { region: string; count: number };

function regionLabel(el: Element, seen: Map<string, number>): string {
  const base = el.hasAttribute("data-region") ? `data-region=${el.getAttribute("data-region")}` : el.tagName.toLowerCase();
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}[${n}]`;
}

/**
 * Conta ações principais (`button`/`a` com a classe `bg-tinta`) por região. Cada ação pertence à região mais
 * interna que a contém (uma principal no `main` e outra num `dialog` aberto são regiões diferentes).
 * `dialog` fechado não é renderizado e fica de fora.
 */
export function countPrimaryPerRegion(doc: Document): RegionCount[] {
  const seen = new Map<string, number>();
  const regions = new Map<Element, RegionCount>();
  for (const el of Array.from(doc.querySelectorAll(REGION_SELECTOR))) {
    if (el.tagName === "DIALOG" && !el.hasAttribute("open")) continue;
    regions.set(el, { region: regionLabel(el, seen), count: 0 });
  }
  for (const el of Array.from(doc.querySelectorAll(PRIMARY_SELECTOR))) {
    if (!el.classList.contains("bg-tinta")) continue;
    const owner = el.closest(REGION_SELECTOR);
    const entry = owner ? regions.get(owner) : undefined;
    if (entry) entry.count += 1;
  }
  return Array.from(regions.values());
}
