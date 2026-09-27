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
| S21 Cobrança da papelaria (Comércio) | #34 | b7c6229 | 2026-09-26 | ✓ | ✓ | 2959 | 1539 (3 skipped) | ✓ | verify ✓ db ✓ | ✓ | build local, 17 verificações, 0 falhas (`e2e/S21.md`) |
| S22 Atribuição, conversão e contestação (Comércio) | #36 | 0ee3771 | 2026-09-26 | ✓ | ✓ | 2971 | 1567 (3 skipped) | ✓ | verify ✓ db ✓ | ✓ | build local, 21 verificações, 0 falhas (`e2e/S22.md`) |
| S24 Portal B2B: cadastro, chaves e API v1 | #38 | d6f5288 | 2026-09-27 | ✓ | ✓ | 3228 | 1677 (3 skipped) | ✓ | verify ✓ db ✓ | ✓ | build local, 41 verificações, 0 falhas (`e2e/S24.md`) |
| S23 Comissão, repasses e inadimplência (Comércio) | #40 | d30849f | 2026-09-27 | ✓ | ✓ | 3252 | 1729 (3 skipped) | ✓ | verify ✓ db ✓ | ✓ | build local, 30 verificações, 0 falhas (`e2e/S23.md`) |
| S25 Widget e webhooks (B2B) | #42 | 634c9f2 | 2026-09-27 | ✓ | ✓ | 3303 | 1759 (3 skipped) | ✓ | verify ✓ db ✓ (concluídos depois do merge; ver Ruling) | ✓ | build local + receptor de webhook, 22 verificações, 0 falhas (`e2e/S25.md`) |
| S26 Campanhas de marca, insights e faturamento B2B | — (sem PR, por instrução) | 55fde47 | 2026-09-27 | ✓ | ✓ | 3336 | 1769 (3 skipped) | ✓ | n/d (não enviado por PR) | n/d | build local, 17 verificações, 0 falhas (`e2e/S26.md`) |
| S22 Atribuição, conversão e contestação (Comércio) | — (sem PR, por instrução) | d774ba2 | 2026-09-26 | ✓ | ✓ | 2971 | 1558 (3 skipped) | ✓ | n/d (não enviado por PR) | n/d | build local, 21 verificações, 0 falhas (`e2e/S22.md`) |
| S22 · correções da revisão de segurança (Opus) | — (sem PR, por instrução) | bf36686 | 2026-09-26 | ✓ | ✓ | 2971 | 1567 (3 skipped) | ✓ | n/d | n/d | build local, 21 verificações repetidas, 0 falhas; migration 0402 editada no lugar (D-103–D-107, ver ledger-comercio) |

Observação: o check "Vercel" falhou em todos os PRs do #4 ao #20 por falta das variáveis `NEXT_PUBLIC_SUPABASE_*` no projeto `listaescolare`; o humano as criou em 2026-09-25 e desde o #22 os previews ficam READY e públicos (noindex). O E2E passa a rodar no preview quando o deploy estiver verde (Ruling do ledger); a S11 ainda rodou local porque a leitura por IA no staging está bloqueada (D-077).

## Migrations

23 aplicadas no staging (ref `hojbnqkwzsicahzgshne`, ADR-003), via Supabase MCP. O histórico remoto usa versões por timestamp com nomes próprios (Ruling do ledger); versões remotas conferidas via `list_migrations` do MCP em 2026-09-25; reconciliar de novo antes da S20.

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
| 0401_billing.sql | S21 | billing | 20260926232215 (uma chamada transacional; fidelidade conferida contra o banco local: md5 das 23 funções, RLS das 8 tabelas, 22 gatilhos e privilégios idênticos; SEM plano publicado: staging em `billing_unavailable` até decisão) |
| 0402_lead_conversions.sql | S22 | lead_conversions | 20260927010517 (uma chamada transacional; md5 das 10 funções, RLS, gatilhos e privilégios idênticos ao banco local; sem advisor novo) |
| 0501_b2b_partners_api.sql | S24 | b2b_partners_api | 20260927022020 (uma chamada transacional; md5 das 27 funções, RLS das 6 tabelas, gatilhos e privilégios idênticos ao banco local; sem parceiro nem chave criados) |
| 0403_repasses.sql | S23 | repasses | 20260927044636 (uma chamada transacional; substitui 4 funções da 0401/0402 com md5 anterior registrado; 22 funções, RLS das 7 tabelas, 13 gatilhos e privilégios idênticos ao banco local; auditoria de `school_payout_settings` sem `pix_key`/`beneficiary_name`; sem configuração de comissão/repasse inserida) |
| 0502_b2b_widget_webhooks.sql | S25 | b2b_widget_webhooks | 20260927081313 (uma chamada transacional após uma tentativa derrubada pela rede sem efeito; 7 funções reaplicadas porque comentários internos tinham sido removidos na transcrição; depois disso md5 das 18 funções, RLS, gatilhos e privilégios idênticos ao banco local) |
| 0503_b2b_campaigns.sql | S26 | — | **ainda não aplicada** (ver "Pendente de staging" abaixo) |

| 0204_human_review.sql | S10 | human_review | 20260925181909 |
| 0600_cross_track_fks.sql | S11 | cross_track_fks | aplicada em 2026-09-25 após `checks/0600_orphans.sql` = 0 órfãos (versão remota: conferir com `list_migrations`) |
| 0601_integration.sql | S11 | integration | aplicada em 2026-09-25 (perfil `system` criado; `auth.users` do hospedado conferido antes) |
| 0602_notifications.sql | S11 | notifications | aplicada em 2026-09-25 (advisors conferidos: 7 tabelas com RLS; ver D-094–D-096) |

Pendente de staging: `0403_repasses.sql` (S23 — comissão, repasse e inadimplência; aditiva sobre 0401/0402, que já
estão no staging), ainda só local (`pnpm db:reset` verde nesta sessão, inclusive depois da rodada de correções da
revisão de segurança — ver abaixo); não aplicada porque a tarefa da S23 marcou staging/Vercel como invioláveis para
este implementador. Aplicar via Supabase MCP na sequência normal antes ou durante a próxima sessão que tiver
mandato para tocar o staging. As tabelas `survey_*` vêm das migrations 0700/0701
do PR #28 ("Pesquisa com mães", ADR-005, fora do PLAN, mesclado em 2026-09-25 pelo orquestrador sob autorização
escrita do fundador, ADR-005 — ver ledger); os advisors apontam RLS sem policy nelas (só service_role) — conferir
na revisão de segurança da S19.

Pendente de staging: `0502_b2b_widget_webhooks.sql` (S25 — widget embutível e webhooks assinados: `b2b_widget_configs`, `b2b_webhook_endpoints`/`_deliveries`/`_delivery_attempts`, gatilhos sobre `list_status_events`/`claims` já existentes), só local (`pnpm db:reset` + `pnpm test:db` verdes: 1699/1702, 3 pulados = baseline); não aplicada porque a tarefa da S25 marcou staging/Vercel como invioláveis para este implementador. `0501_b2b_partners_api.sql` (S24) já está no staging (linha acima, aplicada em `main` #38); `0502` depende dela (mesma faixa 05xx) e pode ser aplicada na sequência normal.

Pendente de staging: `0503_b2b_campaigns.sql` (S26 — campanhas de marca CPM/CPC, insights com k-anonimato e
faturamento B2B: `b2b_campaigns`, `b2b_campaign_events`/`_ledger` imutáveis, `b2b_insights_settings`,
`b2b_statements`/`_line_items` imutáveis), só local (`pnpm db:reset` + `pnpm test:db` verdes: 1769/1772, 3 pulados
= baseline); não aplicada porque a tarefa da S26 marcou staging/Vercel como invioláveis para este implementador.
Depende de `0501`/`0502` (S24/S25, já no staging) e de `0103` (S05, lists/items) — sem FK nova para a faixa 04xx
(Cobrança). Aplicar via Supabase MCP na sequência normal.

Produção: nenhuma migration (o projeto não existe).

## Trilhas

| Trilha | Fatias | Estado |
|---|---|---|
| Dados | S03, S04, S05, S06 | **Completa** (S03–S06) |
| Pipeline | S07, S08, S09, S10 | **Completa** (S07–S10) |
| Integração | S11 | **Completa** (portas reais ligadas; `auto_publish_enabled` continua DESLIGADO por dado até o humano ligar no staging) |
| Comércio | S12, S13, S14, S27, S21, S22 | **Completa** (S12–S14, S27, S21 e S22, mescladas em `main` nos PRs #34 e #36). **S23 concluída, com rodada de correções da revisão de segurança (Opus) já aplicada** (branch `slice/S23-repasses`, worktree T3, criada de `main` em `0ee3771` com S21/S22 dentro: migration `0403_repasses.sql` (aditiva sobre 0401/0402, já no staging), `features/payouts/**`, telas Admin13-Repasses, Admin14-Inadimplência, Pap07-Desempenho e "Pix pela plataforma" em Pap03; fecha D-099–D-101, D-103, D-105, D-107–D-111; abre D-120–D-122 (baixa/média, renumeradas por colisão com os IDs da S24). Revisão sobre `a51b62b` achou 2 bloqueantes (EXECUTE aberto a anon/authenticated em 8 funções novas; `audit_log` guardando `pix_key`/`beneficiary_name`) e 4 importantes (régua de inadimplência contando recarga de crédito; sinal Pix contável só pela própria declaração; conluio papelaria+escola gerando repasse sem revisão; falta de `payout_reverse_entry`), todos corrigidos nesta mesma migration editada no lugar (ver ledger-comercio, seção "S23 · correções da revisão de segurança") — gate completo verde (1721 testes de banco, 3252 unitários) e E2E local refeito 26/26 (`e2e/S23.md`) — **sem PR aberto, por instrução da tarefa**; falta revisão da correção e merge; migration `0403` ainda só local, não aplicada em staging) |

## Ponto de retomada (2026-09-26, após reinício da máquina)

A máquina reiniciou e interrompeu os implementadores da S21 e da S24. Estado conferido contra o GitHub antes de retomar:

| Fatia | Worktree | Branch | Último commit no GitHub | Situação |
|---|---|---|---|---|
| S21 Cobrança | `T3-comercio` | `slice/S21-cobranca` | Tasks 1–3 concluídas (retomada 2026-09-26): Task 1 `4ec6fae` já estava no GitHub; Task 2 (`features/billing/*`, `PaymentProvider`, webhook Pix, cron de conciliação, integração com a S14) e Task 3 (Pap06, Admin10, integração com Pap01/Pap02/admin, E2E) reescritas do zero com TDD (o WIP descartado ficou só na branch local `backup/descartado-reinicio-slice-S21-cobranca`, não usado como base) | Gate completo verde (typecheck, lint, 2832 testes unitários, 1535 de banco, build); E2E real com `agent-browser`: 17/17. Branch mesclada com `origin/main` e enviada; falta revisão humana → PR → merge (nenhum PR aberto, por instrução) |
| S24 Portal B2B | `T2-pipeline` | `slice/S24-portal-b2b` | `fecf5a5` (Task 1: migration `0501` com parceiros, chaves com hash, rate limit e leitura pública) | Task 1 no GitHub (gate a reconferir). Task 2 estava pela metade SEM commit (52 arquivos: `app/v1/*`, `features/b2b/*`): DESCARTADA do worktree e guardada só na branch local `backup/descartado-reinicio-slice-S24-portal-b2b` |

Os WIPs `b449b60` (S21) e `18992ef` (S24) já estavam no GitHub e ficam na história das branches. Nada ficou só nesta máquina além dos dois backups locais (trabalho não verificado, não usado como base).

Ambiente religado: Colima e o Supabase local das trilhas 2 e 3 (`pnpm db:start`).

Retomada: S21 concluiu as Tasks 2 e 3 (2026-09-26, gate verde, E2E 17/17; falta revisão de segurança com Opus e o merge). S24 continua da **Task 2** do plano, com implementador Sonnet; depois S22/S23 e S25/S26, na ordem abaixo.

## Próximos passos (ordem do PLAN)

1. S10 e S11 concluídas. Ligar `ai_settings.auto_publish_enabled` no staging só depois de a leitura por IA funcionar lá (D-077) e de um E2E no preview.
2. Consolidar os ledgers de trilha em `ledger.md` (D-048) na S18.
3. Em paralelo: [S21 ✓ (#34), S22 ✓ (#36), S23 ✓ (#40)] ∥ [S24 ✓ (#38), S25 ✓ (#42), S26 ✓ (sem PR, por instrução — branch `slice/S26-campanhas`)].
4. S15 (implementada no worktree T3, em correções da revisão de segurança; antecipada — ver Ruling), S16.
5. S17, S18, S19 (a S19 também hospeda a fonte localmente, D-072). A S18 inclui a refatoração dos arquivos acima de 250 linhas (`DEBT.md`).
6. S28 · Excelência de produto e design (nova, ADR-006, pedida pelo humano em 2026-09-27): brainstorming autônomo, `/impeccable`, `/design-intelligence` e `/tripled-ui`; aceite com Lighthouse mobile ≥ 90, axe sem violação séria/crítica, `docs/MELHORIAS.md` + `DESIGN.md`, top 15 e custo de IA por lista < R$ 0,50.
7. S20: **parar para confirmação humana antes de qualquer ação em produção.** O go-live exige a S28 mesclada (ADR-006) e `DEBT.md` sem item de severidade alta aberto, ou com Ruling explícito.

## Pendências humanas (consolidadas)

Ambiente e deploy:
- Vercel: variáveis criadas pelo humano no projeto `listaescolare` em 2026-09-25 (D-058 resolvida); conferir `OPENROUTER_KEY` e `AI_MODEL_*` lá (o primeiro `provider_timeout` do E2E no staging pode vir da leitura inline do app, D-077).
- Vercel: a proteção dos previews foi DESATIVADA pelo humano em 2026-09-25 (previews públicos; `X-Robots-Tag: noindex` em tudo fora da produção). REATIVAR antes de entrar dado real: checklist da S20 (D-074).
- Vercel: `CRON_SECRET` (16 caracteres ou mais) nos ambientes e aceite do cron diário `/api/cron/leads-expire` no plano da conta (S14).
- Vercel: `NEXT_PUBLIC_SITE_URL` com o domínio próprio nos ambientes sem `VERCEL_PROJECT_PRODUCTION_URL` (domínio; canonical, JSON-LD, links de login e do lead, OG, sitemap e QR dependem dele).
- Supabase (staging): FEITO em 2026-09-25: `pg_cron`/`pg_net`, segredos no Vault, Edge Function `ocr-worker` (v1, `verify_jwt=false`) e job `ocr-worker-tick` ATIVO (a cada minuto). Tick de teste: 200 `status: ok` (D-060 resolvida). Teste ponta a ponta no preview feito em 2026-09-25: login e envio OK; leitura por IA OK depois que o humano cadastrou `OPENROUTER_KEY`/`AI_MODEL_*` na função (2026-09-26: job `succeeded` em 7 s pelo worker, `ai_decisions` `accepted`, envio em `human_review`; D-077 resolvida).
- Rodar `scripts/ai-smoke.ts` com chave e modelos reais (tem custo; os agentes não rodam).
- Supabase Auth hospedado: FEITO pelo humano em 2026-09-25 (Site URL, Redirect URLs incl. `https://listaescolare-*.vercel.app/**`, templates `magic_link` e `confirmation`); falta validar o link mágico em outro navegador no preview e SMTP próprio antes de produção (D-063). Referência do que foi configurado: Site URL e Redirect URLs (`/auth/confirm**`, `/auth/callback**`, glob dos previews); templates `magic_link` e `confirmation` com `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (modelo em `supabase/templates/`); SMTP próprio. Sem os templates o link mágico só funciona no mesmo navegador.
- Google OAuth: criar credenciais no console Google e ativar o provider no Supabase.
- Pepper do IP de auditoria: FEITO na 0601 (`audit_row_change` lê o Vault quando o GUC não existe; D-059 resolvida); na produção, gerar outro segredo `audit_ip_pepper` no Vault.
- Projeto Supabase de produção: só o humano cria (necessário na S20).
- Vercel (S24, Portal B2B): `B2B_API_KEY_PEPPER` (≥ 32 caracteres, gerado aleatoriamente, **diferente por ambiente**, nunca commitado) em Production/Preview/Development — sem ele a API `/v1` responde 503 e o portal não emite chaves. Atenção: um valor com menos de 32 caracteres (ou qualquer outra variável do `serverSchema` de `lib/env.ts` ausente/inválida, ex. `OPENROUTER_KEY`/`AI_MODEL_*`) quebra `getServerEnv()` inteiro e derruba TODA a API B2B com 503 silencioso (sem log — revisão final do branch, corrigido para logar só o nome do erro). Cron diário `/api/cron/b2b-maintenance` (mesmo `CRON_SECRET` já usado por `leads-expire`) precisa do aceite no plano da conta, igual ao S14.
- Vercel Firewall: rate limit global por IP em `/v1` — o limite em memória por instância do código (S24, revisão de segurança independente, achado 1b: 60 req/min por IP, `features/b2b/api/handler.ts`) é só a primeira camada; o limite de verdade entre todas as instâncias precisa ser configurado no Firewall/WAF da Vercel pelo humano (regra de rate limit por IP no projeto `listaescolar`, escopo `/v1/*`). Sem isso, um invasor distribuindo requisições entre múltiplas instâncias/lambdas contorna o limite por instância. A partir da S25, a mesma lacuna vale para `/api/widget/*` (balde em memória por IP+parceiro, `lib/rate-limit/memory-bucket.ts`, primeira camada só).
- Vercel (S25, Widget e webhooks): `B2B_WEBHOOK_ENCRYPTION_KEY` (32 bytes em hex, ex. `openssl rand -hex 32`, diferente por ambiente, nunca commitado) em Production/Preview/Development — sem ele criar/rotacionar/revelar segredo de webhook e o despacho respondem "indisponível" (nunca enviam sem poder assinar). `WEBHOOKS_DISPATCH_SECRET` (ou reaproveitar `CRON_SECRET`, já existente) para `/api/webhooks/dispatch`; cron de 1 min (pg_cron ou Vercel Cron) precisa do aceite no plano da conta, mesmo modelo do despacho de notificações da S11 — sem ele, webhooks ficam só na fila (`queued`), nunca entregues.

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

- **Skills da S28 no repositório.** O pedido de 2026-09-27 diz que `impeccable`, `tripled-ui` e `design-intelligence` estão em `.claude/skills/` por commit do humano, mas esse commit não está em `origin/main` nem nos worktrees (conferido em 2026-09-27). Não bloqueia agora: a S28 só começa depois da S19, e as três skills já estão disponíveis nesta sessão pelos plugins instalados. Ação do humano: dar push do commit (ou confirmar que devem vir dos plugins).

- **Plano de cobrança no staging (D-102).** Desde a 0401 (S21) o staging não tem plano ativo: todo lead para papelaria REAL é recusado com `billing_unavailable` (papelarias e carrinhos de demonstração seguem funcionando). O orquestrador não publica plano porque os valores (leads grátis, faixas de preço por quantidade de itens, pacotes de crédito, preço e parcelas do passe, meses da temporada) são preço de produto e não podem ser inventados. Ação do humano: informar os valores (ou pedir um plano provisório "de teste" explicitamente) e o orquestrador publica pela tela `/admin/planos` ou por `billing_plan_publish`.
