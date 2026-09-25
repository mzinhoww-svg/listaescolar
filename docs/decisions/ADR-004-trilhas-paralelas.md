# ADR-004 · Trilhas paralelas: isolamento e contratos

Data: 24/09/2026 · Status: aceita (decisão do Claude, regra de Autonomia).

## Contexto
O PLAN manda rodar as trilhas Dados (S03–S06), Pipeline (S07–S10) e Comércio (S12–S14) em paralelo depois da S02. Mas há dependências reais: a publicação de listas (S09/S10) escreve em `school_lists`/`list_versions` (S05), o upload (S07) e os leads (S14) referenciam escola e lista.

## Decisão
1. **Isolamento de ambiente:** um worktree e um Supabase local por trilha (`scripts/supa.mjs` + `.track`, config derivado em `.track-workdir`, sem tocar no `config.toml` versionado), migrations numeradas por faixa (Dados 01xx, Pipeline 02xx, Comércio 03xx, Cobrança 04xx, B2B 05xx, pós-trilhas 06xx).
2. **Sem FK entre trilhas:** cada migration só referencia tabelas que já existem em `main` no momento do branch (`auth.users`, `profiles`, `municipalities`). Colunas que apontam para tabelas de outra trilha (`school_id`, `list_id`, `grade_id`) nascem como `uuid` sem FK. Uma migration de integração `0600_cross_track_fks.sql` (fatia S11) adiciona as FKs depois que as três trilhas estiverem mescladas.
3. **Portas (hexagonal):** efeitos entre trilhas passam por interfaces em `features/<domínio>/ports.ts` com implementação em memória para testes. Ex.: Pipeline define `ListPublisher` (publicar versão da lista); a implementação real, sobre as tabelas de S05, é ligada na S11. Comércio define `ListReader`. Nenhuma trilha importa código de serviço de outra.
4. **Tipos compartilhados:** enums Postgres do spec (já na 0001) são a fonte; cada trilha gera seus tipos a partir deles. Regras de estado compartilhadas (ex.: transições de `list_status`) vivem no domínio da trilha dona (Dados, `features/lists/state.ts`); a trilha Pipeline usa só os valores do enum.
5. **Merge:** cada trilha abre PRs por fatia contra `main`; conflitos (package.json, ledger, PROGRESS, layout/nav) são resolvidos com rebase da trilha mais nova pelo orquestrador. Dependências novas de `package.json` são instaladas pelo orquestrador antes de disparar as trilhas.
6. **Navegação:** cada fatia adiciona suas rotas sem editar o layout global; a integração de menus/atalhos entre áreas fica na S11/S15/S16.

7. **Migrations e staging:** FKs entre trilhas e as FKs das trilhas Cobrança (S21–S23, 04xx) e B2B (S24–S26, 05xx) nascem nas próprias migrations dessas fatias (que rodam depois da S11, com todas as tabelas já em `main`); só as FKs entre Dados, Pipeline e Comércio ficam na `0600_cross_track_fks.sql` (S11), com `add constraint ... not valid` + `validate constraint` e `on delete` definido por FK. O staging recebe migrations pelo MCP (sem checagem de ordem do CLI) e **apenas o orquestrador aplica**, em série, na ordem do prefixo. Na S20 o script de produção aplica tudo em ordem lexicográfica a partir do zero.
8. **Escopo da S11:** além de Notificações, a S11 entrega a integração das trilhas (migration 0600, ligação das portas `ListPublisher`/`ListReader` às tabelas reais, testes de contrato). Registrado também no PLAN.
9. **E2E parcial até a S11:** o E2E da S10 (publicar), o perfil da escola exibindo lista publicada (S04) e o carrinho (S12) rodam contra dados de demonstração (`is_demo = true`) e portas em memória; o E2E de ponta a ponta desses fluxos é executado na S11 e conta como aceite delas. Cada PR dessas fatias declara isso.
10. **Ambiente por trilha:** app em `3000+índice`, `.env.local` via `pnpm db:env`, `site_url`/redirects derivados pelo wrapper.

## Consequências
- As fatias funcionam isoladas e testáveis; a costura custa uma migration e uma fatia de integração (S11), com testes de contrato entre as portas e as tabelas reais.
- Custo se errado: retrabalho de integração na S11. Aceito.
