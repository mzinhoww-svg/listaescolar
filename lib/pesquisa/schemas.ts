import { z } from "zod";
import {
  CANAL,
  CIDADE,
  COMPAROU,
  COMPRA_IDEAL_MAX_LENGTH,
  DORES,
  DORES_MAX_SELECIONADAS,
  ESCOLA_MAX_LENGTH,
  ETAPAS,
  FILHOS,
  GASTO,
  ONDE_COMPROU,
  RECEBIMENTO,
  REDE,
  TEMPO,
  ULTIMO_STEP,
  USARIA,
  isStepValido,
  type Opcao,
} from "./perguntas";

function slugs(opcoes: readonly Opcao[]): [string, ...string[]] {
  return opcoes.map((o) => o.slug) as [string, ...string[]];
}

function unica(opcoes: readonly Opcao[]) {
  return z.enum(slugs(opcoes));
}

function multipla(opcoes: readonly Opcao[], max?: number) {
  const base = z.array(unica(opcoes)).min(1);
  const comMax = typeof max === "number" ? base.max(max) : base;
  return comMax.refine((valores) => new Set(valores).size === valores.length, {
    message: "sem opções repetidas",
  });
}

const STEP_1 = z.strictObject({ cidade: unica(CIDADE) });
const STEP_2 = z.strictObject({ filhos: unica(FILHOS) });
const STEP_3 = z.strictObject({ rede: unica(REDE) });
const STEP_4 = z.strictObject({
  etapas: multipla(ETAPAS),
  escola: z.string().trim().max(ESCOLA_MAX_LENGTH).optional(),
});
const STEP_5 = z.strictObject({ recebimento: unica(RECEBIMENTO) });
const STEP_6 = z.strictObject({ onde_comprou: multipla(ONDE_COMPROU) });
const STEP_7 = z.strictObject({ gasto: unica(GASTO) });
const STEP_8 = z.strictObject({ tempo: unica(TEMPO) });
const STEP_9 = z.strictObject({ comparou: unica(COMPAROU) });
const STEP_10 = z.strictObject({ dores: multipla(DORES, DORES_MAX_SELECIONADAS) });
const STEP_11 = z
  .strictObject({
    usaria: unica(USARIA),
    canal: unica(CANAL).optional(),
  })
  .superRefine((val, ctx) => {
    const exigeCanal = val.usaria !== "nao";
    if (exigeCanal && !val.canal) {
      ctx.addIssue({
        code: "custom",
        path: ["canal"],
        message: "canal é obrigatório quando usaria != nao",
      });
    }
    if (!exigeCanal && val.canal) {
      ctx.addIssue({
        code: "custom",
        path: ["canal"],
        message: "canal não é aceito quando usaria == nao",
      });
    }
  });
const STEP_12 = z.strictObject({
  compra_ideal: z.string().trim().max(COMPRA_IDEAL_MAX_LENGTH).optional(),
  pode_citar: z.boolean().optional(),
});

const STEP_SCHEMAS = {
  1: STEP_1,
  2: STEP_2,
  3: STEP_3,
  4: STEP_4,
  5: STEP_5,
  6: STEP_6,
  7: STEP_7,
  8: STEP_8,
  9: STEP_9,
  10: STEP_10,
  11: STEP_11,
  12: STEP_12,
} as const;

/** Schema Zod das respostas de um step (1-12); null se o step não existe. */
export function answerSchemaForStep(step: number): z.ZodType | null {
  if (!isStepValido(step)) return null;
  return STEP_SCHEMAS[step];
}

export const SessionIdSchema = z.uuid();

/** Envelope de POST /api/pesquisa/resposta. `answers` é revalidado à parte por answerSchemaForStep. */
export const RespostaEnvelopeSchema = z.strictObject({
  session_id: SessionIdSchema,
  step: z.number().int().min(1).max(ULTIMO_STEP),
  answers: z.record(z.string(), z.unknown()),
  g: z.string().max(60).optional(),
  ref: SessionIdSchema.optional(),
  hp: z.string().optional(),
});

export const ConcluirRequestSchema = z.strictObject({ session_id: SessionIdSchema });

export const LeadRequestSchema = z.strictObject({
  session_id: SessionIdSchema,
  name: z.string().trim().max(80).optional(),
  whatsapp: z.string().min(1),
  consent: z.literal(true),
  hp: z.string().optional(),
});

export const LoginRequestSchema = z.strictObject({ senha: z.string().min(1) });

export const ExportTipoSchema = z.enum(["respostas", "leads"]);
