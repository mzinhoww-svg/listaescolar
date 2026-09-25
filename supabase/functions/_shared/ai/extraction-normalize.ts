// Normalização pura da saída do modelo. Nada aqui copia texto do documento para alertas ou decisões.
import { ITEM_CATEGORIES, type ItemCategory } from "../extraction-schema.ts";

export const CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2064\\u2066-\\u2069\\ufeff]",
  "g",
);

/**
 * Remove marcação HTML (só sequências com forma de tag: `<` seguido de letra, `/` ou `!`), caracteres de controle/bidi e
 * espaços repetidos; limita o tamanho. "< 5 anos", "5<6" e "a > b" são dado da lista e ficam (D-030). A proteção contra XSS
 * é a renderização como texto (React), nunca `dangerouslySetInnerHTML`.
 */
export function cleanText(input: string, max: number): string {
  return input
    .replace(/<[A-Za-z/!][^>]*>/g, " ")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Chave de comparação: minúsculas, sem acento, só letras/números/espaço. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Flag do modelo em forma canônica (sem acento, snake_case). */
export function canonFlag(flag: string): string {
  return normalizeName(flag).replace(/ /g, "_");
}

const CATEGORY_ALIASES: Record<string, ItemCategory> = {
  papelaria: "papelaria",
  escrita: "escrita",
  arte: "arte",
  artes: "arte",
  tecnologia: "tecnologia",
  higiene: "higiene",
  livros: "livros",
  livro: "livros",
  uniforme: "uniforme",
  outros: "outros",
};

/** Categoria da lista fixa; qualquer outra coisa vira `outros`. */
export function normalizeCategory(raw: unknown): ItemCategory {
  if (typeof raw !== "string") return "outros";
  const key = normalizeName(raw);
  const hit = CATEGORY_ALIASES[key];
  return hit && (ITEM_CATEGORIES as readonly string[]).includes(hit) ? hit : "outros";
}

/** Quantidade numérica >= 1 e finita; senão `null` (o item perde confiança, nunca vira número inventado). */
export function normalizeQuantity(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1 || raw > 9999) return null;
  return Math.round(raw * 100) / 100;
}

const GENERIC_NAMES = new Set([
  "material",
  "materiais",
  "item",
  "itens",
  "diversos",
  "outros",
  "outro",
  "etc",
  "conforme",
  "lista",
]);
export const isGenericName = (normalized: string): boolean =>
  normalized.split(" ").every((w) => GENERIC_NAMES.has(w));

const COLLECTIVE =
  /\b(coletivo|coletiva|uso coletivo|para (a )?(sala|turma|classe|escola)|da (sala|turma|classe))\b/;
const RESTRICTIVE = /\b(marca|modelo|obrigatori[oa])\b/;
export const looksCollective = (normalized: string): boolean => COLLECTIVE.test(normalized);
export const looksRestrictive = (normalized: string): boolean => RESTRICTIVE.test(normalized);

/** Primeiro número de "3º ano", "3o ano", "ano 3"; `null` sem dígitos. */
export function gradeNumber(raw: string | null | undefined): number | null {
  const m = /\d{1,2}/.exec(raw ?? "");
  return m ? Number(m[0]) : null;
}
