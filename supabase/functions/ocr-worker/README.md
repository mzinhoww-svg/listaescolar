# ocr-worker (S07)

Edge Function (Deno) que drena a fila pgmq `ocr_jobs`. Toda a lógica está em `../_shared/worker-core.ts`
(sem APIs do Deno; testada no Vitest com relógio, fila e banco falsos). Este `index.ts` só liga o núcleo ao Supabase.

## Ciclo (POST)
1. Autentica: `x-worker-secret` == `WORKER_SHARED_SECRET`, ou `Authorization: Bearer <chave secreta/service role>`. Senão 401.
2. Pipeline: demonstração (`DEMO_PIPELINE=1` com `APP_ENV` em {local, development, preview, staging}) OU o real da S08 (roteador barato-primeiro + adapters em `_shared/ai/`), que exige os secrets `OPENROUTER_KEY`, `AI_MODEL_CHEAP`, `AI_MODEL_STRONG` (e `AI_MODEL_VISION para fotos: um modelo com entrada de imagem; foto não escala para o forte`) — nomes de modelo só nos secrets, nunca no código. Só para teste local: `FAKE_AI_SCRIPT` (JSON por rota) troca o OpenRouter por um provedor falso, e SÓ com `APP_ENV` local|development|preview|staging (nunca em produção). Limiares, rotas e prompt vêm de `ai_settings`/`prompt_registry` (funções `ai_get_settings`, `ai_get_active_prompt`) e cada tentativa grava `ai_decisions` (`ai_record_decision`) com `entity_id` = id do envio. Sem nenhum dos dois responde `pipeline_unavailable` e NÃO lê a fila. `APP_ENV` ausente = demo desligado (mesma regra do app, em `_shared/demo-lock.ts`).
3. `jobs_requeue_stale()` (lease vencido, retry devido, mata os sem tentativas; se falhar, o tick segue e registra) e `jobs_read(3, 120)`. Prazo do tick: 100 s; depois dele nenhuma mensagem nova é reivindicada (as lidas voltam à fila em 5 s) e o teto de cada extração respeita o que resta.
4. Por mensagem: `jobs_claim` -> `claimed` processa; `finished` faz ack; `busy` (vt 60 s) e `not_due` (vt até `run_after`) não confirmam.
5. Sucesso: a saída do pipeline é validada por `extractionResultSchema` (Zod, `_shared/extraction-schema.ts`; inválida = falha/retry) e só então `jobs_complete` (com a tentativa como token de fencing e `is_demo` quando o pipeline é demo) + ack. Falha: `jobs_fail` com backoff 30 s x2 (teto 15 min, jitter até 20%) e `jobs_set_vt`; esgotou -> `dead` + DLQ.
6. Antes de extrair, revalida os magic bytes do arquivo armazenado; divergência -> falha `invalid_file` com `p_permanent = true`: o job vai direto a `dead` (DLQ), sem novas tentativas.

Tempo: o teto de uma extração no worker é 90 s (`WORKER_TIMEOUT_MS`), abaixo da lease de `running` do banco (5 min).
Se a lease vencer com o worker ainda vivo, outro worker poderia reivindicar o job: não aumente o teto acima de 5 min.

## Publicação automática (S09)
- Depois de `jobs_complete`, o worker chama `decideListPublication` (mesmo motor de `_shared/publication`); erro vai a `onError` (`stage: decide`) e o job segue `done`.
- Fim do tick: varredor `runPublicationSweep` (lote 10, envios com 30 s+ parados, só com >= 10 s de prazo). Roda também sem pipeline (a resposta é `pipeline_unavailable`, sem ler a fila).
- Portas REAIS (S11, `_shared/publication/rpc-ports.ts`: funções SQL `list_publish_from_pipeline` e `publication_context` pelo cliente de serviço) sempre que há cliente de serviço. As portas em memória só vencem com `FAKE_PUBLICATION_FIXTURE` (JSON) + `APP_ENV` local|development (nunca preview/staging); o E2E da S11 (`scripts/e2e-s11.sh`) roda o worker SEM fixture e prova a publicação real a partir do tick.
- `ai_settings.auto_publish_enabled` (default false) liga a publicação automática por dado.

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
O app NÃO chama a função ao enfileirar: o cron por minuto é o único acionador (nada de espera extra para o usuário).
No hospedado isto é configuração fora do SQL versionado (registrar em PROGRESS.md pelo orquestrador).

## Deploy no hospedado (notas)
- `verify_jwt = false`: a função autentica sozinha (`x-worker-secret` ou `Authorization: Bearer <chave secreta>`). Ao publicar pelo MCP, passe o parâmetro `verify_jwt: false`; sem isso o gateway devolve 401 antes do código.
- Segredos da função: `WORKER_SHARED_SECRET` (mín. 16), `APP_ENV` (`staging`; nunca `production` com demo), `DEMO_PIPELINE` (`1` só em ambiente não produtivo). `SUPABASE_URL` e a chave secreta vêm do runtime; se só existir a chave legada `service_role`, o código a usa como alternativa.
- `net.http_post` do agendador usa `timeout_milliseconds` alto (ex.: `120000`): o padrão de 5 s derruba a chamada enquanto o tick ainda trabalha (o tick leva até 100 s).
