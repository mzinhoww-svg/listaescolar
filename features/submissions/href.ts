import { findGrade } from "@/features/grades/catalog";

export type SendListPrefill = { inep?: string; gradeSlug?: string; year?: number };

/** Caminho de "Enviar a lista da escola" com escola, série e ano já escolhidos quando se sabe. */
export function sendListHref(prefill: SendListPrefill = {}): string {
  const p = new URLSearchParams();
  if (prefill.inep) p.set("escola", prefill.inep);
  if (prefill.gradeSlug) p.set("serie", prefill.gradeSlug);
  if (prefill.year) p.set("ano", String(prefill.year));
  const q = p.toString();
  return q ? `/enviar-lista?${q}` : "/enviar-lista";
}

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Lê `?escola=&serie=&ano=` de `/enviar-lista`; valor inválido some (a pessoa escolhe no formulário). */
export function parseSendListPrefill(sp: Record<string, string | string[] | undefined>): SendListPrefill {
  const out: SendListPrefill = {};
  const inep = one(sp.escola);
  if (inep && /^\d{8}$/.test(inep)) out.inep = inep;
  const slug = one(sp.serie);
  if (slug && findGrade(slug)) out.gradeSlug = slug;
  const ano = one(sp.ano);
  if (ano && /^\d{4}$/.test(ano)) out.year = Number(ano);
  return out;
}
