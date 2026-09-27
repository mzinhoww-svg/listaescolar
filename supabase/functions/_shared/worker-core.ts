// Núcleo do worker do OCR. Sem APIs do Deno nem imports próprios (só reexporta): roda na Edge Function e no Vitest.
// Semântica: at-least-once na fila, efeito único no banco (jobs_claim/jobs_complete são idempotentes).
//
// D-057 (S18): este arquivo tinha 424 linhas. Dividido em `worker-types.ts` (tipos/constantes/utilitários puros),
// `worker-process.ts` (processamento de uma mensagem), `worker-tick.ts` (`handleTick`, um ciclo do worker) e
// `worker-rpc.ts` (adaptadores sobre as funções `jobs_*` do banco). Este arquivo continua sendo o ÚNICO ponto de
// import (`../_shared/worker-core.ts` no Deno; `.../worker-core` no Node/Vitest) — reexporta tudo dos irmãos.

export * from "./worker-types.ts";
export * from "./worker-process.ts";
export * from "./worker-tick.ts";
export * from "./worker-rpc.ts";
