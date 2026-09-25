# ocr-worker (S07)

Edge Function (Deno) que drena a fila pgmq `ocr_jobs`. Toda a lógica está em `../_shared/worker-core.ts`
(sem APIs do Deno; testada no Vitest com relógio, fila e banco falsos). Este `index.ts` só liga o núcleo ao Supabase.

## Ciclo (POST)
1. Autentica: `x-worker-secret` == `WORKER_SHARED_SECRET`, ou `Authorization: Bearer <chave secreta/service role>`. Senão 401.
2. Sem pipeline configurado (`DEMO_PIPELINE=1` com `APP_ENV` em {local, development, preview, staging}; a S08 traz o real) responde `pipeline_unavailable` e NÃO lê a fila. `APP_ENV` ausente = demo desligado (mesma regra do app, em `_shared/demo-lock.ts`).
3. `jobs_requeue_stale()` (lease vencido, retry devido, mata os sem tentativas; se falhar, o tick segue e registra) e `jobs_read(3, 120)`. Prazo do tick: 100 s; depois dele nenhuma mensagem nova é reivindicada (as lidas voltam à fila em 5 s) e o teto de cada extração respeita o que resta.
4. Por mensagem: `jobs_claim` -> `claimed` processa; `finished` faz ack; `busy` (vt 60 s) e `not_due` (vt até `run_after`) não confirmam.
5. Sucesso: a saída do pipeline é validada por `extractionResultSchema` (Zod, `_shared/extraction-schema.ts`; inválida = falha/retry) e só então `jobs_complete` (com a tentativa como token de fencing e `is_demo` quando o pipeline é demo) + ack. Falha: `jobs_fail` com backoff 30 s x2 (teto 15 min, jitter até 20%) e `jobs_set_vt`; esgotou -> `dead` + DLQ.
6. Antes de extrair, revalida os magic bytes do arquivo armazenado; divergência -> falha `invalid_file` com `p_permanent = true`: o job vai direto a `dead` (DLQ), sem novas tentativas.

Tempo: o teto de uma extração no worker é 90 s (`WORKER_TIMEOUT_MS`), abaixo da lease de `running` do banco (5 min).
Se a lease vencer com o worker ainda vivo, outro worker poderia reivindicar o job: não aumente o teto acima de 5 min.

## Rodar local
```
pnpm db:start && pnpm db:reset
node scripts/supa.mjs status                    # gera .track-workdir
printf 'WORKER_SHARED_SECRET=%s\nDEMO_PIPELINE=1\nAPP_ENV=local\nDEMO_SLOW_MS=15000\n' "$(openssl rand -hex 16)" > /tmp/ocr-worker.env
pnpm exec supabase --workdir .track-workdir functions serve ocr-worker --no-verify-jwt --env-file /tmp/ocr-worker.env
curl -X POST -H "x-worker-secret: <o segredo>" http://127.0.0.1:54521/functions/v1/ocr-worker
```
`ocr-worker/deno.json` mapeia `zod` (o schema compartilhado importa por nome). Importante: a função só enxerga a própria pasta `supabase/functions` (imports `../_shared/*.ts`); por isso `demo-pipeline.ts` vive em `_shared`
e `features/submissions/demo-pipeline.ts` só o reexporta.

## Validação no Deno (2026-09-24, supabase-edge-runtime 1.74.3 / Deno 2.1.4)
Com a função servida como acima (`DEMO_SLOW_MS=3000`) e o banco local da trilha:
```
WORKER_URL=http://127.0.0.1:54521/functions/v1/ocr-worker WORKER_SHARED_SECRET=<o segredo> \
  pnpm exec vitest run -c vitest.db.config.ts tests/submissions/edge-function
```
Sem essas variáveis o teste é ignorado. Resultado: 3 de 3 verdes.
- sem segredo: 401;
- envio lento (pipeline do orçamento nunca responde, 10 s simulados) -> `processing_async` + 1 mensagem; tick real: `{read:1, done:1}`, job `succeeded`, `list_submissions.status = review_needed`, 1 linha em `ocr_jobs`;
- mensagem duplicada do mesmo job: `{read:1, skipped:1, done:0}`, sem segundo `ocr_jobs`;
- arquivo `falha.pdf` (falha simulada): `{retry:1}`, job `retrying`, attempts 1;
- objeto armazenado corrompido: `{dead:1}`, job `dead` com attempts 1 (falha permanente imediata).
Variáveis: `WORKER_SHARED_SECRET` (mín. 16), `DEMO_PIPELINE`, `APP_ENV`, `DEMO_SLOW_MS` (inválido/NaN cai em 15000). Nunca commite o arquivo de env.

## Agendamento (a cada minuto)
`pg_cron` + `pg_net` chamam a função; URL e segredo ficam no Vault (nunca em migration):
```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/ocr-worker', 'ocr_worker_url');
select vault.create_secret('<WORKER_SHARED_SECRET>', 'ocr_worker_secret');
select cron.schedule('ocr-worker-tick', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ocr_worker_url'),
    headers := jsonb_build_object('x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ocr_worker_secret'))
  )
$$);
```
Além do cron, `createJobQueue` (features/submissions/supabase-queue.ts) chama a função logo após enfileirar (best effort, 1,5 s).
No hospedado isto é configuração fora do SQL versionado (registrar em PROGRESS.md pelo orquestrador).
