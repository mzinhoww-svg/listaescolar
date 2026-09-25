import { z } from "zod";

import type { RowError } from "./ports";

export type SchoolNetwork = "federal" | "state" | "municipal" | "private";

const strip = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
const NOT_BEFORE = "(?<![a-z0-9])";

// Ordem importa: formas mais longas antes das curtas. Aplicadas sobre texto minúsculo e sem acento.
const DOTTED: [RegExp, string][] = [
  [new RegExp(`${NOT_BEFORE}e\\s?\\.\\s?m\\s?\\.\\s?e\\s?\\.\\s?b\\.?`, "g"), "escola municipal de educacao basica "],
  [new RegExp(`${NOT_BEFORE}e\\s?\\.\\s?m\\s?\\.`, "g"), "escola municipal "],
  [new RegExp(`${NOT_BEFORE}e\\s?\\.\\s?e\\s?\\.`, "g"), "escola estadual "],
  [new RegExp(`${NOT_BEFORE}esc\\.`, "g"), "escola "],
  [new RegExp(`${NOT_BEFORE}mun\\.`, "g"), "municipal "],
  [new RegExp(`${NOT_BEFORE}est\\.`, "g"), "estadual "],
  [new RegExp(`${NOT_BEFORE}profa\\.`, "g"), "professora "],
  [new RegExp(`${NOT_BEFORE}prof\\.`, "g"), "professor "],
  [new RegExp(`${NOT_BEFORE}dra\\.`, "g"), "doutora "],
  [new RegExp(`${NOT_BEFORE}dr\\.`, "g"), "doutor "],
  [new RegExp(`${NOT_BEFORE}cel\\.`, "g"), "coronel "],
  [new RegExp(`${NOT_BEFORE}pe\\.`, "g"), "padre "],
  [new RegExp(`${NOT_BEFORE}sto\\.`, "g"), "santo "],
  [new RegExp(`${NOT_BEFORE}sta\\.`, "g"), "santa "],
  [new RegExp(`${NOT_BEFORE}col\\.`, "g"), "colegio "],
];
const TOKENS: Record<string, string> = {
  emeb: "escola municipal de educacao basica",
  esc: "escola",
  prof: "professor",
  profa: "professora",
};

/** Nome comparável: sem acento, minúsculo, sem pontuação, abreviações comuns expandidas, espaços únicos. */
export function normalizeName(input: string): string {
  let s = strip(input).toLowerCase();
  for (const [re, to] of DOTTED) s = s.replace(re, to);
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  if (!s) return "";
  return s
    .split(" ")
    .map((t) => TOKENS[t] ?? t)
    .join(" ")
    .replace(/\s+/g, " ");
}

/** Texto de exibição: remove controles e colapsa espaços. */
export function cleanText(input: string | undefined): string {
  return (input ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

const digits = (s: string | undefined) => (s ?? "").replace(/\D+/g, "");

export function normalizeInep(input: string | undefined): string {
  return digits(input);
}

export function normalizePhone(ddd: string | undefined, number: string | undefined): string | null {
  const d = digits(ddd);
  const n = digits(number);
  if (d.length !== 2 || (n.length !== 8 && n.length !== 9)) return null;
  return d + n;
}

export function normalizeCep(input: string | undefined): string | null {
  const d = digits(input);
  if (d.length === 8) return d;
  if (d.length === 7) return d.padStart(8, "0");
  return null;
}

export function normalizeEmail(input: string | undefined): string | null {
  const e = (input ?? "").trim().toLowerCase();
  if (!e) return null;
  return z.email().safeParse(e).success ? e : null;
}

export function mapNetwork(code: string | undefined): SchoolNetwork | null {
  switch (Number.parseInt(digits(code), 10)) {
    case 1:
      return "federal";
    case 2:
      return "state";
    case 3:
      return "municipal";
    case 4:
      return "private";
    default:
      return null;
  }
}

export type { RowError };
