import { z } from "zod";

import { SHORT_GRADE_CODES, gradeSlugFromCode } from "./grade-codes";

/** Crockford base32 (sem I, L, O, U). */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DATA_LENGTH = 7;
const INEP_PATTERN = /^\d{8}$/;

/**
 * Código = 7 símbolos do inteiro `inep * 32 + série` + 1 símbolo de verificação `(Σ (i+1)·valorᵢ) mod 31`.
 * A verificação detecta troca de um símbolo e transposição adjacente, exceto quando os valores diferem por 31
 * (`0` <-> `Z`); o destino final ainda é validado (INEP existente), então o efeito é só um 404.
 * Sem tabela, ano, contador nem dado pessoal.
 */
function checkValue(values: readonly number[]): number {
  return values.reduce((sum, v, i) => sum + (i + 1) * v, 0) % 31;
}

export function encodeShortCode({ inep, gradeSlug }: { inep: string; gradeSlug?: string | null }): string {
  if (!INEP_PATTERN.test(inep)) throw new Error("INEP inválido");
  let gradeCode = 0;
  if (gradeSlug !== undefined && gradeSlug !== null) {
    const found = SHORT_GRADE_CODES[gradeSlug];
    if (found === undefined) throw new Error("série desconhecida");
    gradeCode = found;
  }
  let rest = Number(inep) * 32 + gradeCode;
  const values: number[] = [];
  for (let i = 0; i < DATA_LENGTH; i++) {
    values.unshift(rest % 32);
    rest = Math.floor(rest / 32);
  }
  return [...values, checkValue(values)].map((v) => ALPHABET[v]).join("");
}

const rawSchema = z
  .string()
  .max(64)
  .transform((v) => v.toUpperCase().replaceAll("-", "").replaceAll("O", "0").replace(/[IL]/g, "1"))
  .refine((v) => v.length === DATA_LENGTH + 1 && [...v].every((c) => ALPHABET.includes(c)));

export type ParsedShortCode = { inep: string; gradeSlug: string | null };

/** Normaliza (maiúsculas, `O→0`, `I/L→1`, sem hífen) e valida; qualquer falha vira `null`. */
export function parseShortCode(input: unknown): ParsedShortCode | null {
  const parsed = rawSchema.safeParse(input);
  if (!parsed.success) return null;
  const values = [...parsed.data].map((c) => ALPHABET.indexOf(c));
  const check = values.pop() as number;
  if (checkValue(values) !== check) return null;
  const n = values.reduce((acc, v) => acc * 32 + v, 0);
  const inepNumber = Math.floor(n / 32);
  const gradeCode = n % 32;
  if (inepNumber > 99_999_999) return null;
  const inep = String(inepNumber).padStart(8, "0");
  if (gradeCode === 0) return { inep, gradeSlug: null };
  const gradeSlug = gradeSlugFromCode(gradeCode);
  return gradeSlug === null ? null : { inep, gradeSlug };
}

/** Caminho interno montado só do inteiro decodificado (nunca da string recebida). */
export function shortLinkTarget({ inep, gradeSlug }: ParsedShortCode): string {
  return gradeSlug === null ? `/escolas/${inep}` : `/escolas/${inep}/${gradeSlug}`;
}

export function shortLinkUrl(code: string, origin: string): string {
  return `${origin}/l/${code}`;
}
