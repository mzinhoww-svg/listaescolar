import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { describeIssues, getPublicEnv } from "@/lib/env.public";

const adminSchema = z.object({ SUPABASE_SECRET_KEY: z.string().min(1) });

/** Cliente com a chave secreta: ignora RLS. Só servidor/scripts; nunca em fluxo de usuário. */
export function createAdminClient() {
  const parsed = adminSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
  });
  if (!parsed.success) throw describeIssues(parsed.error, "servidor");
  return createSupabaseClient(
    getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
    parsed.data.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
