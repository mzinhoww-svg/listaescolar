import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

/** Variáveis vazias contam como ausentes. */
export function blankToUndefined(input: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === "" ? undefined : v]));
}

/** Lista nomes de variáveis com problema, sem ecoar valores. */
export function describeIssues(error: z.ZodError, scope: string): Error {
  const names = [...new Set(error.issues.map((i) => String(i.path[0])))];
  return new Error(`Variáveis de ambiente ausentes ou inválidas (${scope}): ${names.join(", ")}`);
}

/** Só valida quando chamada. Referências estáticas para o Next inlinar NEXT_PUBLIC_*. */
export function getPublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse(
    blankToUndefined({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    }),
  );
  if (!parsed.success) throw describeIssues(parsed.error, "públicas");
  return parsed.data;
}
