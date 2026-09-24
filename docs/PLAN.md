# ListaCerta MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MVP do piloto de Cuiabá, do CSV do INEP até a cotação por WhatsApp, pronto para produção.
**Architecture:** Next.js App Router na Vercel sobre Supabase (RLS, Auth, Storage, Queues). IA atrás de adapters com auditoria em `ai_decisions`. OCR síncrono de 10 s com fallback para fila.
**Tech Stack:** Next.js, TypeScript, Tailwind, Zod, Supabase, pgmq, Vitest, agent-browser, Sentry.
**Spec:** SPEC-3-produto.md

## Como executar
- Cada fatia é um prompt curto para o Claude Code. Ele lê `CLAUDE.md` e o spec, executa, testa e abre o PR.
- Toda fatia termina com o mesmo gate: `pnpm typecheck && pnpm lint && pnpm test` verdes, migrations aplicadas do zero no Supabase local, roteiro E2E com agent-browser no preview e checklist do spec (seção 8) no PR.
- **Paralelismo** (dispatching-parallel-agents): depois de S02, três trilhas independentes podem rodar em worktrees separados.
  - Trilha Dados: S03, S04, S05, S06.
  - Trilha Pipeline: S07, S08, S09, S10.
  - Trilha Comércio: S12, S13, S14.

  S11 e S15 a S20 rodam depois do merge das três.

## Pré-requisitos do responsável (uma vez)
- Criar o repositório GitHub vazio e conectar à Vercel.
- Criar um projeto no Supabase (produção). Sem staging.
- Guardar as chaves nos envs da Vercel e no `.env.local`.
- Separar o CSV oficial do INEP.
- Definir as chaves dos provedores de IA (DeepSeek, GLM e o de visão).

## Fatias

### S00 · Fundação do repositório
**Prompt:**
> Leia CLAUDE.md e docs/SPEC.md. Crie o projeto Next.js App Router com TypeScript strict, Tailwind com os tokens da marca, Zod, ESLint, Prettier, Vitest e pnpm. Configure Supabase CLI local, Sentry e scripts `typecheck`, `lint`, `test`, `db:reset`. Crie o layout base com a marca ListaCerta e uma página inicial simples. Adicione GitHub Action rodando os três scripts. Não crie tabelas ainda.

**Aceite:**
- `pnpm dev` sobe a página.
- CI verde.
- Preview na Vercel funcionando.
- **E2E:** agent-browser abre o preview e confere o título e o logo.

### S01 · Schema base, perfis e auditoria
**Prompt:**
> Migration 0001: enums do spec seção 4, tabelas `municipalities`, `profiles`, `audit_log`, função `auth_role()` SECURITY DEFINER e trigger genérico de auditoria. RLS em tudo. Seed de Cuiabá habilitado. Testes Vitest das políticas por perfil usando o Supabase local.

**Aceite:**
- `db:reset` aplica do zero.
- Testes de RLS cobrem os 5 perfis.

### S02 · Autenticação e controle de rotas
**Prompt:**
> Supabase Auth com Google e link mágico. Criação de `profiles` no primeiro login com papel `parent`. Middleware que protege `/conta`, `/escola`, `/papelaria` e `/admin` por papel. Páginas de login, 403 e 404 com loading, erro e vazio.

**E2E:** login de teste, acesso negado a `/admin` para `parent`, acesso liberado para `admin` de seed.

### S03 · Importação INEP por CSV
**Prompt:**
> Tabelas `schools`, `import_batches` e `import_rows`. Tela `/admin/importacoes` com upload do CSV. O processamento acontece no servidor, em lotes, com:
> - validação de colunas por schema Zod;
> - normalização de nome, município, endereço, INEP e contatos;
> - detecção de duplicidade por INEP e por nome normalizado mais município;
> - relatório de erros baixável;
> - reprocessamento idempotente pelo hash do arquivo;
> - atualização de base existente sem duplicar.
>
> Toda escola nasce `registered`. A contagem exibida vem do banco depois da validação, nunca é fixa no código.

**Aceite:**
- Importar o mesmo arquivo duas vezes não duplica nada.
- CSV com colunas faltando gera relatório de erros.
- Testes de normalização.

**E2E:** upload de um CSV de exemplo marcado como demo.

### S04 · Busca pública e perfil da escola
**Prompt:**
> Rotas `/escolas` e `/escolas/[inep]` com SSR e metadados de SEO. Busca por nome, bairro, rede e município (índice trigram). O perfil mostra:
> - nome, INEP, município e dados básicos;
> - selo de status (cadastrada, reivindicada, verificada, suspensa);
> - seletor de série e ano letivo;
> - botão "Reivindicar perfil".
>
> Inclui estados de vazio e erro.

**E2E:** buscar escola demo, abrir o perfil, trocar série e ano.

### S05 · Listas oficiais e versões
**Prompt:**
> Tabelas `grades`, `school_lists`, `list_versions` e `list_items`. O perfil exibe só a versão `published` atual; o histórico mostra as anteriores com o rótulo "versão anterior". Uma arquivada nunca aparece como atual. Máquina de estados da lista em `features/lists/state.ts`, com testes de todas as transições válidas e inválidas.

**Aceite:** as transições proibidas lançam erro, cobertas por teste.

### S06 · Reivindicação de escola
**Prompt:**
> Tabelas `claims`, `claim_tokens` e `claim_evidence`. Três métodos:
> - e-mail institucional, com token de uso único e expiração;
> - WhatsApp institucional, com código;
> - documentos, em bucket privado.
>
> Estados do spec. Fila `/admin/reivindicacoes` com aprovar ou rejeitar e motivo. A aprovação muda a escola para `verified` e mostra o selo. Token vencido leva a `token_expired`.

**E2E:** reivindicar por documento, aprovar como admin, selo visível no perfil.

### S07 · Upload e OCR síncrono de 10 s com fallback
**Prompt:**
> Upload de foto ou PDF para bucket privado, com limite de tamanho e tipo, e consentimento registrado em `consents`. Server Action com orçamento de 10 s. Se estourar, enfileira em pgmq, devolve `job_id` e a tela mostra "continuar aguardando", ativar notificação e canal opcional. Worker em Edge Function, idempotente, com retry exponencial e dead letter. Status persistido e consultável.

**Aceite:** teste simulando provedor lento cai no caminho assíncrono e conclui pelo worker.

### S08 · Adapters de IA, roteador e registro de decisões
**Prompt:**
> Crie `lib/ai`:
> - interfaces `OcrProvider` e `LlmProvider`;
> - adapters para DeepSeek, GLM e um provedor de visão;
> - roteador barato-primeiro que escala quando a validação Zod falha, a confiança fica abaixo do limiar ou há timeout.
>
> `prompt_registry` versionado, `ai_settings` com limiares e `ai_decisions` gravando modelo, provedor, versão do prompt, versão do pipeline, scores, alertas e timestamps. A extração normaliza, classifica, dá confiança por item e gera os alertas do spec.

**Aceite:** trocar de provedor via `ai_settings` sem alterar código de domínio, com teste usando provedores falsos.

### S09 · Motor de aprovação automática
**Prompt:**
> Serviço `decideListPublication`. Publica sozinho somente se todas as regras do spec seção 6 forem verdadeiras. Qualquer falha manda para `human_review` com justificativa. Grava `ai_decisions` com versão anterior e nova da lista.

**Aceite:** tabela de testes cobrindo cada regra isolada.

### S10 · Revisão humana e revisão do pai
**Prompt:**
> Tela `/admin/revisao` com o documento ao lado dos itens extraídos, confiança por item, alertas, edição, aprovar, rejeitar e publicar. Tela do pai para revisar os itens extraídos da própria lista antes de montar o carrinho, sem torná-la oficial.

**E2E:** lista com alerta crítico vai para revisão, admin corrige e publica.

### S11 · Notificações
**Prompt:**
> Tabelas `notifications`, `push_subscriptions` e `notification_preferences`. Web Push com VAPID, central de notificações dentro do app e interface `Notifier` com implementação de e-mail desligada por flag. Cobrir os eventos da seção 6 do prompt.

**E2E:** OCR assíncrono conclui e a notificação aparece.

### S12 · Carrinho, varejistas e afiliados
**Prompt:**
> Interface `RetailerProvider` e `AffiliateLinkBuilder`. As quatro opções do spec. Snapshot de preço com origem e `checked_at`. Sem fonte de preço, a opção fica indisponível: nunca estimar. Rota `/ir-para/[cartId]/[retailer]` registra o clique em `affiliate_clicks` e redireciona. Selo de afiliado e aviso de variação de preço.

**Aceite:** teste garantindo que nenhum preço é exibido sem origem.

### S13 · Papelarias: credenciamento e catálogo
**Prompt:**
> Tabelas `stationeries`, `stationery_members`, `stationery_areas` e `catalog_items`. Ciclo de estados do spec. Cadastro, bairros atendidos, retirada e entrega, catálogo com preço informado pela papelaria e `updated_at`. Admin aprova, pausa ou suspende.

**E2E:** cadastrar papelaria demo e aprovar como admin.

### S14 · Cotação por WhatsApp e funil de leads
**Prompt:**
> Tabelas `leads` e `lead_events`, com código `LC-XXXX`. Consentimento antes de abrir o `wa.me`. Mensagem com só código, escola, série, ano e link da lista. Painel da papelaria com funil completo, atualização de status, conversão ou perda, e expiração por job. Registrar eventos para cobrança futura, sem cobrar nada.

**Aceite:** teste garantindo que a mensagem não contém dado de menor nem dado pessoal do responsável.

### S15 · Área da família
**Prompt:**
> `/conta`: estudantes (só apelido e série), listas salvas, carrinhos e cotações com status.

### S16 · Admin
**Prompt:**
> Dashboard com contagens por estado de escola, lista, reivindicação, papelaria e lead, todas vindas do banco. Mais:
> - auditoria filtrável;
> - denúncias (`reports`);
> - edição de `ai_settings`;
> - arquivar lista.

### S17 · LGPD e dados demonstrativos
**Prompt:**
> Consentimentos versionados com revogação. `retention_policies` com job de exclusão de documentos vencidos. Exportação e exclusão de conta. Flag `is_demo` em toda tabela de conteúdo com selo "Demonstração". Página de privacidade com placeholders de razão social e contato, sem afirmar conformidade.

### S18 · Estados e acessibilidade
**Prompt:**
> Revisar todas as rotas: loading, sucesso, erro, vazio e retry. Contraste AA, foco visível e rótulos. Quebrar componente acima de 250 linhas.

### S19 · Segurança e observabilidade
**Prompt:**
> Rate limit em upload, OCR, login e leads. Headers de segurança e CSP. Sentry com escopo por perfil, sem dado pessoal. Alertas para fila morta e taxa de erro do provedor de IA.

### S20 · Produção e suíte E2E final
**Prompt:**
> Rodar as migrations em produção somente após `supabase db reset` local verde e aprovação humana. Suíte agent-browser completa cobrindo os fluxos pai, escola, admin e papelaria. Checklist de go-live em `docs/GO-LIVE.md`. Importar o CSV oficial em produção e registrar a contagem real.

## Ordem sugerida
1. S00, S01, S02.
2. Em paralelo: [S03, S04, S05, S06], [S07, S08, S09, S10] e [S12, S13, S14].
3. S11.
4. S15, S16, S17, S18, S19.
5. S20.
