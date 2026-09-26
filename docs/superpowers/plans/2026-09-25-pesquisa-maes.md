# Pesquisa com mães · Plano de implementação (fora do PLAN, ADR-005)

> **For agentic workers:** subagent-driven-development manual (skills `/superpowers:*` não instaladas nesta sessão — Ruling no ADR-005). Um subagente implementador por tarefa (ou grupo de tarefas independente, em paralelo), revisão de spec e de qualidade depois de cada uma, revisão final da branch antes do merge. Steps em checkbox (`- [ ]`).

**Goal:** rota pública `/pesquisa` (12 perguntas, uma por tela, salvamento incremental, lead de WhatsApp com consentimento), página de resultados protegida por senha com exportação CSV, conforme `docs/superpowers/specs/2026-09-25-pesquisa-maes-design.md` (spec vinculante, ler por completo antes de implementar qualquer tarefa).

**Architecture:** Isolada em `app/pesquisa/**`, `app/api/pesquisa/**`, `components/pesquisa/**`, `lib/pesquisa/**`, tabelas `survey_responses`/`survey_leads`. Sem RLS policy nenhuma (só `service_role`); o navegador nunca fala com o Supabase — todo acesso passa por route handlers server-only. Sem FK para o resto do schema. Ver ADR-005 para os limites de escopo e as autorizações do fundador.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, `@supabase/supabase-js` (client server-only com `SUPABASE_SECRET_KEY` — não o nome legado da spec, Ruling no ADR-005), Vitest, agent-browser.

**Spec:** `docs/superpowers/specs/2026-09-25-pesquisa-maes-design.md` (todas as seções). `CLAUDE.md` (nomes de variável, componentes ≤250 linhas, Zod em toda fronteira, migrations com `gen_random_uuid()`/RLS). `docs/decisions/ADR-005-pesquisa-maes-fora-do-plan.md`.

## Global Constraints
- Migration `supabase/migrations/0700_pesquisa_maes.sql`, aditiva, conforme spec §5.1 literal (não editar a lógica; só adaptar nomes de variável/estilo se necessário para casar com o padrão do repositório, com Ruling se algo mudar).
- Cliente Supabase server-only: `import "server-only"` no topo de `lib/pesquisa/repositorio.ts`; variáveis via o helper de env já existente no repo (confirmar em Task 1 se `lib/env.ts` ou equivalente expõe `SUPABASE_SECRET_KEY`/`NEXT_PUBLIC_SUPABASE_URL`; se não, adicionar ali seguindo o padrão existente, não um client Supabase solto).
- Nenhuma tabela fora de `survey_responses`/`survey_leads` é tocada. Nenhum arquivo fora do escopo do ADR-005 muda, exceto o necessário para expor as novas env vars pelo helper de env existente (mínimo, registrado como Ruling se ocorrer).
- Zod em toda fronteira (as 5 rotas de API). Erros sempre `{ "error": "<codigo>" }` com o status certo (400/401/404/409/429).
- Componentes ≤250 linhas. `"use client"` só nos componentes com interação (`Pesquisa`, as opções, o formulário de lead); a página em si é Server Component.
- `IP_HASH_SALT`, `PESQUISA_RESULTS_PASSWORD`: gerar (24 chars / 32 bytes hex), cadastrar na Vercel (Production, Preview e Development) via MCP, nunca logar o valor.
- Sem Docker nesta sessão: testes de integração contra Supabase rodam via script Node autenticado (service key da staging), não via `pnpm test:db`. Escrever os arquivos Vitest de integração mesmo assim, para rodar via `test:db` numa sessão com Docker (Ruling no ADR-005).
- Dados de teste sempre com `source_group = 'e2e-teste'`; nenhuma limpeza fora desse filtro.

## Review Focus
- Nenhuma escrita/leitura do navegador direto no Supabase (grep por `NEXT_PUBLIC_SUPABASE` fora de `lib/pesquisa/repositorio.ts` e do client core do repo já existente).
- `survey_upsert_answer`: upsert por `session_id` nunca reduz `last_step`, faz merge de `answers` (não substitui), nunca cria duas linhas para a mesma sessão.
- Validação Zod por `step`: só aceita os ids/slugs daquela tela; rejeita id de outra tela, valor fora da lista, mais de 2 itens em `dores`, texto além do limite.
- Honeypot (`hp` preenchido) responde 200 sem gravar nada — testar explicitamente.
- Rate limit de 429 por `ip_hash` (30 sessões novas/hora) não é fácil de burlar trocando `session_id` com o mesmo IP.
- `/api/pesquisa/lead`: sem `consent === true` nunca grava; WhatsApp normalizado para E.164 `+55` de verdade (não só regex frouxo); nunca aceita dado de criança (a spec não pede nenhum campo de criança nesta tela — conferir que nada foi adicionado).
- `/api/pesquisa/login` e `/api/pesquisa/export`: comparação de senha em tempo constante; cookie `pesquisa_auth` httpOnly/secure/sameSite=lax; export sem cookie válido é 401, nunca vaza dado parcial.
- CSV: sem dado de contato na aba de respostas; `compra_ideal` só exportada como está (não é reidentificação por si só, mas conferir que `pode_citar=false` não impede o dono de ver o próprio export — a spec não pede esse filtro no export, só na tela de resultados §8 "Frases").
- Nenhum componente novo estoura 250 linhas; nenhuma dependência nova de analytics/pixel de terceiros.
- Página de resultados: números batem com o banco (cartões, funil, por pergunta, por origem) — comparar com uma query manual nos testes de integração.

---

### Task 1: Migration + verificação de banco

**Files:** Create `supabase/migrations/0700_pesquisa_maes.sql`, `tests/db/pesquisa.test.ts` (para rodar via `test:db` quando houver Docker), `scripts/pesquisa-db-check.mjs` (verificação direta contra staging nesta sessão, sem Docker — conecta com `SUPABASE_SECRET_KEY`/URL, roda os mesmos casos do teste, limpa por `source_group = 'e2e-teste'`, nunca imprime segredo).

**Interfaces:** Produces `public.survey_responses`, `public.survey_leads`, `public.survey_upsert_answer(...)` exatamente como a spec §5.1.

- [ ] Step 1: Escrever a migration (copiar a SQL da spec, ajustar só o necessário para o padrão de comentários do repo). Aplicar no ListaEscolar (staging) via `mcp__Supabase__apply_migration` (`project_id = hojbnqkwzsicahzgshne`, `name = pesquisa_maes`). Rodar `mcp__Supabase__get_advisors` (security) depois e resolver ou registrar Ruling para qualquer achado.
- [ ] Step 2: Escrever `tests/db/pesquisa.test.ts` cobrindo: upsert cria uma linha; upsert repetido faz merge de `answers` e nunca reduz `last_step`; `last_step` respeita `check (0..12)`; `survey_leads` exige `whatsapp_e164` no formato certo (rejeitar formato errado); `on delete cascade` de `survey_responses` para `survey_leads`; nenhuma policy de RLS para `anon`/`authenticated` (checar `pg_policies`); função com `security definer` e `revoke` de `public/anon/authenticated`.
- [ ] Step 3: Rodar os mesmos casos com `scripts/pesquisa-db-check.mjs` contra staging (via `SUPABASE_SECRET_KEY` desta sessão, nunca comitado), usando `source_group = 'e2e-teste'` em todas as linhas de teste, e apagar essas linhas ao final do script. Reportar saída no PR. Commit `feat(db): survey_responses, survey_leads e upsert (pesquisa com mães)`.

### Task 2: Camada base (TDD, pura — sem Supabase)

**Files:** Create `lib/pesquisa/perguntas.ts`, `lib/pesquisa/schemas.ts`, `lib/pesquisa/telefone.ts`, `lib/pesquisa/auth-resultados.ts`, `lib/pesquisa/sessao.ts`, `tests/pesquisa/{perguntas,schemas,telefone,auth-resultados}.test.ts`.

**Interfaces:** Produces:
- `PERGUNTAS`: config tipada das 13 telas (0 a 12) da spec §4 — id, tipo (única/múltipla/texto/condicional), opções com slug+rótulo, obrigatoriedade, máximos.
- `answerSchemaForStep(step: number): ZodType` — schema Zod específico da tela, construído a partir de `PERGUNTAS` (single source of truth).
- `normalizeWhatsappBR(input: string): string | null` — E.164 `+55`, valida DDD (11–99, exceto os que não existem) e 10/11 dígitos.
- `signResultsCookie(password: string): string` / `verifyResultsCookie(value, password): boolean` — HMAC-SHA256, comparação em tempo constante (`crypto.timingSafeEqual`).
- `getOrCreateSessionId()`, `loadLocalState()`, `saveLocalState()` — wrapper de `localStorage` (`listacerta_pesquisa_session`), só para uso em Client Components (guardar atrás de `typeof window !== "undefined"`).

- [ ] Step 1: Testes falhando primeiro. `schemas`: aceita todos os slugs válidos de cada tela; rejeita id de outra tela, slug desconhecido, mais de 2 itens em `dores`, texto acima do limite (120/500), objeto vazio só aceito na tela 12; tela 11 exige `canal` quando `usaria != 'nao'` e rejeita `canal` quando `usaria == 'nao'`. `telefone`: normaliza `(65) 99999-1234`, `65999991234`, `+55 65 99999-1234`; rejeita DDD inválido (ex. `10`) e contagem errada de dígitos. `auth-resultados`: assinatura válida verifica, assinatura de outra senha não verifica, valor adulterado não verifica.
- [ ] Step 2: Implementar. `pnpm typecheck && pnpm lint && pnpm test`. Commit `feat(pesquisa): config de perguntas, schemas, telefone e auth de resultados`.

### Task 3: Repositório Supabase + rotas de API (depende da Task 1 e 2)

**Files:** Create `lib/pesquisa/repositorio.ts`, `app/api/pesquisa/resposta/route.ts`, `app/api/pesquisa/concluir/route.ts`, `app/api/pesquisa/lead/route.ts`, `app/api/pesquisa/login/route.ts`, `app/api/pesquisa/export/route.ts`, `tests/pesquisa/routes/*.test.ts` (mock do repositório) e `tests/pesquisa/repository.integration.ts` (chamado pelo script da Task 1, não pelo `pnpm test`).

**Interfaces:** Produces `upsertAnswer(...)`, `markCompleted(sessionId)`, `createOrUpdateLead(...)`, `exportResponsesCsv()`, `exportLeadsCsv()` no repositório; as 5 rotas conforme os contratos exatos da spec §5.2 (status codes, `{error: codigo}`, honeypot, rate limit 429 por `ip_hash` com `IP_HASH_SALT`).

- [ ] Step 1: Testes falhando: cada rota com payload válido/inválido, honeypot, limites, 401/404/409 conforme a spec. `ip_hash` = SHA-256(`IP_HASH_SALT + ip`) lido de `x-forwarded-for` (primeiro valor confiável — seguir o mesmo padrão de `x-forwarded-for` já usado em outra parte do repo, se houver).
- [ ] Step 2: Implementar. `pnpm typecheck && pnpm lint && pnpm test`. Commit `feat(pesquisa): rotas de API (resposta, concluir, lead, login, export)`.

### Task 4: UI — página `/pesquisa` e componentes (pode rodar em paralelo com a Task 3, depois da Task 2)

**Files:** Create `components/pesquisa/{Pesquisa,Tela,OpcaoUnica,OpcaoMultipla,Progresso,TelaFinal}.tsx`, `app/pesquisa/page.tsx`, `app/pesquisa/opengraph-image.tsx`, `app/pesquisa/layout.tsx` (fonte Plus Jakarta Sans, se o layout raiz do app não cobrir esta subárvore), `tests/pesquisa/components/*.test.tsx`.

- [ ] Step 1: Ler a spec §4 (textos exatos), §6 (marca) e §3 (estrutura). Implementar as 13 telas com os textos literais da tabela, barra "N de 12", avanço automático em 250 ms para escolha única, "Voltar"/"Pular" conforme a tabela, tela 11 condicional, tela final com WhatsApp mascarado + checkbox + botão "Enviar para outra mãe" (`wa.me` com a mensagem exata da spec, incluindo `ref`/`g`). Envio otimista com fila de 3 tentativas (1s/3s/9s) — usar as rotas da Task 3 (podem estar em progresso em paralelo; mockar a chamada `fetch` nos testes desta tarefa).
- [ ] Step 2: `pnpm typecheck && pnpm lint && pnpm test`. Nenhum componente acima de 250 linhas. Commit `feat(pesquisa): telas, componentes e imagem OG`.

### Task 5: Resultados, agregação e privacidade (pode rodar em paralelo com as Tasks 3 e 4, depois da Task 2)

**Files:** Create `lib/pesquisa/agregacao.ts`, `app/pesquisa/resultados/page.tsx`, `app/pesquisa/resultados/login/page.tsx`, `app/pesquisa/privacidade/page.tsx`, `tests/pesquisa/agregacao.test.ts`.

**Interfaces:** Produces `aggregateSurvey(rows: SurveyResponseRow[]): SurveyStats` — cartões (iniciadas, completas, taxa, tempo mediano, leads, taxa de lead), funil por `last_step` 0–12, contagem/percentual por pergunta, por `source_group`, frases com `pode_citar = true`. Função pura, com fixtures.

- [ ] Step 1: Testes com fixtures fabricadas (não vêm do banco): contagens e percentuais batem à mão; mediana com número par e ímpar de amostras; funil soma o total de sessões; frases só com `pode_citar = true` e nunca junto de nome/telefone.
- [ ] Step 2: Implementar `agregacao.ts`, a página de resultados (protegida — sem cookie válido, redireciona para `/pesquisa/resultados/login`), o login (form → `POST /api/pesquisa/login`) e `/pesquisa/privacidade` (texto da spec §7, com o e-mail de contato do fundador). `pnpm typecheck && pnpm lint && pnpm test`. Commit `feat(pesquisa): resultados, agregação e página de privacidade`.

### Task 6: Integração, deploy e E2E no preview

**Files:** Modify conforme necessário para corrigir integração entre as Tasks 3–5; Create `docs/superpowers/e2e/pesquisa-maes.md`, `docs/superpowers/evidencias/pesquisa/` (screenshots).

- [ ] Step 1: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes na branch inteira (as três tarefas paralelas integradas).
- [ ] Step 2: Gerar `PESQUISA_RESULTS_PASSWORD` (24 caracteres) e `IP_HASH_SALT` (32 bytes hex); cadastrar na Vercel (`listaescolare`, Production+Preview+Development) via MCP; conferir que `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SECRET_KEY` já cadastradas cobrem esta rota (não precisam de nova variável, são as mesmas do projeto).
- [ ] Step 3: Push da branch, atualizar/abrir PR, aguardar o deploy de preview da Vercel ficar `READY`.
- [ ] Step 4: Rodar os 7 cenários de ponta a ponta da spec §10 com agent-browser (viewport 390×844) contra o preview; screenshots em `docs/superpowers/evidencias/pesquisa/`; conferir cada cenário também no banco (staging) via MCP `execute_sql` (select, nunca DDL). Corrigir e repetir até verde. Registrar em `docs/superpowers/e2e/pesquisa-maes.md`.

### Task 7: Revisão final, merge, E2E em produção, limpeza e relatório

- [ ] Step 1: Revisão final da branch inteira (spec + qualidade) por subagente; resolver achados.
- [ ] Step 2: Confirmar CI verde no PR. Merge squash na `main` (autorização do fundador no ADR-005 — sem esperar revisão pessoal dele, mas com a revisão do Step 1 registrada no PR). Se o classificador barrar o merge (self-approval ou outro), registrar em "Aguardando humano" no PROGRESS.md, deixar o PR pronto e seguir para o Step 4 mesmo assim (a suíte local/preview já cobre a maior parte da verificação).
- [ ] Step 3: Depois do merge, repetir os 7 cenários na URL de produção da Vercel (deploy da `main`), com screenshots próprios.
- [ ] Step 4: Apagar só as linhas com `source_group = 'e2e-teste'` em `survey_responses`/`survey_leads` (cascade cobre `survey_leads`) via MCP `execute_sql`, e confirmar contagem zerada para esse filtro. Confirmar que a contagem geral (sem o filtro) reflete só respostas reais, se houver.
- [ ] Step 5: Atualizar `docs/superpowers/PROGRESS.md` (estado final da fatia) e o relatório final definido no prompt original (URLs, senha, resultados de teste, Rulings, confirmação de limpeza, link do PR).
