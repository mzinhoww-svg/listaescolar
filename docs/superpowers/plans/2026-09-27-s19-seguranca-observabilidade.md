# S19 · Segurança e observabilidade · Plano de implementação (fora de trilha, worktree T3, índice 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prompt do PLAN (§S19): "Rate limit em upload, OCR, login e leads. Headers de segurança e CSP estrita.
Sentry com escopo por perfil, sem dado pessoal. Alertas para fila morta e taxa de erro do provedor de IA."

**Aceite (tarefa):** nenhuma chave real no código; Sentry e alertas funcionam desligados sem variável; nenhuma
mudança de comportamento em fluxo já revisado além do necessário para segurança; migrations com
uuid/created_at/updated_at, RLS, SECURITY DEFINER com `search_path=''` e EXECUTE revogado de
public/anon/authenticated onde não for intencional; menores só apelido e série; nenhum dado pessoal em log,
métrica ou alerta.

## Passo 0 (pré-condição, feito antes deste plano)
- Branch `slice/S19-seguranca-observabilidade` já criada de `main` em `f90e236` (S00–S18 e S21–S27 dentro),
  worktree `listaescolar-wt/T3-comercio`, trilha 3 (`.track` = 3), Supabase local da trilha 3 no ar (porta 54622).
- Leitura de `CLAUDE.md`, `docs/superpowers/PROGRESS.md`, `docs/PLAN.md` §S19, `docs/superpowers/DEBT.md` (~31
  itens com dono S19).
- Levantamento do que já existe (não recriar):
  - `lib/rate-limit/memory-bucket.ts` (balde em memória por instância, já usado pelo widget S25 e pela API B2B
    S24) e `lib/net/client-ip.ts` (prioridade `x-vercel-forwarded-for` > `x-real-ip` > `x-forwarded-for`).
  - Sentry já tem o esqueleto desde a S00/S07: `sentry.server.config.ts`/`sentry.client.config.ts`
    (`dataCollection` com `userInfo`/`cookies`/`httpHeaders`/`httpBodies`/`urlQueryParams` todos desligados —
    SDK 11 substituiu `sendDefaultPii`), `instrumentation.ts`/`instrumentation-client.ts`, DSN opcional em
    `lib/env.ts` (`SENTRY_DSN`) e `next.config.ts` (`withSentryConfig` só quando há DSN). Falta: `beforeSend`
    (defesa em profundidade sobre o que a exceção/mensagem pode conter) e escopo por PAPEL (não por id pessoal).
  - `next.config.ts` só tem o `headers()` de `X-Robots-Tag` (`lib/robots-header.ts`); nenhum CSP, nenhum
    `middleware.ts` (não existe ainda).
  - `app/layout.tsx` usa `next/font/google` (Plus Jakarta Sans, pesos 500/600/700/800); `assets/fonts/` já tem
    `PlusJakartaSans-ExtraBold.ttf` (S27, só para a imagem OG) e `OFL.txt` (licença).
  - `features/leads/cron-auth.ts` (`isAuthorizedCron`, comparação em tempo constante, `CRON_SECRET_MIN_LENGTH`)
    é o padrão de autenticação de cron já usado por `app/api/cron/*`; reaproveitar para a nova rota de alertas.
  - `jobs.status` (0201) tem o valor `'dead'`; `ai_decisions.decision` (0202) tem o valor `'failed'`. Nenhuma
    tabela de "alerta" existe; a central de notificações (S11, 0602) tem `notifications` com `event_type` e
    `params` em lista fechada (CHECK) — precisa de um novo tipo de evento para o alerta chegar ao admin sem
    stack trace nem texto livre.
  - `public/widget.js` NÃO usa iframe (script que desenha DOM na página do parceiro e busca JSON via CORS
    `*`); `/api/widget/**` já define seus próprios cabeçalhos CORS/`no-store` por rota.

## Rulings de escopo (registrados aqui e no ledger antes de codar)

1. **Rate limit em upload/OCR/login/leads usa o mesmo balde em memória por instância já aceito nas S24/S25**
   (`lib/rate-limit/memory-bucket.ts`), documentado como PRIMEIRA camada — igual ao rate limit da API B2B e do
   widget. O limite de verdade entre instâncias/lambdas da Vercel é o Firewall, pendência humana já registrada
   em `PROGRESS.md`. Login/lead/envio de lista não têm custo de terceiro por requisição alta o bastante (e-mail
   do Supabase Auth já tem rate limit próprio; leitura por IA é custo real, mas por ora entra na mesma primeira
   camada, coerente com o resto do produto) para justificar um limitador no banco nesta fatia — se o tráfego real
   mostrar abuso caro, uma fatia futura troca por contador no Postgres (mesmo texto de Ruling já usado no D-148).
   Custo se errado: reforçar com contador no banco depois, sem mudar a assinatura pública das funções de guarda.
2. **CSP com nonce por requisição via `middleware.ts` (Next injeta o nonce nos próprios scripts internos quando
   o cabeçalho `Content-Security-Policy` contém `'nonce-...'`; padrão documentado do Next.js).** Único
   `<script>` próprio fora do bundle do Next é o JSON-LD de `app/escolas/[inep]/page.tsx`, que recebe o nonce via
   `headers()` explicitamente. `script-src` sem `'unsafe-inline'`. `/api/widget/**` e `/widget.js` ficam FORA do
   matcher do middleware (só entregam JSON/JS estático por CORS a terceiros, nunca HTML renderizado em iframe;
   ver levantamento acima — não há iframe real no produto hoje) para não colidir com os cabeçalhos CORS já
   definidos rota a rota; mantêm só o `X-Robots-Tag` do `next.config.ts`. `frame-ancestors` global: `'self'`.
   Custo se algum HTML precisar ser embutido por iframe no futuro (nenhum caso hoje): ajustar o matcher, sem
   tocar no restante do CSP.
3. **Hospedar Plus Jakarta Sans localmente (D-072) com UM arquivo variável (peso 500–800, subconjunto `latin`,
   mesmo subconjunto já usado por `next/font/google`), baixado uma vez do próprio Google Fonts (arquivo público,
   licença OFL já commitada) e trocado para `next/font/local`.** Evita a falha de build já registrada no D-072
   (PR #20) sem inventar pesos que a marca não usa.
4. **Sentry: `beforeSend` redator (defesa em profundidade, já que `dataCollection` desligado cobre a maior
   parte) remove e-mail/telefone por regex de `message`/`extra`/`breadcrumbs`, corpo de requisição, query string e
   cookies de qualquer evento residual; escopo por PAPEL (`role`, ex. `admin`/`parent`/`stationery_member`) via
   `Sentry.setTag("role", ...)` nunca `setUser` com id.** Sem `SENTRY_DSN`, tudo isso fica inerte (já garantido
   pelo `if (dsn)` existente).
5. **Alertas (fila morta + taxa de erro de IA) reaproveitam a central de notificações da S11 (`notifications`),
   com um `event_type` novo (`system_alert`) e `params` fechados (`alert_kind`, `alert_count` — nunca texto
   livre, nunca id de entidade/pessoa).** Uma função SECURITY DEFINER (`system_alert_notify`) grava uma
   notificação por profile `role = 'admin'`, deduplicada por dia (`event_key` inclui a data), chamada só pela
   nova rota `/api/cron/health-check` (mesmo padrão de segredo de `features/leads/cron-auth.ts`; sem
   `CRON_SECRET`, 503). Limiares: fila morta = qualquer `jobs.status = 'dead'` sem alerta hoje; taxa de erro de
   IA = proporção de `ai_decisions.decision = 'failed'` acima de 20% nas últimas 24 h (mínimo 5 decisões, para não
   alertar por amostra pequena) — nenhum dos dois numeros vem do produto (preço/prazo), são limiares de operação,
   registrados aqui e ajustáveis por Ruling futuro.
6. **Dívidas de banco desta fatia (D-093, D-094, D-096) — decisão por item, migration `0606` na faixa 06xx
   (próxima livre depois de `0605`):**
   - **D-093 (view `stationery_public` "SECURITY DEFINER"):** verificado o SQL (0302) — a view já seleciona
     SÓ colunas públicas (`id, slug, trade_name, municipality_id, neighborhood, offers_pickup, offers_delivery,
     service_radius_km, opening_hours, payment_methods, whatsapp, is_demo, updated_at`) de papelaria
     `status = 'active'`, sem nenhuma coluna de contato privado (email/telefone/CNPJ) nem de menor. Trocar para
     `security_invoker = true` quebraria a leitura pública (a tabela `stationeries` não tem policy nem grant
     para `anon`; é assim de propósito, comentário original da 0302: "view definer + sem grant algum de anon na
     base... RLS filtra linhas, não colunas"). A segunda alternativa que o próprio D-093 admite ("garantir que só
     expõe colunas públicas da papelaria ativa") já está satisfeita. **Resolvida por verificação, sem mudança de
     código** (Ruling; ver ledger).
   - **D-096 (`auth_role()`, `rls_auto_enable()`, `stationery_is_active(uuid)` SECURITY DEFINER executáveis por
     anon/authenticated):** `auth_role()` (0001) e `stationery_is_active(uuid)` (0302) são concedidas a
     `anon`/`authenticated` DE PROPÓSITO (comentário/uso: `auth_role()` roda dentro de policies RLS que precisam
     ser avaliadas com o papel de quem consulta; `stationery_is_active` gateia visibilidade pública sem expor a
     tabela toda) — nenhuma das duas devolve dado sensível (papel do próprio chamador; booleano de status).
     `rls_auto_enable()` é função DA PLATAFORMA Supabase (não existe em nenhuma migration deste repositório); não
     pode ser alterada por uma migration nossa, e mexer nela por SQL direto seria mexer no schema gerenciado do
     Supabase — fora do alcance de código versionado. **D-096 permanece `aberta`, rebaixada para "verificada,
     ação real pendente só em `rls_auto_enable()`"** — próxima ação é do humano/sessão com acesso ao Supabase
     Studio do projeto (`revoke execute on function rls_auto_enable() from anon;`), fora desta fatia porque não
     há como versionar uma função que não é nossa.
   - **D-094 (`pg_net` no schema `public`):** a extensão não é criada por NENHUMA migration deste repositório
     (foi instalada manualmente no staging pelo humano, ver `PROGRESS.md`); não existe localmente, então não há
     como testar a mudança aqui. A migration `0606` inclui um bloco condicional idempotente
     (`if exists (... pg_extension where extname = 'pg_net') then alter extension pg_net set schema
     extensions;`) que é NO-OP local (a extensão não existe) e só age quando aplicada num banco que já a tem —
     preparado para quando uma sessão futura aplicar via Supabase MCP. **Esta tarefa NÃO aplica nada no staging**
     (inviolável desta sessão); Ruling registrado no ledger com o comando pronto para a próxima sessão/humano.
7. **D-158 (7 módulos >250 linhas nascidos depois de D-057): dividir cada um em arquivo-irmão por
   responsabilidade, mesmo padrão da S18 (barrel fino, nenhum import de chamador muda), sem tocar em lógica.**
   Depois do split, cada um dos 7 (`features/billing/repository.ts`, `features/b2b/api/handler.ts`,
   `features/payouts/repository.ts`, `features/conversion/repository.ts`, `features/b2b/repository.ts`,
   `features/billing/service.ts`, `features/campaigns/repository.ts`) fica ≤ 250 linhas. Gate completo (inclui
   `pnpm test:db`) depois de cada grupo, para não arriscar reabrir revisão de segurança de cobrança/B2B sem uma
   rede de segurança de teste passando sem edição de asserção.
8. **Triagem das demais dívidas com dono S19 (D-001 já é a Task 1; D-003/D-004/D-005/D-008/D-009/D-024–026/D-056/
   D-078/D-081/D-085/D-086/D-089/D-113/D-123/D-125–127/D-135–139/D-144/D-149/D-155):** revisitadas uma a uma na
   Task 6, corrigidas quando o custo for baixo e o teste for objetivo (ex.: D-005 ganha registro no Sentry pela
   própria Task 3; D-009 é um ajuste de uma linha), ou mantidas `aberta` com Ruling de escopo (a maioria é de
   trilhas de cobrança/B2B/pipeline já revisadas por segurança dedicada — reabrir sem uma nova rodada de revisão
   é risco desproporcional ao ganho, mesmo raciocínio já usado pela S18 para D-158).

## Global Constraints
- TypeScript strict, sem `any`; Zod nas fronteiras já existentes.
- Server Components por padrão; `"use client"` só com interação.
- Nenhuma chave real no código; toda variável nova é opcional em `lib/env.ts` com o comportamento "desligado"
  documentado quando ausente.
- Nenhum dado pessoal (e-mail, telefone, nome, endereço) em log, métrica, alerta ou Sentry.
- Menores: só apelido e série (nada nesta fatia toca dado de menor; checagem de não regressão no E2E).
- Migrations: `uuid default gen_random_uuid()`, `created_at`/`updated_at`, RLS habilitada, SECURITY DEFINER com
  `search_path = ''`, EXECUTE revogado de `public`/`anon`/`authenticated` por padrão e concedido só onde
  intencional (com teste de `has_function_privilege`).
- Todo gate roda `pnpm db:reset` antes de `pnpm test:db`.
- `git merge origin/main` antes do relatório final; nenhum PR aberto (por instrução).

## Task 1: Rate limit (upload/OCR, login, leads) — D-001

- [ ] Step 1 (vermelho): testes para `clientIp` generalizado (aceitar qualquer objeto com `.get(name)`, cobrindo
  `Request.headers` e `ReadonlyHeaders` do `next/headers`) e para três novos guardas de rate limit
  (`features/auth/rate-limit.ts`, `features/leads/rate-limit.ts`, `features/submissions/rate-limit.ts`) que
  encapsulam `checkRateLimit` com janelas/limites documentados. Log vermelho em
  `docs/superpowers/logs/s19-task1-red.txt`.
- [ ] Step 2: implementar. `clientIp(headers)` generalizado (2 call sites ajustados: `features/widget/
  route-helpers.ts`, `features/b2b/api/handler.ts`). Guardas: login (`signInWithMagicLink`) por IP (5/10 min);
  criação de lead (`createLeadAction`) por IP+ator (10/10 min); envio de lista/OCR (`submitListAction`) por
  IP+ator (5/10 min). Mensagem de erro amigável nas 3 actions (sem detalhe do balde). Gate completo. Commit
  `feat(security): rate limit em login, leads e envio de lista (D-001, S19)`. Push.

## Task 2: Headers de segurança e CSP + fonte local (D-072)

- [ ] Step 1 (vermelho): `lib/security-headers.ts` (função pura, mesmo padrão de `lib/robots-header.ts`) com
  teste cobrindo cada cabeçalho esperado (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy,
  COOP, frame-ancestors) e `middleware.ts` com teste (nonce por requisição, CSP sem `unsafe-inline` em
  `script-src`, matcher exclui `/api/widget` e `/widget.js`). Log vermelho.
- [ ] Step 2: implementar `middleware.ts` + `lib/security-headers.ts`; `app/escolas/[inep]/page.tsx` lê o nonce
  (`headers().get("x-nonce")`) e aplica no `<script>` do JSON-LD. `next.config.ts` mantém só o `X-Robots-Tag`
  (CSP fica no middleware, por precisar de nonce por requisição). Gate completo + `pnpm build` (checar CSP real
  no HTML gerado). Commit `feat(security): CSP com nonce e cabeçalhos de segurança (S19)`. Push.
- [ ] Step 3: D-072 — baixar o arquivo variável (peso 500–800, subconjunto latin) do próprio Google Fonts para
  `assets/fonts/PlusJakartaSans-latin.woff2`; troca `app/layout.tsx` de `next/font/google` para `next/font/local`.
  `pnpm build` sem depender de rede. Commit `fix(fonts): hospedar Plus Jakarta Sans localmente (D-072, S19)`.
  Push.

## Task 3: Sentry sem PII e escopo por papel

- [ ] Step 1 (vermelho): `lib/observability/sentry-redact.ts` com função pura `redactEvent` testável (remove
  e-mail/telefone por regex de `message`/`exception.values[].value`/`extra`/`breadcrumbs`, apaga `request.data`/
  `request.query_string`/`request.cookies`/`request.headers`, mantém o resto). Teste com fixtures de evento
  contendo e-mail/telefone/cookie/query string. Log vermelho.
- [ ] Step 2: implementar; `sentry.server.config.ts`/`sentry.client.config.ts` chamam `beforeSend: redactEvent`.
  Escopo por papel: `lib/observability/scope.ts` com `setRoleScope(role)` (`Sentry.setTag("role", role)`, nunca
  `setUser`); chamado nos pontos de entrada por papel já existentes (`requireAccess`/`getSessionActor`, um único
  ponto central para não espalhar). D-005 (S02): erro do provedor de auth/exchange ganha
  `Sentry.captureException` (sem PII, já coberto pelo redator) nos catches de `features/auth/actions.ts` e
  `app/auth/callback/route.ts`/`app/auth/confirm/route.ts`. Gate completo. Commit `feat(observability): Sentry
  sem PII e escopo por papel (D-005, S19)`. Push.

## Task 4: Alertas — fila morta e taxa de erro de IA

- [ ] Step 1 (vermelho): migration `0607_system_alerts.sql` (depende da `0602`): novo valor `system_alert` em
  `notifications_event_type_valid`, novas chaves `alert_kind`/`alert_count` em `notification_params_valid`,
  função `public.system_alert_notify(p_kind text, p_count int, p_link text)` SECURITY DEFINER
  `search_path = ''`, EXECUTE só `service_role`. Teste em `tests/db/system-alerts.test.ts` (vermelho: função não
  existe). Log vermelho.
- [ ] Step 2: `features/health/dead-jobs.ts` e `features/health/ai-error-rate.ts` (consultas puras via
  `service_role`), `app/api/cron/health-check/route.ts` (segredo via `isAuthorizedCron`, mesmo contrato 503/401
  dos outros crons) que roda as duas consultas e chama `system_alert_notify` quando acima do limiar. Testes de
  unidade para os limiares (`tests/health/*.test.ts`) e de banco para a função/migration. Gate completo
  (`pnpm db:reset && pnpm test:db`). Commit `feat(observability): alerta de fila morta e taxa de erro de IA (S19)`.
  Push.

## Task 5: Dívidas de banco (D-093/D-094/D-096) e D-158 (módulos >250 linhas)

- [ ] Step 1: migration `0606_security_advisors.sql` — só o bloco condicional idempotente do `pg_net` (D-094;
  no-op local) + comentário `SQL` documentando a verificação de D-093/D-096 (sem mudança de schema para esses
  dois, ver Ruling). Teste em `tests/db/security-advisors.test.ts` confirmando que a migration não altera
  `stationery_public`/`auth_role`/`stationery_is_active` (grants intactos) e que roda sem erro sem `pg_net`
  instalado. `pnpm db:reset && pnpm test:db`. Commit `docs(security): migration 0606 e verificação de D-093/D-094/
  D-096 (S19)`. Push.
- [ ] Step 2: dividir os 7 módulos de D-158, um grupo por commit, gate completo (com `pnpm test:db`) a cada
  grupo, mesmo padrão de arquivo-irmão da S18:
  - `features/billing/repository.ts` + `features/billing/service.ts`
  - `features/b2b/api/handler.ts`
  - `features/b2b/repository.ts`
  - `features/payouts/repository.ts`
  - `features/conversion/repository.ts`
  - `features/campaigns/repository.ts`
  Commits `refactor(<domínio>): dividir <arquivo> (D-158, S19)`. Push a cada grupo.

## Task 6: Triagem das dívidas restantes com dono S19

- [ ] Step 1: revisar D-003/D-004/D-008/D-009/D-024/D-025/D-026/D-056/D-078/D-081/D-085/D-086/D-089/D-113/D-123/
  D-125/D-126/D-127/D-135/D-136/D-137/D-138/D-139/D-144/D-149/D-155 uma a uma; corrigir as de custo baixo e teste
  objetivo (candidatas: D-009 `CRON_SECRET_MIN_LENGTH` alinhado ao contrato 503, D-081 normalizar endpoint antes
  do CHECK); as demais recebem Ruling de adiamento explicando o motivo (a maioria pertence a trilhas de cobrança/
  B2B/pipeline já revisadas por segurança dedicada). Atualizar `DEBT.md` linha a linha. Sem gate próprio (segue
  para a Task 7 se houver código).
- [ ] Step 2 (só se a Step 1 tiver código): gate completo, commit `fix(debt): triagem de dívida de baixo custo
  (S19)`, push.

## Task 7: E2E e fechamento

- [ ] Step 1: `scripts/e2e-s19.sh` (build de produção local): cabeçalhos de segurança/CSP nas páginas principais
  (curl -I), 429 do rate limit (login/lead/envio repetidos), alerta gerado (cron de health-check com dado
  semeado de job morto/decisão falha), sem erro de console novo. Capturas em
  `docs/superpowers/e2e/screenshots/S19-*.png`. Doc `docs/superpowers/e2e/S19.md`.
- [ ] Step 2: `git merge origin/main` (mesclar o que avançou lá), resolver conflito se houver, gate completo de
  novo. `docs/superpowers/PROGRESS.md` (linha da S19), `docs/superpowers/DEBT.md` (dívida nova, se houver, a
  partir do maior ID + 1), `docs/superpowers/ledger.md` (seção "S19"). Relatório final em `.superpowers/sdd/
  2026-09-27-s19-seguranca-observabilidade/final-report.md`. Commit `docs: PROGRESS/DEBT/ledger após a S19`.
  `git push origin HEAD`. NÃO abrir PR.
