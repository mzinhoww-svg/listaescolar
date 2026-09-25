import { z } from "zod";
import raw from "../../docs/brand/tokens.json";

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const tokensSchema = z.object({
  color: z.object({
    tinta: hex,
    papel: hex,
    "branco-tonal": hex,
    "verde-certo": hex,
    "verde-fundo": hex,
    "texto-2": hex,
    "texto-3": hex,
    linha: hex,
    campo: hex,
  }),
  font: z.object({
    familia: z.string(),
    pesos: z.array(z.number()),
  }),
  radius: z.object({
    card: z.number(),
    botao: z.number(),
    campo: z.number(),
  }),
  wordmark: z.object({
    lista: z.number(),
    certa: z.number(),
    letterSpacing: z.string(),
    caixa: z.string(),
  }),
});

export type Tokens = z.infer<typeof tokensSchema>;

export const tokens: Tokens = tokensSchema.parse(raw);

/** Cores de estado da UI (selos e avisos), fora do tokens.json da marca; espelhadas em app/globals.css (teste de drift). */
export const stateColors = {
  "aviso-fundo": "#FDE9CC",
  "aviso-texto": "#7A4A00",
  "erro-fundo": "#FBDADA",
  "erro-texto": "#8A1F1F",
  "demo-fundo": "#FFF0B8",
  "demo-texto": "#5C4700",
  "linha-tracejada": "#BFB8A8",
} as const;
