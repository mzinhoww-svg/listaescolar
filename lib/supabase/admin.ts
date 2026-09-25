import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { describeIssues, getPublicEnv } from "@/lib/env.public";

const adminSchema = z.object({ SUPABASE_SECRET_KEY: z.string().min(1) });

/**
 * Cliente com a chave secreta: ignora RLS. Só servidor/scripts; nunca em fluxo de usuário.
 * `fresh: true` tira as leituras da memoização de `fetch` do React/Next dentro de uma mesma renderização (chamada com
 * `AbortSignal` desliga o cache de requisição): a revisão humana cria a versão 1 e lê de novo na mesma página.
 */
export function createAdminClient(options: { fresh?: boolean } = {}) {
  const parsed = adminSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
  });
  if (!parsed.success) throw describeIssues(parsed.error, "servidor");
  return createSupabaseClient(
    getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
    parsed.data.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(options.fresh
        ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal }) } }
        : {}),
    },
  );
}
