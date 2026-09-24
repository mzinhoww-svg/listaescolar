import "server-only";

import { z } from "zod";

import { blankToUndefined, describeIssues, getPublicEnv, type PublicEnv } from "./env.public";

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
    }),
  );
  if (!parsed.success) throw describeIssues(parsed.error, "servidor");
  return { ...getPublicEnv(), ...parsed.data };
}
