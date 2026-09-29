import "server-only";

import { z } from "zod";

import { isSessionActor, type SessionActor } from "@/features/auth/actor";

import { campaignDbErrorCode, CampaignServiceError, type CampaignServiceErrorCode } from "./errors";

/**
 * D-158 (S19): `repository.ts` tinha 320 linhas. Dividido em arquivos-irmãos por responsabilidade, mesmo padrão
 * do D-057 (S18): este arquivo (guarda/erro/conversão numérica comuns), `repository-insights.ts`,
 * `repository-statements.ts`. `repository.ts` continua sendo o ÚNICO ponto de import
 * (`@/features/campaigns/repository`) — reexporta tudo dos irmãos; nenhum import de chamador muda.
 */

export function requireActor(actor: SessionActor): void {
  if (!isSessionActor(actor)) throw new CampaignServiceError("ator não vem da sessão", "forbidden");
}

export function fail(what: string, error: { message: string; code?: string; hint?: string | null }, code?: CampaignServiceErrorCode): never {
  throw new CampaignServiceError(`${what}: ${error.message}`, code ?? campaignDbErrorCode(error), error.code);
}

/** Colunas `numeric` (0503: `accrued_total_cents`, livro-razão/extrato em milésimos de centavo para o CPM exato)
 * chegam do PostgREST como string, nunca como float, para não perder precisão — converte para number aqui, na
 * borda, depois de já ter passado pelo Postgres com precisão total. */
export const numericAsNumber = z.union([z.number(), z.string()]).transform((v) => Number(v));
