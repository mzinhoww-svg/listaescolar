# PROGRESS

**Atualizado em:** 2026-09-25, a partir de `git log origin/main` (HEAD `b905cce`), `gh pr list --state merged`, ledgers e relatórios `docs/superpowers/e2e/*.md`.

**Regra de manutenção:** atualizar este arquivo a cada merge (em PR `docs/` próprio ou junto do PR da fatia). Contagens só com fonte (PR ou relatório); sem fonte, `n/d`. Dívida técnica fica em `docs/superpowers/DEBT.md`, não aqui.

**Em andamento:** S10 (Pipeline; branch `slice/S10-revisao`, plano pronto, Task 1 em implementação no worktree T2). Depois: S11.

## Pesquisa com mães (fora do PLAN, ADR-005)

Fatia isolada fora da numeração S00–S27, autorizada pelo fundador em 25/09/2026 (sessão `claude/vigilant-einstein-75bp5d`, PR #28 reaproveitado). Spec vinculante em `docs/superpowers/specs/2026-09-25-pesquisa-maes-design.md`; decisão de escopo e autorizações em `docs/decisions/ADR-005-pesquisa-maes-fora-do-plan.md`. Plano em `docs/superpowers/plans/2026-09-25-pesquisa-maes.md`. Estado: **no ar em produção** — merge squash `16d76c8` em `main` pelo PR #28 em 2026-09-25 (autorizado por escrito pelo fundador no ADR-005, condições cumpridas: CI verde em `f4fd3e5`, três revisões independentes registradas no ledger, 7 cenários E2E verdes no preview, nada fora do escopo). URL: `https://listaescolare.vercel.app/pesquisa`.

- Entregue: `/pesquisa` (12 telas + boas-vindas + final com lead e compartilhamento), `/pesquisa/resultados` (senha, cartões, funil, por pergunta, por origem, frases, CSV), `/pesquisa/privacidade`, `app/api/pesquisa/{resposta,concluir,lead,login,export}`.
- Migrations aditivas `0700_pesquisa_maes.sql` e `0701_pesquisa_maes_ajustes.sql` aplicadas no ListaEscolar (staging = único projeto; ver tabela de migrations). Tabelas `survey_*` nunca entram em reset/truncate de nenhuma fatia (ADR-005).
- Variáveis `PESQUISA_RESULTS_PASSWORD` e `IP_HASH_SALT` cadastradas na Vercel (Production/Preview/Development); valores fora do repositório.
- Gate: typecheck ✓, lint ✓, `pnpm test` 2604 no PR (106 da pesquisa; 2801 na árvore mesclada com a S11), build ✓, CI `verify` ✓ `db` ✓, 7 cenários E2E no preview (`docs/superpowers/e2e/pesquisa-maes.md`; 25 capturas 390×844 + 4 de desktop 1280×800 em `docs/superpowers/evidencias/pesquisa/`), revisão independente por subagente em três rodadas (implementação, polimento visual, rodada `/impeccable` + achados) registrada no ledger. Passe de design com `/impeccable` (detector 0 achados) descrito no relatório E2E, seção "Rodada 2".
- Pós-merge (feito em 2026-09-25, 23:12–23:59 UTC): cenários 1–6 repetidos em produção (26/26 asserções, capturas em `evidencias/pesquisa/prod/`), export CSV conferido por HTTP puro (BOM, 401 sem cookie); 10 linhas `e2e-teste` apagadas (leads em cascata), contagem `e2e-teste` = 0; a 1ª resposta real já estava no banco e não foi tocada. Kit de divulgação em `docs/superpowers/pesquisa-divulgacao.md`. Detalhes na seção "Produção (pós-merge)" de `docs/superpowers/e2e/pesquisa-maes.md`.
- Pendência futura (S20, ADR-005): migrar os dados `survey_*` para o projeto de produção quando ele existir; até lá, backup semanal por CSV pela página de resultados.

## Concluídas (merge squash em `main`)

Legenda do gate: `unit` = `pnpm test` (Vitest); `db` = `pnpm test:db`; `CI` = jobs `verify` e `db` do GitHub Actions; `Vercel` = status do deploy de preview; `E2E` = roteiro agent-browser (build de produção local até 2026-09-25; a partir do primeiro deploy verde com previews públicos, no preview da Vercel; ver Ruling do ledger). ✓ = verde declarado no PR; ✗ = falhou; `n/d` = sem dado no PR nem no relatório.

| Fatia | PR | SHA | Data (UTC) | typecheck | lint | unit | db | build | CI | Vercel | E2E |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Docs (autonomia, ADR-003) | #1 | a952c0b | 2026-09-24 | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/a |
| S00 Fundação | #2 | a400899 | 2026-09-24 | n/d | ✓ | 15 | n/a | n/d | verify ✓ | ✓ | preview protegido; roteiro em `e2e/S00.md` não executado no preview |
| S01 Schema base | #3 | e14ba7f | 2026-09-25 | n/d | ✓ | ✓ (n/d) | 88 | n/d | verify ✓ db ✓ | ✓ | sem UI; verificação no staging (`e2e/S01.md`) |
| S02 Auth | #4 | 28b50e3 | 2026-09-25 | n/d | ✓ | 126 (PR; o PROGRESS anterior dizia 144) | 95 | n/d | verify ✓ db ✓ | ✗ | build local, passos a–l (`e2e/S02.md`) |
| chore trilhas (ADR-004) | #5 | 5a2fffc | 2026-09-25 | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/a |
| chore deps trilhas | #6 | 056daad | 2026-09-25 | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/a |
| ci job db | #7 | d03822d | 2026-09-25 | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/a |
| S12 Carrinho (Comércio) | #8 | c632687 | 2026-09-25 | ✓ | ✓ | 266 | 187 | n/d | verify ✓ db ✓ | ✗ | build local, 23 passos (`e2e/S12.md`) |
| S03 Importação INEP (Dados) | #9 | fae284d | 2026-09-25 | ✓ | ✓ | 244 | 178 | n/d | verify ✓ db ✓ | ✗ | build local, 17 passos, upload de 3,9 MB (`e2e/S03.md`) |
| S07 Upload e OCR (Pipeline) | #10 | 3ccefb4 | 2026-09-25 | ✓ | ✓ | 527 | 188 (+ Edge Function Deno 3/3) | n/d | verify ✓ db ✓ | ✗ | build local, 43 verificações, 0 falhas (`e2e/S07.md`) |
| S04 Busca e perfil (Dados) | #11 | 6e15af0 | 2026-09-25 | ✓ | ✓ | 479 | 312 | n/d | verify ✓ db ✓ | ✗ | build local, 17 passos (`e2e/S04.md`) |
| S13 Papelarias (Comércio) | #12 | 6bf537a | 2026-09-25 | ✓ | ✓ | 661 | 313 | n/d | verify ✓ db ✓ | ✗ | build local, 18 passos (`e2e/S13.md`) |
| S05 Listas e versões (Dados) | #13 | bf2d24f | 2026-09-25 | ✓ | ✓ | 1253 | 611 | n/d | verify ✓ db ✓ | ✗ | build local, 10 passos (`e2e/S05.md`) |
| S08 IA: adapters e roteador (Pipeline) | #14 | 5eb7adb | 2026-09-25 | ✓ | ✓ | 1419 | ✓ (n/d) | ✓ | verify ✓ db ✓ | ✗ | build local, provedor falso, 18 verificações, 0 falhas (`e2e/S08.md`) |
| S14 Leads e WhatsApp (Comércio) | #15 | 639b93e | 2026-09-25 | ✓ | ✓ | 1632 | 949 | ✓ | verify ✓ db ✓ | ✗ | build local, 80 verificações, 0 falhas (`e2e/S14.md`) |
| S06 Reivindicação (Dados) | #16 | 789a8de | 2026-09-25 | ✓ | ✓ | 1869 | 1057 | ✓ | verify ✓ db ✓ | ✗ | build local, fase 1: 58 asserções; fase 2: 21; 0 falhas (`e2e/S06.md`) |
| chore soft-404 | #17 | 06f988a | 2026-09-25 | ✓ | ✓ | 1869 | n/a (sem banco) | ✓ | verify ✓ db ✓ | ✗ | curl: 404/307 reais (`e2e/soft-404.md`, `scripts/e2e-soft-404.sh`) |
| docs PROGRESS/DEBT e agendamento da refatoração | #18 | 7f68737 | 2026-09-25 | n/a | n/a | n/a | n/a | n/a | n/d | n/d | n/a (só docs) |
| S27 Site público e páginas de sistema (Comércio) | #19 | 8cbd458 | 2026-09-25 | ✓ | ✓ | 2073 | n/a (sem migration) | ✓ | verify ✓ db ✓ (neste PR) | n/d | build local, 265 verificações, 0 falhas (`e2e/S27.md`) |
| S09 Motor de aprovação automática (Pipeline) | #20 | b905cce | 2026-09-25 | ✓ | ✓ | 2279 (árvore mesclada) | 1312 (3 skipped) | ✓ | verify ✓ db ✓ (neste PR) | n/d | build local, 61 verificações, 0 falhas (`e2e/S09.md`) |
| Pesquisa com mães (ADR-005, fora do PLAN) | #28 | 16d76c8 | 2026-09-25 | ✓ | ✓ | 2604 (2801 na árvore mesclada com S11) | n/a (sem Docker nesta sessão; CI `db` ✓) | ✓ | verify ✓ db ✓ | ✓ (preview público) | 7 cenários no preview da Vercel, 25 capturas mobile + 4 desktop; repetida em produção (cenários 1–6, 26/26, `evidencias/pesquisa/prod/`) (`e2e/pesquisa-maes.md`) |

| chore previews públicos + noindex (D-049, D-058, D-074) | #22 | d735874 | 2026-09-25 | ✓ | ✓ | ✓ | n/a | ✓ | verify ✓ db ✓ | ✓ (primeiro preview READY) | n/a (curl: 200 + X-Robots-Tag noindex) |
| S10 Revisão humana e revisão do pai (Pipeline) | #23 | 02dfe00 | 2026-09-25 | ✓ | ✓ | 2494 | 1375 (3 skipped) | ✓ | verify ✓ db ✓ | ✓ | build local, 124 verificações, 0 falhas (`e2e/S10.md`) |
| chore indexamento só com SITE_INDEXING=1 + operações no staging | #24 | 4e1b27e | 2026-09-25 | ✓ | ✓ | ✓ | n/a | ✓ | verify ✓ db ✓ | ✓ | n/a |
| docs ocr-worker no staging (D-060) | #25 | — | 2026-09-25 | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ | n/a (só docs) |
| chore worker ativo + fila "Aguardando humano" (CLAUDE.md) | #26 | — | 2026-09-25 | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ | n/a (só docs) |
| docs E2E no staging: OPENROUTER_KEY recusada (D-077) | #27 | — | 2026-09-25 | n/a | n/a | n/a | n/a | n/a | ✓ | ✓ | n/a (só docs) |
| S11 Integração das trilhas e notificações | #29 | 05160d5 | 2026-09-25 | ✓ | ✓ | 2691 | 1492 (3 skipped) | ✓ | verify ✓ db ✓ | ✓ | build local, portas REAIS, IA falsa, worker Deno: 57 verificações, 0 falhas (`e2e/S11.md`); no staging: login por link mágico e envio OK, leitura por IA bloqueada por OPENROUTER_KEY (D-077) |

Observação: o check "Vercel" falhou em todos os PRs do #4 ao #20 por falta das variáveis `NEXT_PUBLIC_SUPABASE_*` no projeto `listaescolare`; o humano as criou em 2026-09-25 e desde o #22 os previews ficam READY e públicos (noindex). O E2E passa a rodar no preview quando o deploy estiver verde (Ruling do ledger); a S11 ainda rodou local porque a leitura por IA no staging está bloqueada (D-077).

## Migrations

18 aplicadas no staging (ref `hojbnqkwzsicahzgshne`, ADR-003), via Supabase MCP. O histórico remoto usa versões por timestamp com nomes próprios (Ruling do ledger); versões remotas conferidas via `list_migrations` do MCP em 2026-09-25; reconciliar de novo antes da S20.

| Arquivo | Fatia | Nome no MCP | Versão remota |
|---|---|---|---|
| 0001_base_schema.sql | S01 | base_schema | 20260925003453 |
| 0002_profile_on_signup.sql | S02 | profile_on_signup | 20260925012319 |
| 0101_schools_and_imports.sql | S03 | schools_and_imports | 20260925043904 |
| 0102_school_search.sql | S04 | school_search | 20260925052004 |
| 0103_lists_and_versions.sql | S05 | lists_and_versions | 20260925061744 |
| 0104_claims.sql | S06 | claims | 20260925132606 |
| 0201_submissions_and_jobs.sql | S07 | submissions_and_jobs | 20260925053528 |
| 0202_ai_registry_settings_decisions.sql | S08 | ai_registry_settings_decisions | 20260925120948 |
| 0301_cart_retailers_affiliates.sql | S12 | cart_retailers_affiliates | 20260925041851 |
| 0302_stationeries.sql | S13 | stationeries | 20260925060339 |
| 0303_leads.sql | S14 | leads | 20260925131816 |
| 0203_publication_decisions.sql | S09 | publication_decisions | 20260925161635 (aplicada em uma única chamada transacional, com conferências antes e depois) |
| 0700_pesquisa_maes.sql | Pesquisa com mães (ADR-005) | pesquisa_maes | aplicada 2026-09-25 via MCP `apply_migration` (aditiva: `survey_responses`, `survey_leads`, RLS sem policy, função `survey_upsert_answer`) |
| 0701_pesquisa_maes_ajustes.sql | Pesquisa com mães (ADR-005) | pesquisa_maes_ajustes | aplicada 2026-09-25 via MCP (aditiva: `created_at`/`updated_at` faltantes, função recriada com `search_path = ''`) |

| 0204_human_review.sql | S10 | human_review | 20260925181909 |
| 0600_cross_track_fks.sql | S11 | cross_track_fks | aplicada em 2026-09-25 após `checks/0600_orphans.sql` = 0 órfãos (versão remota: conferir com `list_migrations`) |
| 0601_integration.sql | S11 | integration | aplicada em 2026-09-25 (perfil `system` criado; `auth.users` do hospedado conferido antes) |
| 0602_notifications.sql | S11 | notifications | aplicada em 2026-09-25 (advisors conferidos: 7 tabelas com RLS; ver D-094–D-096) |

Pendente de staging: nenhuma. As tabelas `survey_*` vêm das migrations 0700/0701 do PR #28 ("Pesquisa com mães", ADR-005, fora do PLAN, mesclado em 2026-09-25 pelo orquestrador sob autorização escrita do fundador, ADR-005 — ver ledger); os advisors apontam RLS sem policy nelas (só service_role) — conferir na revisão de segurança da S19.

Produção: nenhuma migration (o projeto não existe).

## Trilhas

| Trilha | Fatias | Estado |
|---|---|---|
| Dados | S03, S04, S05, S06 | **Completa** (S03–S06) |
| Pipeline | S07, S08, S09, S10 | **Completa** (S07–S10) |
| Integração | S11 | **Completa** (portas reais ligadas; `auto_publish_enabled` continua DESLIGADO por dado até o humano ligar no staging) |
| Comércio | S12, S13, S14, S27 | **Completa** (S12–S14 e S27) |

## Próximos passos (ordem do PLAN)

1. S10 e S11 concluídas. Ligar `ai_settings.auto_publish_enabled` no staging só depois de a leitura por IA funcionar lá (D-077) e de um E2E no preview.
2. Consolidar os ledgers de trilha em `ledger.md` (D-048) na S18.
3. Em paralelo: [S21, S22, S23] ∥ [S24, S25, S26].
4. S15, S16.
5. S17, S18, S19 (a S19 também hospeda a fonte localmente, D-072). A S18 inclui a refatoração dos arquivos acima de 250 linhas (`DEBT.md`).
6. S20: **parar para confirmação humana antes de qualquer ação em produção.** O go-live exige `DEBT.md` sem item de severidade alta aberto, ou com Ruling explícito.

## Pendências humanas (consolidadas)

Ambiente e deploy:
- Vercel: variáveis criadas pelo humano no projeto `listaescolare` em 2026-09-25 (D-058 resolvida); conferir `OPENROUTER_KEY` e `AI_MODEL_*` lá (o primeiro `provider_timeout` do E2E no staging pode vir da leitura inline do app, D-077).
- Vercel: a proteção dos previews foi DESATIVADA pelo humano em 2026-09-25 (previews públicos; `X-Robots-Tag: noindex` em tudo fora da produção). REATIVAR antes de entrar dado real: checklist da S20 (D-074).
- Vercel: `CRON_SECRET` (16 caracteres ou mais) nos ambientes e aceite do cron diário `/api/cron/leads-expire` no plano da conta (S14).
- Vercel: `NEXT_PUBLIC_SITE_URL` com o domínio próprio nos ambientes sem `VERCEL_PROJECT_PRODUCTION_URL` (domínio; canonical, JSON-LD, links de login e do lead, OG, sitemap e QR dependem dele).
- Supabase (staging): FEITO em 2026-09-25: `pg_cron`/`pg_net`, segredos no Vault, Edge Function `ocr-worker` (v1, `verify_jwt=false`) e job `ocr-worker-tick` ATIVO (a cada minuto). Tick de teste: 200 `status: ok` (D-060 resolvida). Teste ponta a ponta no preview feito em 2026-09-25: login e envio OK; leitura por IA bloqueada por `OPENROUTER_KEY` recusada na função (D-077, ver "Aguardando humano").
- Rodar `scripts/ai-smoke.ts` com chave e modelos reais (tem custo; os agentes não rodam).
- Supabase Auth hospedado: FEITO pelo humano em 2026-09-25 (Site URL, Redirect URLs incl. `https://listaescolare-*.vercel.app/**`, templates `magic_link` e `confirmation`); falta validar o link mágico em outro navegador no preview e SMTP próprio antes de produção (D-063). Referência do que foi configurado: Site URL e Redirect URLs (`/auth/confirm**`, `/auth/callback**`, glob dos previews); templates `magic_link` e `confirmation` com `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (modelo em `supabase/templates/`); SMTP próprio. Sem os templates o link mágico só funciona no mesmo navegador.
- Google OAuth: criar credenciais no console Google e ativar o provider no Supabase.
- Pepper do IP de auditoria: FEITO na 0601 (`audit_row_change` lê o Vault quando o GUC não existe; D-059 resolvida); na produção, gerar outro segredo `audit_ip_pepper` no Vault.
- Projeto Supabase de produção: só o humano cria (necessário na S20).

Credenciais e contas:
- Provedor real de e-mail (S11) e credencial de WhatsApp (tokens de reivindicação da S06 e notificações).
- Afiliados: `MELI_AFFILIATE_ID` (confirmar o formato do link do programa, `matt_tool`/`matt_word`) e `AMAZON_ASSOCIATE_TAG`. Sem eles os links saem sem selo.
- Pix (cobrança, S21/S23); VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) de staging e de produção (Web Push, S11; sem elas o canal aparece "indisponível"); `NOTIFICATIONS_DISPATCH_SECRET` na Vercel e pg_cron de 1 min do despachante (`/api/notifications/dispatch`) se o cron diário da Vercel não bastar; chave de produção do OpenRouter.

Conteúdo e dados:
- CSV oficial do INEP (importação na S20, com a contagem real registrada).
- Textos jurídicos finais: razão social, CNPJ, DPO/contato, prazos de retenção (reivindicação, auditoria) (páginas de termos e privacidade da S27 e S17 usam placeholders).
- Promessa "Famílias e escolas não pagam" (texto do site público da S27): promessa de preço a validar com o modelo de preço antes de publicar.

## Notas operacionais
- Ferramentas: Colima + Docker, Supabase CLI e agent-browser instalados. Worktrees em `../listaescolar-wt/` (T1-dados, T3-comercio etc.); cada trilha tem workdir e portas próprios (`scripts/supa.mjs`, arquivo `.track`).
- Next 16 reescreve um bloco em CLAUDE.md: rode `git checkout CLAUDE.md` antes de commitar.
- Após mudar `supabase/config.toml` (auth), rode `pnpm db:stop && pnpm db:start`; `db:reset` sozinho não recarrega o auth.
- Banco local: `pnpm db:start`, `pnpm db:reset`, `pnpm test:db` (só banco local; o helper recusa host remoto).
- Staging: advisor aceito com `auth_role()` executável por anon, `rls_auto_enable()` (função da plataforma) e a view definer `stationery_public` (S13, esperado).
- Encerrar só o servidor aberto pela própria sessão (`kill "$(lsof -ti tcp:<porta> -sTCP:LISTEN)"`); nunca `pkill`.
- Subagentes: nunca despachar dois na mesma rodada no mesmo worktree.

## Política de uso (definida pelo humano em 2026-09-25, limite semanal em 79%)
- Sonnet nos implementadores e nas revisões comuns; Opus só nas revisões de segurança (RLS, cobrança, B2B e dados de menor).
- Juntar correções pequenas numa única rodada.
- Se o limite estiver perto do fim: registrar o estado neste arquivo e parar num ponto limpo, com push feito.
- Bloqueio conhecido: o classificador impede o orquestrador de copiar credencial de arquivo local para sistema remoto e de mesclar PR revisado só por subagente ("Self-Approval"): esses itens vão para "Aguardando humano" (regra permanente no CLAUDE.md, seção Autonomia).


## Aguardando humano
Fila de ações que o classificador barrou ou que só o humano pode fazer. O orquestrador registra aqui, deixa o PR/estado pronto e segue para a próxima tarefa; o humano resolve a fila quando passar por aqui. Remover o item ao resolver.

- **OPENROUTER_KEY da Edge Function `ocr-worker` (staging) recusada pelo OpenRouter (401).** E2E de 2026-09-25 no alias `listaescolare.vercel.app`: login e envio passaram; o worker (cron, 200) chamou o provedor e recebeu `http_401` (envio `rejected`, job `dead`, 2 linhas `failed` em `ai_decisions`). Ação do humano: no painel do Supabase (Edge Functions > Secrets) conferir/regravar `OPENROUTER_KEY` com uma chave válida e conferir `AI_MODEL_CHEAP/STRONG/VISION` (o modelo usado foi um de texto, `deepseek/deepseek-chat`, sobre um PDF). Depois disso o orquestrador reenvia o teste (nenhuma ação do humano além do secret). Também conferir a `OPENROUTER_KEY` no projeto Vercel `listaescolare` (a primeira decisão foi um `provider_timeout` de 9 s, provavelmente da leitura inline do app).
