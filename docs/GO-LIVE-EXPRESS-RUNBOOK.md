# Runbook Go-Live Express · produção (copiável)

Para o humano executar DEPOIS de criar o projeto Supabase de produção. Nada aqui foi executado. Complementa `docs/GO-LIVE.md` (S20, branch `slice/S20-producao`; `scripts/prod-migrate.mjs` vem dela, mescle a S20 antes). Só nomes de variáveis; nunca valores. Nunca linke o CLI em produção, nunca toque `citynews-prod`.

Convenção: abra um terminal novo e exporte só em memória (não grave em arquivo versionado):

```
export PROD_REF="<ref de 20 caracteres>"
export DATABASE_URL="<SUPABASE_PROD_DB_URL: Session pooler ou Direct, usuário postgres, NÃO a porta 6543>"
```

## 0. Criar o projeto (humano)
Supabase > New project `ListaCerta-prod`, região **sa-east-1**, plano Pro (backups diários; gasto é seu). Database > Extensions: `pg_cron`, `pg_net`, `pgmq`, `pg_trgm`, `unaccent`, `supabase_vault`. Auth/Google/SMTP: `docs/GO-LIVE.md` etapa 3.

## 1. Pré-checagem: banco vazio e backup
```
psql "$DATABASE_URL" -c 'select 1'
psql "$DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'"   # esperado: 0
psql "$DATABASE_URL" -Atc "select extname from pg_extension where extname in ('pg_cron','pg_net','pgmq','pg_trgm','unaccent','supabase_vault') order by 1"   # 6 linhas
```
Se `public` não estiver vazio, PARE. Backup: Supabase > Database > Backups, confirme que o diário está ativo (projeto novo: nada a salvar; depois da importação, faça backup manual antes de qualquer mudança).

## 2. Dry-run das migrations (só leitura)
```
node scripts/prod-migrate.mjs
```
Esperado: `já aplicadas 0 · pendentes N · drift 0`, N = arquivos de `supabase/migrations/`. Drift (exit 2): pare.

## 3. Apply
```
node scripts/prod-migrate.mjs --apply --confirm-production="$PROD_REF"
node scripts/prod-migrate.mjs   # esperado: pendentes 0
```
Cada arquivo roda em transação; falhou, reverte o arquivo; corrija e repita (retoma dos pendentes). Não rode `supabase/seed.sql`, `seed:demo-*` nem `import:inep --demo`.

## 4. Segredos gerados dentro do banco (Vault)
Sem copiar de arquivo. No SQL Editor de produção (ou `psql "$DATABASE_URL"`):
```sql
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'audit_ip_pepper');
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'ocr_worker_secret');
select vault.create_secret('https://<PROD_REF>.supabase.co/functions/v1/ocr-worker', 'ocr_worker_url');
select cron.schedule('ocr-worker-tick', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ocr_worker_url'),
    headers := jsonb_build_object('x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ocr_worker_secret')),
    timeout_milliseconds := 120000
  );
$$);
```
(Troque `<PROD_REF>` pelo ref. Confira o texto exato em `supabase/functions/ocr-worker/README.md`.) O mesmo `ocr_worker_secret` precisa existir na função e na Vercel (`WORKER_SHARED_SECRET`); leia-o do banco direto para onde vai, sem eco nem arquivo:
```
WSS="$(psql "$DATABASE_URL" -Atc "select decrypted_secret from vault.decrypted_secrets where name='ocr_worker_secret'")"
printf %s "$WSS" | vercel env add WORKER_SHARED_SECRET production
supabase secrets set --project-ref "$PROD_REF" WORKER_SHARED_SECRET="$WSS"
unset WSS
```
Verificar: `psql "$DATABASE_URL" -c "select jobname, active from cron.job"` mostra `ocr-worker-tick` ativo.

## 5. Publicar a Edge Function ocr-worker
```
supabase functions deploy ocr-worker --no-verify-jwt --project-ref "$PROD_REF"
supabase secrets set --project-ref "$PROD_REF" APP_ENV=production OPENROUTER_KEY=... AI_MODEL_CHEAP=... AI_MODEL_STRONG=... AI_MODEL_VISION=...
```
(`...` = valores de produção digitados por você. Nunca `DEMO_PIPELINE`.) O ref só entra neste comando (não rode `supabase link`).

## 6. Importação INEP de MT
Baixe o CSV oficial do INEP, registre `shasum -a 256 arquivo.csv` e a data. Com as chaves de produção só neste terminal:
```
export NEXT_PUBLIC_SUPABASE_URL="https://$PROD_REF.supabase.co"
export SUPABASE_SECRET_KEY="<chave secret de produção>"
pnpm import:inep /caminho/inep-oficial.csv --i-know-this-is-production
```
(O script usa o CSV direto no banco; é o mesmo procedimento do staging, sem `--demo`.) Anote no PROGRESS: total, inseridas, atualizadas, sem alteração, duplicadas, rejeitadas e o hash. Reimportar é idempotente.
```
psql "$DATABASE_URL" -Atc "select count(*) from public.schools where is_demo"           # 0
psql "$DATABASE_URL" -Atc "select count(*) from public.schools where not is_demo"       # = inseridas + atualizadas
```
Depois: `unset SUPABASE_SECRET_KEY`. Primeiro admin: entre pelo login e rode `update public.profiles set role='admin' where id='<seu uuid>';`.

## 7. Vercel > Production (nomes; valores seus)
Settings > Environment Variables, escopo **Production** apenas. Nomes do `.env.example`:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `OPENROUTER_KEY`, `AI_MODEL_CHEAP`, `AI_MODEL_STRONG`, `AI_MODEL_VISION`, `SENTRY_DSN`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NOTIFICATIONS_DISPATCH_SECRET`, `EMAIL_NOTIFICATIONS_ENABLED`, `EMAIL_API_KEY`, `EMAIL_FROM`, `MELI_AFFILIATE_ID`, `MELI_AFFILIATE_WORD`, `AMAZON_ASSOCIATE_TAG`, `APP_ENV` (=`production`), `WORKER_SHARED_SECRET` (passo 4), `CRON_SECRET`, `PAYMENTS_PIX_ENABLED`, `PIX_API_BASE_URL`, `PIX_OAUTH_TOKEN_URL`, `PIX_CLIENT_ID`, `PIX_CLIENT_SECRET`, `PIX_CERT_PEM_BASE64`, `PIX_KEY_PEM_BASE64`, `PIX_RECEIVER_KEY`, `PIX_WEBHOOK_TOKEN`, `PIX_CHARGE_TTL_SECONDS`, `PESQUISA_RESULTS_PASSWORD`, `IP_HASH_SALT`, `B2B_API_KEY_PEPPER`, `B2B_WEBHOOK_ENCRYPTION_KEY`, `WEBHOOKS_DISPATCH_SECRET`, `NEXT_PUBLIC_SITE_URL`.
- Segredos próprios gerados de novo (`openssl rand -hex 32 | vercel env add NOME production`), nunca copiados do staging: `CRON_SECRET`, `IP_HASH_SALT`, `PESQUISA_RESULTS_PASSWORD`, `PIX_WEBHOOK_TOKEN`, `NOTIFICATIONS_DISPATCH_SECRET`, `WEBHOOKS_DISPATCH_SECRET`, `B2B_API_KEY_PEPPER`, `B2B_WEBHOOK_ENCRYPTION_KEY`.
- Não definir em produção: `DEMO_PIPELINE`, `DEMO_RETAILERS`, `DEMO_CLAIM_DELIVERY`, `FAKE_AI_SCRIPT`, `FAKE_PUBLICATION_FIXTURE`, `DEMO_SLOW_MS`. Não definir `SITE_INDEXING` (só no go-live público, GO-LIVE etapa 14).
- Redeploy de produção depois de salvar. O Ignored Build Step (`vercel.json`) pula deploy de commits só de docs/markdown/.claude.

## 8. Smoke
```
curl -sI https://<domínio>/ | head -1; curl -sI https://<domínio>/ | grep -i x-robots-tag   # noindex ainda
curl -s -o /dev/null -w '%{http_code}\n' https://<domínio>/api/cron/leads-expire             # 401 ou 503, nunca 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domínio>/escolas                            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domínio>/v1/openapi.json                    # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domínio>/robots.txt                         # 200
curl -s -X POST -H "x-worker-secret: $WSS_VIA_VAULT" https://$PROD_REF.supabase.co/functions/v1/ocr-worker   # status ok (leia o segredo do Vault na hora; não cole em histórico)
```
Manual: `/entrar` (link mágico em outro navegador e Google), `/admin`, uma escola de Cuiabá. Sem lead nem cobrança real. Advisors de segurança do Supabase sem alerta novo.

## 9. Rollback
- App: Vercel > Deployments > deploy anterior > Promote to Production (ou `vercel rollback`). Variáveis erradas: corrigir e redeploy.
- Worker: `select cron.unschedule('ocr-worker-tick');` para parar; `supabase functions delete ocr-worker --project-ref "$PROD_REF"` se preciso.
- Migration falha: o arquivo reverte sozinho; corrija e reexecute. Migration já aplicada com problema: nova migration corretiva (nunca editar a aplicada). Banco de projeto novo e ainda sem tráfego: o rollback total é apagar e recriar o projeto (decisão e gasto do humano).
- Dados importados errados: restaure o backup do passo 1/6 (Supabase > Backups) ou reimporte o CSV (idempotente).
- Tráfego: manter `SITE_INDEXING` indefinido mantém o site `noindex`.
