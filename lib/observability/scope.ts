import "server-only";

import * as Sentry from "@sentry/nextjs";

import type { UserRole } from "@/features/auth/access";

/**
 * Escopo do Sentry por PAPEL (S19) — nunca por pessoa: nenhum id de usuário, e-mail ou nome vai à tag. Sem DSN
 * configurado, `Sentry.setTag` é inerte (SDK não inicializado). Chamado de um único ponto central
 * (`features/auth/queries.ts::getCurrentRole`, `cache()` por requisição) para não espalhar por todo o código.
 */
export function setRoleScope(role: UserRole | null): void {
  Sentry.setTag("role", role ?? "anon");
}
