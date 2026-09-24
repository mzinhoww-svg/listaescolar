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
- Supabase: o projeto ListaEscolar é o staging (ADR-003). O projeto de produção é criado pelo humano antes da S20.
- Guardar as chaves nos envs da Vercel e no `.env.local`.
- Separar o CSV oficial do INEP.
- Definir a chave do OpenRouter e os modelos em `AI_MODEL_*`.

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
> - adapter OpenRouter, com modelos barato, forte e de visão vindos de `AI_MODEL_*`;
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

### S21 · Cobrança da papelaria: leads grátis, créditos e passe de temporada
**Referência:** `docs/SPEC-2-cobranca-b2b.md`, telas Pap06-Creditos, Admin10-Planos, Pap01-Cadastro.
**Prompt:**
> Tabelas `plans`, `stationery_wallets`, `credit_ledger` (livro-razão imutável), `season_passes` e `invoices`. Regras: primeiros leads grátis por papelaria, com o valor em `plans` e nunca fixo no código; crédito por lead com preço por faixa de itens; passe de temporada de novembro a março, parcelável em até 3x. O débito só acontece quando o lead é entregue. Interface `PaymentProvider` com implementação fake para testes e um adapter Pix atrás de flag, sem credencial real no código. Tela de créditos e plano da papelaria e tela de planos no admin.

**Aceite:**
- O saldo é sempre igual à soma do livro-razão, com teste de concorrência.
- O lead não é entregue sem saldo nem passe ativo.

### S22 · Atribuição, conversão e contestação
**Referência:** telas Pap03-LeadDetalhe, App22-VoceComprou, App23-Avaliar, Admin11-Auditoria, Admin12-Contestacoes.
**Prompt:**
> Três sinais de conversão:
> - confirmação da papelaria;
> - confirmação do pai ("Você comprou?");
> - Pix pela plataforma.
>
> Convertido significa 2 de 3 sinais. A papelaria pode contestar em até 72 h pelos motivos do spec: número errado, lista incompleta, duplicado ou fora da área. Contestação aceita devolve o crédito no livro-razão. Inclui avaliação da papelaria pelo pai e auditoria de conversão no admin.

**Aceite:** testes da regra 2 de 3, do prazo de 72 h e do estorno de crédito.

### S23 · Comissão, repasses e inadimplência
**Referência:** telas Admin13-Repasses, Admin14-Inadimplencia.
**Prompt:**
> Comissão só quando o Pix passa pela plataforma. Repasse opcional para escola ou APM, configurável por escola. Tela de repasses com conciliação e tela de inadimplência com régua de cobrança por status. Não há movimentação real de dinheiro: o sistema gera instruções e registros, e o admin executa manualmente.

**Aceite:** o relatório de repasse bate com o livro-razão, com teste.

### S24 · Portal B2B: cadastro, chaves e API v1
**Referência:** `docs/SPEC-2-cobranca-b2b.md` (seção Lógica B2B), telas B2B00-Parceiros, B2B01-Visao, B2B02-API, B2B03-Docs, Admin15-ParceirosB2B.
**Prompt:**
> Parceiros dos tipos varejista, marca e EdTech/ERP. Chaves `x-listacerta-key` com hash no banco, escopos e rotação sem downtime (duas chaves ativas ao mesmo tempo). Endpoints:
> - `GET /v1/schools`
> - `GET /v1/schools/{inep}/lists`
> - `GET /v1/lists/{id}/items`
> - `POST /v1/carts/match`
>
> A API expõe só listas públicas e dados agregados. Rate limit por chave. Documentação navegável.

**Aceite:**
- Nenhuma rota devolve dado pessoal, com teste.
- Chave revogada falha na hora.

### S25 · Widget e webhooks
**Referência:** telas B2B04-Widget, B2B05-Webhooks.
**Prompt:**
> Widget embutível que leva a lista ao carrinho do varejista parceiro. Webhooks `list.published`, `list.updated`, `list.archived` e `school.approved`, assinados com HMAC, com retry, log de entregas e reenvio manual.

**Aceite:**
- Assinatura verificável por teste.
- Entrega com falha entra em retry e depois em dead letter.

### S26 · Campanhas de marca, insights e faturamento B2B
**Referência:** telas B2B06-Campanhas, B2B07-NovaCampanha, B2B08-Insights, B2B09-Faturamento, Admin16-Campanhas.
**Prompt:**
> Campanhas de sugestão de produto com CPM ou CPC, sempre marcadas como patrocinadas e bloqueadas quando conflitam com alerta Procon: marca exigida pela escola não pode ser substituída. Aprovação obrigatória no admin. Insights agregados com k-anonimato: célula abaixo de k fica oculta. Faturamento B2B com extrato.

**Aceite:** testes de k-anonimato e de bloqueio Procon.

### S27 · Site público e páginas de sistema
**Referência:** telas Landing, ComoFunciona, Sis01-LinkCurto a Sis07-Sobre, App14-EscolaPublica, App14b-EscolaEstados.
**Prompt:**
> Landing, como funciona, sobre, termos e privacidade (com placeholders jurídicos, sem afirmar conformidade), link curto da lista com QR, página de redirecionamento para loja, 403 e 404. SEO e Open Graph.

### S20 · Produção e suíte E2E final
**Prompt:**
> Rodar as migrations em staging e depois em produção. Suíte agent-browser completa cobrindo os fluxos pai, escola, admin e papelaria. Checklist de go-live em `docs/GO-LIVE.md`. Importar o CSV oficial em produção e registrar a contagem real.

## Ordem de execução (escopo completo, ADR-002 rejeitado)
1. S00, S01, S02.
2. Em paralelo: [S03, S04, S05, S06], [S07, S08, S09, S10] e [S12, S13, S14].
3. S11.
4. Em paralelo: [S21, S22, S23] e [S24, S25, S26].
5. S15, S16, S27.
6. S17, S18, S19.
7. S20 por último.

Toda fatia usa as telas de `docs/design/` como referência visual obrigatória. O mapa está em `docs/design/SCREENS.md`.
