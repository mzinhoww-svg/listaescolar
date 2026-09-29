# GO-LIVE · ListaCerta (S20)

Checklist ordenado do go-live. Nada aqui foi executado em produção: o projeto Supabase de produção ainda não existe (ADR-003). Regras de fundo: migration ou remoção de dados em produção, credenciais e gasto só com o humano (CLAUDE.md, Autonomia).

Legenda: **[H]** o humano faz. **[O]** o orquestrador faz, só depois de o humano confirmar a etapa anterior. Nunca cole valor de segredo em issue, PR, chat ou log; este documento só cita nomes.

Fontes: `docs/PLAN.md` (S20), `docs/superpowers/PROGRESS.md` (pendências humanas, migrations), `docs/superpowers/DEBT.md`, ADR-003, ADR-005, ADR-006, ADR-007, `.env.example`, `lib/env.ts`, `vercel.json`.

## Critério de pronto (gate de go-live)

Só se liga o tráfego real (etapa 14) quando TODOS forem verdade:

1. **S28 mesclada na `main`** (ADR-006): `docs/MELHORIAS.md` e `DESIGN.md` na `main`, Lighthouse mobile >= 90 (desempenho e acessibilidade), axe sem violação séria/crítica, custo de IA por lista < R$ 0,50 registrado no PROGRESS.
2. **`docs/superpowers/DEBT.md` sem severidade alta aberta**, ou cada uma com `Ruling` explícito no `docs/superpowers/ledger.md`. Em 2026-09-28 estão altas e abertas: D-001 (rate limit por IP, S19), D-045, D-050, D-070, D-071 (S10; a tabela do DEBT ainda a mostra aberta: fechar com evidência do E2E da S10 ou registrar Ruling), D-049 (E2E no preview: fecha com o roteiro da S20), D-074 (proteção dos previews, etapa 1), D-075 (`SITE_INDEXING`, etapa 14), D-102 (plano de cobrança, etapa 5). Rode `awk -F'|' '$5 ~ /alta/ && $7 ~ /aberta|em andamento/ {print $2}' docs/superpowers/DEBT.md` e o resultado deve ser vazio, ou cada ID listado deve ter Ruling.
3. S19 mesclada (migrations `0606` e `0607`, cron `health-check`) e aplicada no staging e testada.
4. Roteiro `docs/superpowers/e2e/S20-roteiro.md` executado no staging com 0 falhas, incluindo o lead REAL de ponta a ponta.
5. Dry-run do `scripts/prod-migrate.mjs` contra o banco de produção sem drift e com a lista de pendentes esperada (etapa 6).
6. Textos jurídicos finais publicados (etapa 8), sem `[a definir: ...]` nas páginas `/termos`, `/privacidade`, `/parceiros/termos`.

## Etapas

### 1. [H] Proteger os previews da Vercel ANTES de qualquer dado real (D-074)

Hoje os previews são públicos e apontam para o staging (`X-Robots-Tag: noindex` é a única barreira).
- Vercel > projeto `listaescolar` (produção `listaescolare`, conforme o alias em uso) > Settings > Deployment Protection > **Vercel Authentication** = "Standard Protection" (Preview e Production URLs de deployment), ou "Password Protection" (plano pago).
- Domínio de produção continua público (é o domínio customizado).
- Depois: o agent-browser não abre o preview sem o bypass. Gere em Settings > Deployment Protection > **Protection Bypass for Automation** o segredo e informe ao orquestrador por variável de ambiente local (nunca no repositório); o roteiro usa `?x-vercel-protection-bypass=<segredo>&x-vercel-set-bypass-cookie=true`.
- Verificar: `curl -sI https://<preview>.vercel.app/ | head -1` devolve `401` sem o bypass.

### 2. [H] Criar o projeto Supabase de produção

- supabase.com > New project, organização da conta, nome `ListaCerta-prod`, região de preferência a do staging (ca-central-1; para o piloto em Cuiabá considerar sa-east-1, decisão do humano), senha forte do banco guardada só no gerenciador de senhas.
- Plano: Pro recomendado (backups diários, sem pausa por inatividade). Gasto: só o humano contrata.
- Database > Extensions: habilitar `pg_cron`, `pg_net`, `pgmq`, `pg_trgm`, `unaccent`, `supabase_vault` (o schema `vault` precisa existir).
- Anotar o **ref** do projeto (20 caracteres). Entregar ao orquestrador SOMENTE: o ref e a `DATABASE_URL` de conexão direta/sessão (Project Settings > Database > Connection string > "Session pooler" ou "Direct", usuário `postgres`; **não** a de transaction pooler, porta 6543, que não serve para `--single-transaction` com DDL) numa variável de ambiente do terminal do orquestrador, sem gravar em arquivo versionado.
- Verificar: `psql "$DATABASE_URL" -c 'select 1'` retorna `1` (o script `prod-migrate.mjs` nunca imprime a URL).

### 3. [H] Auth do projeto de produção (Authentication)

- URL Configuration: Site URL = domínio de produção (etapa 7); Redirect URLs: `https://<domínio>/auth/confirm**`, `https://<domínio>/auth/callback**`. Não incluir o glob dos previews em produção.
- Templates de e-mail `magic_link` e `confirmation`: copiar `supabase/templates/magic_link.html` e `confirmation.html` (usam `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`). Sem isso o link mágico só funciona no mesmo navegador.
- Providers > Google: Client ID e Secret de credencial OAuth **de produção** (Google Cloud Console > APIs e serviços > Credenciais; origem autorizada = domínio; URI de redirecionamento = `https://<ref>.supabase.co/auth/v1/callback`).
- SMTP próprio (D-063; o SMTP padrão do Supabase tem limite baixo): Project Settings > Authentication > SMTP Settings com o provedor escolhido (etapa 4).
- Verificar (após a etapa 10): login por link mágico em outro navegador e login com Google.

### 4. [H] Credenciais e contas de terceiros

Cada item vira variável da Vercel Production (etapa 7) ou segredo do Supabase (etapa 9). Sem a credencial o recurso aparece "indisponível" (regra de produto), nunca inventado.
- **Pix/PSP (S21/S23):** escolher o PSP, criar conta, certificado mTLS, chave Pix, cadastrar o webhook `https://<domínio>/api/billing/pix/webhook/<PIX_WEBHOOK_TOKEN>` (sem barra no fim). Variáveis: `PAYMENTS_PIX_ENABLED`, `PIX_API_BASE_URL`, `PIX_OAUTH_TOKEN_URL`, `PIX_CLIENT_ID`, `PIX_CLIENT_SECRET`, `PIX_CERT_PEM_BASE64`, `PIX_KEY_PEM_BASE64`, `PIX_RECEIVER_KEY`, `PIX_WEBHOOK_TOKEN` (`openssl rand -hex 24`), `PIX_CHARGE_TTL_SECONDS`. O adapter ainda não foi validado contra o PSP real (D-076): o primeiro pagamento de teste em produção (valor mínimo) é do humano.
- **Afiliados:** `MELI_AFFILIATE_ID` (e `MELI_AFFILIATE_WORD` se o programa exigir), `AMAZON_ASSOCIATE_TAG`.
- **SMTP / e-mail transacional:** conta do provedor; para notificações por e-mail: `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_NOTIFICATIONS_ENABLED=1` (padrão 0) e, no banco, `notification_settings.email_enabled = true` (só quando decidir ligar).
- **VAPID (Web Push):** `node scripts/vapid-dev.mjs` só gera par local. Gere um par NOVO de produção (`npx web-push generate-vapid-keys`) e cadastre `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` de contato). Sem elas o canal Push aparece "indisponível".
- **OpenRouter:** chave de produção (`OPENROUTER_KEY`) e modelos `AI_MODEL_CHEAP`, `AI_MODEL_STRONG`, `AI_MODEL_VISION` (modelo com entrada de imagem). Rodar `scripts/ai-smoke.ts` com a chave real tem custo: é do humano.
- **PostHog (ADR-007, plano gratuito):** projeto separado para produção (o de staging/preview é outro); `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (e `POSTHOG_PERSONAL_API_KEY` só se a S28 a usar). Sem dado pessoal de menor nem do responsável. Nomes conferidos contra a S28 quando mesclada (não existem em `lib/env.ts` até lá).
- **WhatsApp:** credencial para tokens de reivindicação e notificações (S06/S11); sem ela os métodos por token de WhatsApp aparecem indisponíveis.
- **Sentry:** `SENTRY_DSN` (e `SENTRY_AUTH_TOKEN` para source maps, opcional).

### 5. [H] Publicar o plano de cobrança (D-102)

Pendente no staging (fila "Aguardando humano" do PROGRESS) e igual em produção. Em `/admin/planos` como admin (etapa 10): 10 leads grátis sem validade; faixa única de 1 item em diante a R$ 5,00; passe R$ 1.500,00, 300 leads incluídos, até 3 parcelas; temporada novembro (11) a março (3); pacotes R$ 50, R$ 100, R$ 250 (valores do Ruling de 2026-09-28; alterar só com decisão do humano). SQL equivalente no PROGRESS.md. Verificar: `/papelaria/creditos` deixa de mostrar `billing_unavailable`.

### 6. [O] Dry-run das migrations em produção (só leitura)

Pré-requisito: etapas 1 a 3 confirmadas e `DATABASE_URL` no terminal.
```
node scripts/prod-migrate.mjs
```
Resultado esperado no projeto novo: "já aplicadas 0 · pendentes N · drift 0", com N = número de arquivos em `supabase/migrations/` (27 hoje; 29 com `0606` e `0607` da S19). Qualquer drift (exit 2) para tudo. Verificar o relatório do dry-run contra o staging em `docs/superpowers/e2e/S20-migrate-dry-run.md`.

### 7. [H] Vercel: domínio, ambientes e variáveis

- Domínio: Vercel > Settings > Domains > adicionar o domínio, seguir o DNS indicado (registros A/CNAME no registrador). Definir como domínio de produção.
- Variáveis: seção "Variáveis de ambiente" abaixo; cadastrar em Settings > Environment Variables, **Production** com os valores de produção; **Preview** e **Development** continuam apontando para o staging. `NEXT_PUBLIC_SITE_URL` = `https://<domínio>` (canonical, JSON-LD, sitemap, links de login e do lead dependem dele).
- **Nunca** copiar segredo do staging para produção: `B2B_API_KEY_PEPPER`, `B2B_WEBHOOK_ENCRYPTION_KEY`, `CRON_SECRET`, `WORKER_SHARED_SECRET`, `IP_HASH_SALT`, `PESQUISA_RESULTS_PASSWORD`, `PIX_WEBHOOK_TOKEN`, `NOTIFICATIONS_DISPATCH_SECRET`, `WEBHOOKS_DISPATCH_SECRET`, `B2B_CAMPAIGN_TRACKING_SECRET` são gerados de novo (`openssl rand -hex 32`).
- **Não definir** em produção: `DEMO_PIPELINE`, `DEMO_RETAILERS`, `DEMO_CLAIM_DELIVERY`, `FAKE_AI_SCRIPT`, `FAKE_PUBLICATION_FIXTURE`, `DEMO_SLOW_MS`. `APP_ENV=production`. **Não** definir `SITE_INDEXING` ainda (etapa 14).
- **Crons (aceite do plano da conta):** `vercel.json` traz cinco crons diários (`leads-expire`, `notifications/dispatch`, `billing-reconcile`, `b2b-maintenance`, `retention-purge`) e a S19 acrescenta `health-check` (seis). O plano Hobby limita a quantidade e a frequência de crons; confirme em Vercel > Settings > Cron Jobs que os seis aparecem ativos após o primeiro deploy de produção. Se o plano não comportar, decidir entre upgrade (gasto do humano) ou mover para `pg_cron` do Supabase. O despacho de webhooks (`/api/webhooks/dispatch`) e o de notificações a cada minuto exigem `pg_cron` + `pg_net` (etapa 9) ou Vercel Cron pago.
- **Firewall/WAF rate limit** (a primeira camada em memória por instância não basta; D-001): Vercel > Firewall > Rules > Add rule "rate limit `/v1/*`" e "rate limit `/api/widget/*`": condição Request Path começa com `/v1/` (depois `/api/widget/`), estratégia Fixed Window, chave IP, limite 60 req/min por IP (mesmo teto do código), ação Rate Limit (429). Publicar (Publish). Considerar também `/api/submissions/*` e login (D-001). Verificar: `for i in $(seq 70); do curl -s -o /dev/null -w '%{http_code}\n' https://<domínio>/v1/schools; done | sort | uniq -c` mostra 429 depois do limite.
- Verificar: primeiro deploy de produção READY; `curl -sI https://<domínio>/ | grep -i x-robots-tag` ainda mostra `noindex` (correto até a etapa 14).

### 8. [H] Conteúdo jurídico e de dados

- Textos jurídicos finais (razão social, CNPJ, DPO/contato, base legal, operadores e contratos incluindo o PostHog, data da última atualização): substituir os `[a definir: ...]` de `/termos`, `/privacidade`, `/parceiros/termos`. Decidir o prazo de guarda de `audit_log` (`LEGAL.auditRetention`, D-150). Não afirmar conformidade jurídica. Validar a promessa "Famílias e escolas não pagam" contra o modelo de preço antes de publicar.
- **CSV oficial do INEP:** arquivo original do INEP separado e entregue ao orquestrador (caminho local). Registrar a data de download e o hash (`shasum -a 256`).
- **HSTS preload (decisão):** decidir se o domínio entra na lista de preload (hstspreload.org). É praticamente irreversível: só depois de o domínio e todos os subdomínios servirem HTTPS estável; enquanto não decidir, manter o HSTS sem `preload`.

### 9. [O] Projeto de produção: banco e worker (depois das etapas 2, 3, 7)

1. Aplicar migrations (só com `--confirm-production=<ref>` digitado pelo humano ou confirmado por ele por escrito):
   ```
   node scripts/prod-migrate.mjs --apply --confirm-production=<ref>
   ```
   Cada arquivo roda em `psql --single-transaction -v ON_ERROR_STOP=1` junto com o registro em `supabase_migrations.schema_migrations`. Falhou: o arquivo inteiro reverte; corrigir e repetir (o script retoma nos pendentes). Reexecutar o dry-run: "pendentes 0".
2. Segredo do IP de auditoria (D-059), no SQL Editor de produção, valor gerado no banco: `select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'audit_ip_pepper');` (diferente do staging; a auditoria falha fechada sem ele).
3. Edge Function `ocr-worker`: `supabase functions deploy ocr-worker --no-verify-jwt --project-ref <ref>` (o ref só entra nesse comando por ordem explícita do humano; o CLI nunca é linkado). Secrets da função: `WORKER_SHARED_SECRET` (o mesmo da Vercel), `APP_ENV=production`, `OPENROUTER_KEY`, `AI_MODEL_CHEAP`, `AI_MODEL_STRONG`, `AI_MODEL_VISION`. Nunca `DEMO_PIPELINE`.
4. Vault e agendamento (SQL Editor, conforme `supabase/functions/ocr-worker/README.md`): `vault.create_secret('https://<ref>.supabase.co/functions/v1/ocr-worker', 'ocr_worker_url')`, `vault.create_secret('<WORKER_SHARED_SECRET>', 'ocr_worker_secret')` e `cron.schedule('ocr-worker-tick', '* * * * *', ...)` com `timeout_milliseconds := 120000`. Os valores do segredo só passam pelo terminal do humano.
5. Despachos por minuto opcionais (`/api/notifications/dispatch`, `/api/webhooks/dispatch`) por `pg_cron` + `pg_net` com `Authorization: Bearer <segredo>` no Vault, se o cron diário não bastar.
6. Verificar: `select jobname, active from cron.job;` e um tick manual (`curl -X POST -H "x-worker-secret: ..." https://<ref>.supabase.co/functions/v1/ocr-worker` devolve `status: ok`); advisors do Supabase (Security) sem alerta novo além dos aceitos (`auth_role()` para anon, `rls_auto_enable()`, view `stationery_public`).

### 10. [O] Seed mínimo SEM demonstração

- Cuiabá já vem da migration `0001` (`municipalities.is_enabled = true`). O perfil `system` vem da `0601`.
- NÃO rodar `supabase/seed.sql` (cria usuários de desenvolvimento e um admin). NÃO rodar `pnpm seed:demo-lists`, `pnpm seed:demo-claims`, nem `pnpm import:inep --demo`. Verificar: `select count(*) from public.schools where is_demo;` = 0 em produção após tudo.
- Primeiro admin: o humano entra pelo login (etapa 3) com a própria conta e promove-se no SQL Editor: `update public.profiles set role = 'admin' where id = '<uuid da própria conta>';`. Depois disso, o admin publica o plano (etapa 5).
- `ai_settings.auto_publish_enabled` continua `false` (só o humano liga, e só depois de E2E).

### 11. [O] Importação INEP com contagem real

Com `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY` de produção no ambiente do terminal, e depois da confirmação do humano:
```
pnpm import:inep /caminho/inep-oficial.csv --i-know-this-is-production
```
Registrar a contagem impressa ("Total, inseridas, atualizadas, sem alteração, duplicadas, rejeitadas") e o hash do arquivo em `docs/superpowers/PROGRESS.md`; guardar o relatório de erros fora do repositório se houver dado pessoal de contato. Reimportar o mesmo arquivo é idempotente (hash do arquivo). Verificar: `select count(*) from public.schools where not is_demo;` bate com "inseridas + atualizadas"; `/escolas` lista Cuiabá.

### 12. [H] + [O] Migração dos dados `survey_*` (ADR-005)

As tabelas `survey_responses` e `survey_leads` guardam respostas REAIS de pessoas; a migração é uma tarefa própria, só depois da etapa 9.
1. [H] Antes: exportar o backup CSV em `/pesquisa/resultados` (respostas e leads) e guardar fora do repositório.
2. [O] Contagens de origem (staging), sem dados pessoais: `select count(*) from public.survey_responses; select count(*) from public.survey_leads;` (e por `source_group`, sem apagar `e2e-teste`).
3. [O] Copiar com `pg_dump` só dessas duas tabelas, dados apenas, e restaurar em produção, ambos os `DATABASE_URL` só em variável de ambiente, arquivo temporário fora do repositório e apagado depois:
   `pg_dump "$STAGING_DATABASE_URL" --data-only --no-owner --table=public.survey_responses --table=public.survey_leads -f "$TMPDIR/survey.sql"` seguido de `psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f "$TMPDIR/survey.sql"`. A URL do staging só é lida (regra do ref de staging continua valendo para escrita).
4. [O] Não migrar linhas `source_group = 'e2e-teste'` (filtrar antes, com `\copy (select ...)` ou apagando na cópia de produção, nunca no staging).
5. Verificar: contagens iguais entre origem e destino (menos `e2e-teste`); `/pesquisa/resultados` de produção (com `PESQUISA_RESULTS_PASSWORD` novo) mostra os mesmos totais. Nenhum `truncate`, reset ou `delete` em `survey_*` no staging.
6. Depois de validado, o humano decide quando o formulário público deixa de gravar no staging (as variáveis de produção já apontam para o novo projeto).

### 13. [O] Smoke tests em produção (só leitura e conta do próprio humano)

Depois das etapas 9 a 12 e antes de abrir ao público: `/` , `/escolas`, `/escolas/<inep de Cuiabá>`, `/entrar` (link mágico e Google), `/robots.txt` (ainda noindex), `/api/cron/leads-expire` sem `Authorization` responde 401/503 (não 200), `/v1/openapi.json`, `/pesquisa`. Login do admin e `/admin`. Nada de lead nem cobrança real neste passo, exceto o pagamento de teste mínimo do humano (etapa 4, Pix). Registrar resultado em `docs/superpowers/e2e/S20-producao.md`.

### 14. [H] Ligar o tráfego: indexamento e divulgação (D-075)

Só com o critério de pronto completo:
- Vercel > Environment Variables > Production: `SITE_INDEXING=1`; redeploy de produção. Sem isso o site continua `noindex`.
- Verificar: `curl -sI https://<domínio>/ | grep -i x-robots-tag` não retorna nada; `curl -s https://<domínio>/robots.txt` mostra `Allow` e o `Sitemap`; `/sitemap.xml` responde 200. Previews continuam `noindex`.
- Search Console: adicionar o domínio e enviar o sitemap (humano).

## Variáveis de ambiente (nomes; nunca valores)

Fonte: `.env.example`, `lib/env.ts`, `lib/env.public.ts` e busca por `process.env`/`Deno.env` no código (2026-09-28). Colunas: **Prod** = Vercel Production (projeto de produção), **Prev/Stg** = Vercel Preview e Development (Supabase de staging), **Fn** = segredo da Edge Function `ocr-worker`. "obrig." = o app quebra ou perde função central sem ela; "opc." = recurso aparece indisponível; "não" = nunca definir naquele ambiente; "auto" = a Vercel define.

| Variável | Prod | Prev/Stg | Fn | Observação |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | obrig. (projeto de produção) | obrig. (staging) | auto (`SUPABASE_URL`) | validada como URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | obrig. | obrig. | | chave `sb_publishable_` |
| `SUPABASE_SECRET_KEY` | obrig. | obrig. | auto | chave `sb_secret_`; só servidor |
| `NEXT_PUBLIC_SITE_URL` | obrig. (`https://<domínio>`) | opc. (a Vercel deriva de `VERCEL_URL`) | | canonical, OG, sitemap, links de login e do lead |
| `OPENROUTER_KEY` | obrig. | obrig. | obrig. | ausente derruba `getServerEnv()` |
| `AI_MODEL_CHEAP` | obrig. | obrig. | obrig. | nome de modelo só por ambiente |
| `AI_MODEL_STRONG` | obrig. | obrig. | obrig. | |
| `AI_MODEL_VISION` | opc. (sem ele, foto falha fechada) | opc. | opc. | modelo com entrada de imagem |
| `FAKE_AI_SCRIPT` | não | só local | não | provedor falso |
| `SENTRY_DSN` | opc. | opc. | | URL |
| `NEXT_PUBLIC_SENTRY_DSN` | derivada pelo `next.config.ts` | idem | | não cadastrar à mão |
| `SENTRY_AUTH_TOKEN` | opc. | opc. | | source maps |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | opc. (Push) | opc. | | par de produção diferente |
| `VAPID_PRIVATE_KEY` | opc. | opc. | | |
| `VAPID_SUBJECT` | opc. | opc. | | `mailto:` ou `https:` |
| `NOTIFICATIONS_DISPATCH_SECRET` | opc. (16+) | opc. | | despacho de notificações |
| `EMAIL_NOTIFICATIONS_ENABLED` | `0` até decidir | `0` | | só liga com `1` + chave + remetente |
| `EMAIL_API_KEY` | opc. | opc. | | |
| `EMAIL_FROM` | opc. | opc. | | |
| `MELI_AFFILIATE_ID` | opc. | opc. | | sem ele, links sem selo |
| `MELI_AFFILIATE_WORD` | opc. | opc. | | |
| `AMAZON_ASSOCIATE_TAG` | opc. | opc. | | |
| `DEMO_RETAILERS` | não | só preview/dev | | demonstração de varejistas |
| `DEMO_PIPELINE` | não | opc. (`1`) | opc. | derruba o boot se `1` em produção |
| `APP_ENV` | obrig. `production` | `preview` / `staging` | obrig. | `local|development|preview|staging|production` |
| `WORKER_SHARED_SECRET` | obrig. (16+) | obrig. | obrig. (mesmo valor) | também no Vault (`ocr_worker_secret`) |
| `DEMO_CLAIM_DELIVERY` | não | só local | | |
| `DEMO_SLOW_MS` | não | só teste | não | |
| `FAKE_PUBLICATION_FIXTURE` | não | só local | não | |
| `CRON_SECRET` | obrig. (16+) | obrig. | | Bearer dos crons da Vercel |
| `PAYMENTS_PIX_ENABLED` | `1` quando o PSP estiver pronto | vazio | | vazio = Pix indisponível |
| `PIX_API_BASE_URL` | com o PSP | | | URL |
| `PIX_OAUTH_TOKEN_URL` | com o PSP | | | URL |
| `PIX_CLIENT_ID` | com o PSP | | | |
| `PIX_CLIENT_SECRET` | com o PSP | | | |
| `PIX_CERT_PEM_BASE64` | com o PSP | | | mTLS, base64 numa linha |
| `PIX_KEY_PEM_BASE64` | com o PSP | | | |
| `PIX_RECEIVER_KEY` | com o PSP | | | chave Pix que recebe |
| `PIX_WEBHOOK_TOKEN` | com o PSP (16+) | | | vai no PATH do webhook; é credencial |
| `PIX_CHARGE_TTL_SECONDS` | com o PSP | | | ex. 3600 |
| `PESQUISA_RESULTS_PASSWORD` | obrig. (16+) para `/pesquisa` | obrig. | | novo em produção |
| `IP_HASH_SALT` | obrig. (16+) para `/pesquisa` | obrig. | | novo em produção |
| `SITE_INDEXING` | só na etapa 14 (`1`) | nunca | | D-075 |
| `B2B_API_KEY_PEPPER` | obrig. (32+) para a API `/v1` | obrig. | | diferente por ambiente |
| `B2B_WEBHOOK_ENCRYPTION_KEY` | obrig. (64 hex) para webhooks | obrig. | | diferente por ambiente |
| `WEBHOOKS_DISPATCH_SECRET` | opc. (cai no `CRON_SECRET`) | opc. | | |
| `B2B_CAMPAIGN_TRACKING_SECRET` | obrig. para rastreio de campanha B2B | obrig. | | lida em `features/campaigns/tracking-service.ts`; ausente da `.env.example` (lacuna a corrigir na S28/S19) |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | opc., S28 (ADR-007) | opc. (projeto de staging) | | projetos PostHog separados |
| `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL`, `NODE_ENV`, `NEXT_RUNTIME` | auto | auto | auto | não cadastrar |
| `TRACK`, `PORT`, `VAPID_ENV_FILE` | não | não | | só scripts locais |

Segredos no Vault do Supabase de produção (não são variáveis): `audit_ip_pepper`, `ocr_worker_url`, `ocr_worker_secret`.

## Ordem resumida e quem espera quem

1 (proteção) e 2 (projeto) e 4 (contas) são independentes e do humano. 3 e 7 dependem de 2. 6 depende de 2. 9 depende de 6 e 7. 10 e 11 dependem de 9. 12 depende de 9. 13 depende de 9 a 12. 5 depende de 10 (primeiro admin). 14 depende do critério de pronto e de 13.

## Rollback

- Migrations: cada arquivo é transacional; falha reverte só o arquivo. Reverter uma migration já aplicada exige script `down` e decisão do humano (só existe `supabase/rollback/0600_cross_track_fks.down.sql`); em produção, restaurar backup (Supabase Pro) antes de improvisar.
- Indexamento: remover `SITE_INDEXING` e redeploy volta a `noindex`.
- Crons e Pix: `PAYMENTS_PIX_ENABLED` vazio desliga cobrança Pix (Pap06 mostra indisponível).
