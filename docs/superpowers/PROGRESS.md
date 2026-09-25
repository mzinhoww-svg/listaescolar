# PROGRESS

**Atualizado em:** 2026-09-25, a partir de `git log origin/main` (HEAD `06f988a`), `gh pr list --state merged`, ledgers e relatórios `docs/superpowers/e2e/*.md`.

**Regra de manutenção:** atualizar este arquivo a cada merge (em PR `docs/` próprio ou junto do PR da fatia). Contagens só com fonte (PR ou relatório); sem fonte, `n/d`. Dívida técnica fica em `docs/superpowers/DEBT.md`, não aqui.

**Em andamento:** S09 (trilha Pipeline) e S27 (fora de trilha, depois da Comércio). Próxima a iniciar: S10.

## Concluídas (merge squash em `main`)

Legenda do gate: `unit` = `pnpm test` (Vitest); `db` = `pnpm test:db`; `CI` = jobs `verify` e `db` do GitHub Actions; `Vercel` = status do deploy de preview; `E2E` = roteiro agent-browser (build de produção local, pois o preview é protegido; ver Ruling do ledger). ✓ = verde declarado no PR; ✗ = falhou; `n/d` = sem dado no PR nem no relatório.

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

Observação: o check "Vercel" falha em todos os PRs desde o #4 (não só do #8 em diante). A causa apontada pelo orquestrador é a falta das variáveis `NEXT_PUBLIC_SUPABASE_*` no projeto da Vercel (ver pendências humanas).

## Migrations

Aplicadas no staging (ref `hojbnqkwzsicahzgshne`, ADR-003), via Supabase MCP. O histórico remoto usa versões por timestamp com nomes próprios (Ruling do ledger); as versões remotas não estão registradas no repositório (`n/d`) e devem ser reconciliadas antes da S20.

| Arquivo | Fatia | Nome no MCP | Versão remota |
|---|---|---|---|
| 0001_base_schema.sql | S01 | base_schema | n/d |
| 0002_profile_on_signup.sql | S02 | profile_on_signup | n/d |
| 0101_schools_and_imports.sql | S03 | n/d | n/d |
| 0102_school_search.sql | S04 | n/d | n/d |
| 0103_lists_and_versions.sql | S05 | n/d | n/d |
| 0104_claims.sql | S06 | n/d | n/d |
| 0201_submissions_and_jobs.sql | S07 | n/d | n/d |
| 0202_ai_registry_settings_decisions.sql | S08 | n/d | n/d |
| 0301_cart_retailers_affiliates.sql | S12 | n/d | n/d |
| 0302_stationeries.sql | S13 | n/d | n/d |
| 0303_leads.sql | S14 | n/d | n/d |

Pendente de staging: `0203_publication_decisions.sql` (S09, branch `slice/S09-aprovacao`; aplicar depois da revisão final, antes do merge).

Produção: nenhuma migration (o projeto não existe).

## Trilhas

| Trilha | Fatias | Estado |
|---|---|---|
| Dados | S03, S04, S05, S06 | **Completa** |
| Pipeline | S07, S08, S09, S10 | S07 e S08 completas. **S09 em andamento** (branch `slice/S09-aprovacao`; Task 1 revisada e corrigida, Task 2 em curso). S10 não iniciada |
| Comércio | S12, S13, S14 | **Completa**. Depois dela, **S27 em andamento** (branch `slice/S27-site-publico`; Tasks 1 e 2 revisadas, Task 3 (E2E) em curso) |

## Próximos passos (ordem do PLAN)

1. S09 (terminar) → S10.
2. S11: integração das trilhas, com a migration `0600_cross_track_fks` e a ligação das portas (leitor de lista real no carrinho e no lead, cotação local no carrinho, `SessionActor` unificado, provedor de e-mail, Web Push); consolidar os ledgers de trilha em `ledger.md` (ADR-004).
3. Em paralelo: [S21, S22, S23] e [S24, S25, S26].
4. S15, S16 (e S27, se ainda aberta).
5. S17, S18, S19. A S18 inclui a refatoração dos arquivos acima de 250 linhas (`DEBT.md`).
6. S20: **parar para confirmação humana antes de qualquer ação em produção.** O go-live exige `DEBT.md` sem item de severidade alta aberto, ou com Ruling explícito.

## Pendências humanas (consolidadas)

Ambiente e deploy:
- Vercel: definir `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (e as de servidor do `.env.example`) no projeto `listaescolar`. Sem elas o deploy da Vercel falha em todos os PRs desde o #4.
- Vercel: o preview está protegido (Deployment Protection). Liberar o acesso do agent-browser (Trusted Sources ou bypass) ou desligar a proteção só nos Previews. Até lá o E2E roda no build local.
- Vercel: `CRON_SECRET` (16 caracteres ou mais) nos ambientes e aceite do cron diário `/api/cron/leads-expire` no plano da conta (S14).
- Vercel: `NEXT_PUBLIC_SITE_URL` com o domínio próprio nos ambientes sem `VERCEL_PROJECT_PRODUCTION_URL` (canonical, JSON-LD, links de login e do lead).
- Supabase (staging): deploy da Edge Function `ocr-worker`, agendamento pg_cron/pg_net com Vault (`supabase/functions/ocr-worker/README.md`) e secrets `WORKER_SHARED_SECRET`, `OPENROUTER_KEY`, `AI_MODEL_CHEAP`, `AI_MODEL_STRONG`, `AI_MODEL_VISION`.
- Rodar `scripts/ai-smoke.ts` com chave e modelos reais (tem custo; os agentes não rodam).
- Supabase Auth hospedado: Site URL e Redirect URLs (`/auth/confirm**`, `/auth/callback**`, glob dos previews); templates `magic_link` e `confirmation` com `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (modelo em `supabase/templates/`); SMTP próprio. Sem os templates o link mágico só funciona no mesmo navegador.
- Google OAuth: criar credenciais no console Google e ativar o provider no Supabase.
- Pepper do IP de auditoria (`app.audit_ip_pepper`, de preferência no Vault) no staging e na produção antes da S20; sem ele `ip_hash` fica nulo.
- Projeto Supabase de produção: só o humano cria (necessário na S20).

Credenciais e contas:
- Provedor real de e-mail (S11) e credencial de WhatsApp (tokens de reivindicação da S06 e notificações).
- Afiliados: `MELI_AFFILIATE_ID` (confirmar o formato do link do programa, `matt_tool`/`matt_word`) e `AMAZON_ASSOCIATE_TAG`. Sem eles os links saem sem selo.
- Pix (cobrança, S21/S23); VAPID de produção (Web Push, S11); chave de produção do OpenRouter.

Conteúdo e dados:
- CSV oficial do INEP (importação na S20, com a contagem real registrada).
- Textos jurídicos finais: razão social, CNPJ, DPO/contato, prazos de retenção (páginas de termos e privacidade da S27 e S17 usam placeholders).
- Promessa "Famílias e escolas não pagam" (texto do site público da S27): validar com o modelo de preço antes de publicar.

## Notas operacionais
- Ferramentas: Colima + Docker, Supabase CLI e agent-browser instalados. Worktrees em `../listaescolar-wt/` (T1-dados, T3-comercio etc.); cada trilha tem workdir e portas próprios (`scripts/supa.mjs`, arquivo `.track`).
- Next 16 reescreve um bloco em CLAUDE.md: rode `git checkout CLAUDE.md` antes de commitar.
- Após mudar `supabase/config.toml` (auth), rode `pnpm db:stop && pnpm db:start`; `db:reset` sozinho não recarrega o auth.
- Banco local: `pnpm db:start`, `pnpm db:reset`, `pnpm test:db` (só banco local; o helper recusa host remoto).
- Staging: advisor aceito com `auth_role()` executável por anon, `rls_auto_enable()` (função da plataforma) e a view definer `stationery_public` (S13, esperado).
- Encerrar só o servidor aberto pela própria sessão (`kill "$(lsof -ti tcp:<porta> -sTCP:LISTEN)"`); nunca `pkill`.
- Subagentes: nunca despachar dois na mesma rodada no mesmo worktree.
