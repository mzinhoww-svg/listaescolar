import "server-only";

import { z } from "zod";

import { assertPipelineEnv } from "./pipeline-env";
import { blankToUndefined, describeIssues, getPublicEnv, type PublicEnv } from "./env.public";

const flag = z.enum(["0", "1"]).optional();
const pipelineShape = {
  /** Pipeline de demonstração (S07): só com APP_ENV explícito em {local, development, preview, staging}. */
  DEMO_PIPELINE: flag,
  APP_ENV: z.enum(["local", "development", "preview", "staging", "production"]).optional(),
  /** Autentica as chamadas à Edge Function ocr-worker. */
  WORKER_SHARED_SECRET: z.string().min(16).optional(),
};
const pipelineFlagsSchema = z.object(pipelineShape);
export type PipelineFlags = z.infer<typeof pipelineFlagsSchema>;

function readPipelineFlags() {
  return {
    DEMO_PIPELINE: process.env.DEMO_PIPELINE,
    APP_ENV: process.env.APP_ENV,
    WORKER_SHARED_SECRET: process.env.WORKER_SHARED_SECRET,
  };
}

/** Só as flags do pipeline (não exige as demais variáveis do servidor). */
export function getPipelineFlags(): PipelineFlags {
  const parsed = pipelineFlagsSchema.safeParse(blankToUndefined(readPipelineFlags()));
  if (!parsed.success) throw describeIssues(parsed.error, "servidor");
  return parsed.data;
}

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  OPENROUTER_KEY: z.string().min(1),
  AI_MODEL_CHEAP: z.string().min(1),
  AI_MODEL_STRONG: z.string().min(1),
  AI_MODEL_VISION: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  MELI_AFFILIATE_ID: z.string().min(1).optional(),
  AMAZON_ASSOCIATE_TAG: z.string().min(1).optional(),
  ...pipelineShape,
});

export type ServerEnv = z.infer<typeof serverSchema> & PublicEnv;

/** Só valida quando chamada; nunca no build. Nomes de modelo vêm sempre do ambiente. */
export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(
    blankToUndefined({
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      OPENROUTER_KEY: process.env.OPENROUTER_KEY,
      AI_MODEL_CHEAP: process.env.AI_MODEL_CHEAP,
      AI_MODEL_STRONG: process.env.AI_MODEL_STRONG,
      AI_MODEL_VISION: process.env.AI_MODEL_VISION,
      SENTRY_DSN: process.env.SENTRY_DSN,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      MELI_AFFILIATE_ID: process.env.MELI_AFFILIATE_ID,
      AMAZON_ASSOCIATE_TAG: process.env.AMAZON_ASSOCIATE_TAG,
      ...readPipelineFlags(),
    }),
  );
  if (!parsed.success) throw describeIssues(parsed.error, "servidor");
  assertPipelineEnv();
  return { ...getPublicEnv(), ...parsed.data };
}
