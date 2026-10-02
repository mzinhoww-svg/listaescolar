import "server-only";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import { b2bDbErrorCode, B2bServiceError, type B2bServiceErrorCode } from "./errors";

/**
 * D-158 (S19): `repository.ts` tinha 411 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão
 * do D-057 (S18): este arquivo (guarda/erro comuns), `repository-apply.ts` (cadastro), `repository-overview.ts`
 * (leitura do próprio parceiro), `repository-keys.ts` (chaves), `repository-admin.ts` (Admin15). `repository.ts`
 * continua sendo o ÚNICO ponto de import (`@/features/b2b/repository`) — reexporta tudo dos irmãos, nenhum
 * import de chamador muda.
 *
 * Repositório server-only do portal B2B (dono e admin). Recebe o cliente de SERVIÇO e um `SessionActor`; posse e
 * papel são conferidos aqui E de novo, dentro da mesma transação, pelas funções SQL (0501) — defesa em profundidade.
 * Mesmo padrão de `features/stationeries/repository.ts`.
 */

/** O ator precisa ter sido criado por `getSessionActor` (o tipo de marca não cobre `as`). */
export function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new B2bServiceError("ator não vem da sessão", "forbidden");
}

export function fail(what: string, error: { message: string; code?: string; hint?: string | null }, code?: B2bServiceErrorCode): never {
  throw new B2bServiceError(`${what}: ${error.message}`, code ?? b2bDbErrorCode(error), error.code);
}

/** `forbidden` de uma operação sobre uma chave/parceiro alheio vira `not_found`: nunca revela que existe. */
export function failMasked(what: string, error: { message: string; code?: string; hint?: string | null }): never {
  const code = b2bDbErrorCode(error);
  fail(what, error, code === "forbidden" ? "not_found" : code);
}
