/** Parte pura do `pnpm seed:demo-lists` (sem I/O): definição das listas demonstrativas e argumentos. */
import type { ItemInput } from "@/features/lists/schemas";

/** Ator fixo das decisões demonstrativas (uuid sem perfil: `actor_id` não tem FK). */
export const DEMO_ACTOR_ID = "00000000-0000-4000-8000-00000000d3e0";

/** Escolas demonstrativas de Cuiabá (INEP 9900100x, `tests/fixtures/inep-demo.csv`). */
export type DemoListPlan = {
  inep: string;
  gradeSlug: string;
  /** Uma entrada por versão; a última é a atual. `publish: false` deixa a lista aprovada e não pública. */
  versions: ItemInput[][];
  publish: boolean;
};

const it = (originalName: string, quantity: number, unit: string, category: string): ItemInput => ({
  originalName,
  quantity,
  unit,
  category,
});

const V1: ItemInput[] = [
  it("Caderno brochura 96 folhas", 4, "un", "Papelaria"),
  it("Lápis preto nº 2", 12, "un", "Escrita"),
  it("Borracha branca", 2, "un", "Escrita"),
  it("Caneta esferográfica azul", 2, "un", "Escrita"),
  it("Régua 30 cm", 1, "un", "Geometria"),
  it("Cola bastão 40 g", 2, "un", "Papelaria"),
  it("Tesoura sem ponta", 1, "un", "Papelaria"),
  it("Caixa de lápis de cor 24 cores", 1, "cx", "Arte"),
];

const V2: ItemInput[] = [...V1.slice(0, 7), it("Caixa de lápis de cor 12 cores", 1, "cx", "Arte"), it("Estojo escolar", 1, "un", "Papelaria")];

const APPROVED_ONLY: ItemInput[] = [it("Caderno universitário 10 matérias", 2, "un", "Papelaria"), it("Calculadora simples", 1, "un", "Geometria")];

/** 99001001 ef-5 publicada (v1); 99001002 ef-1 publicada com v2 sobre v1 (histórico); 99001003 ef-5 só aprovada (não pública). */
export const DEMO_LIST_PLANS: readonly DemoListPlan[] = [
  { inep: "99001001", gradeSlug: "ef-5", versions: [V1], publish: true },
  { inep: "99001002", gradeSlug: "ef-1", versions: [V1, V2], publish: true },
  { inep: "99001003", gradeSlug: "ef-5", versions: [APPROVED_ONLY], publish: false },
];

export type SeedArgs = { allowProduction: boolean };

export function parseSeedArgs(argv: string[]): SeedArgs {
  let allowProduction = false;
  for (const a of argv) {
    if (a === "--i-know-this-is-production") allowProduction = true;
    else throw new Error(`Opção desconhecida: ${a}. Uso: pnpm seed:demo-lists [--i-know-this-is-production]`);
  }
  return { allowProduction };
}
