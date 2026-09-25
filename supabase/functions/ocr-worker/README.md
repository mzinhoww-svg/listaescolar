# ocr-worker (S07)

Edge Function (Deno) que drena a fila pgmq `ocr_jobs`. Toda a lógica está em `../_shared/worker-core.ts`
(sem APIs do Deno; testada no Vitest com relógio, fila e banco falsos). Este `index.ts` só liga o núcleo ao Supabase.

## Ciclo (POST)
1. Autentica: `x-worker-secret` == `WORKER_SHARED_SECRET`, ou `Authorization: Bearer <chave secreta/service role>`. Senão 401.
2. Sem pipeline configurado (`DEMO_PIPELINE=1` local; a S08 traz o real) responde `pipeline_unavailable` e NÃO lê a fila.
3. `jobs_requeue_stale()` (lease vencido, retry devido, mata os sem tentativas) e `jobs_read(5, 120)`.
4. Por mensagem: `jobs_claim` -> `claimed` processa; `finished` faz ack; `busy` (vt 60 s) e `not_due` (vt até `run_after`) não confirmam.
5. Sucesso: `jobs_complete` + ack. Falha: `jobs_fail` com backoff 30 s x2 (teto 15 min, jitter até 20%) e `jobs_set_vt`; esgotou -> `dead` + DLQ.
6. Antes de extrair, revalida os magic bytes do arquivo armazenado; divergência -> falha `invalid_file` (vira `dead` ao esgotar as tentativas; falha imediata exige `p_permanent` em `jobs_fail`).

Tempo: o teto de uma extração no worker é 90 s (`WORKER_TIMEOUT_MS`), abaixo da lease de `running` do banco (5 min).
Se a lease vencer com o worker ainda vivo, outro worker poderia reivindicar o job: não aumente o teto acima de 5 min.

## Rodar local
```
pnpm db:start && pnpm db:reset
node scripts/supa.mjs status                    # gera .track-workdir
printf 'WORKER_SHARED_SECRET=%s\nDEMO_PIPELINE=1\nDEMO_SLOW_MS=15000\n' "$(openssl rand -hex 16)" > /tmp/ocr-worker.env
pnpm exec supabase --workdir .track-workdir functions serve ocr-worker --no-verify-jwt --env-file /tmp/ocr-worker.env
curl -X POST -H "x-worker-secret: <o segredo>" http://127.0.0.1:54521/functions/v1/ocr-worker
```
Variáveis: `WORKER_SHARED_SECRET` (mín. 16), `DEMO_PIPELINE`, `ALLOW_DEMO_IN_PRODUCTION`, `DEMO_SLOW_MS`. Nunca commite o arquivo de env.

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
