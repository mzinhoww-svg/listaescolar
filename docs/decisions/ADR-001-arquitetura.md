# ADR-001: Arquitetura do Lista da Escola (ListaCerta)

Status: **aguardando escolha** · Data: 2026-09-24 · Autor: tech lead (Claude)

Custos em USD são referências de tabela pública dos fornecedores; confirmar no site oficial antes de contratar. Custos de IA dependem de volume real, que ainda não existe.

## 1. Contexto e conflitos encontrados

- O repo `lista-certa-ia` já entregou LC-001 a LC-009 em **React 18 + Vite + Lovable Cloud (Supabase)**, com 25 migrations e 8 Edge Functions.
- O `CLAUDE.md` proíbe trocar a stack sem permissão e manda apontar conflitos antes de agir. O novo prompt pede **Next.js App Router**. Isso exige decisão explícita.
- O `CLAUDE.md` veta testes formais no MVP. O novo pedido exige entrega "validada e testada" com agent-browser. A decisão proposta: Vitest para regras de negócio e agent-browser para E2E. O CLAUDE.md é atualizado junto.
- A IA atual usa cadeia Gemini fixa. O novo pedido exige adapters trocáveis (GLM, DeepSeek e equivalentes).
- A marca no repo e no canvas é **ListaCerta**. O prompt usa **Lista da Escola**.
- A base atual importou o INEP nacional (~181 mil escolas). O novo escopo pede importação por CSV de Cuiabá, com a contagem real obtida só depois da validação.

## 2. As três arquiteturas

### A. Next.js (Vercel) + Supabase completo, jobs no próprio Postgres
- Frontend e BFF em Next.js App Router com Server Components e Server Actions, em TypeScript, Tailwind e Zod.
- Supabase fornece Postgres com RLS, Auth, Storage e Edge Functions.
- Fila e jobs: Supabase Queues (pgmq) com pg_cron. Worker em Edge Function consome a fila.
- IA atrás de adapters (`OcrProvider`, `LlmProvider`). O roteamento é por regra de custo e confiança, via OpenRouter ou chamada direta.
- Notificações: Web Push (VAPID) no MVP. E-mail (Brevo ou Resend) e WhatsApp vêm depois.
- WhatsApp da papelaria: link `wa.me` com código do lead, sem API da Meta no MVP.

### B. Manter React + Vite (Lovable) + Supabase e evoluir o repo atual
- Mesmo backend de A, sem migrar o frontend.
- Páginas públicas de escola continuam como SPA: pré-render parcial ou SEO fraco.

### C. Next.js + backend dedicado + serviços gerenciados de workflow
- Next.js no Vercel, com a API em um serviço Node separado (Fly, Railway ou Render).
- Workflows em Inngest ou Trigger.dev, e Redis gerenciado.
- Postgres continua sendo Supabase ou Neon. Auth continua Supabase Auth ou Clerk.
- Storage em R2 ou S3.
- Observabilidade de LLM com Langfuse.

## 3. Comparação por critério

| Critério | A | B | C |
|---|---|---|---|
| Custo fixo no piloto | Baixo: Vercel Hobby/Pro (Pro US$ 20/usuário/mês) + Supabase Free/Pro (Pro US$ 25/mês) | Menor: só o que já existe (Lovable + Supabase) | Médio: soma 4 a 6 fornecedores, cada um com plano próprio |
| Complexidade | Média | Baixa | Alta |
| Riscos | Migração do frontend; limites de tempo das Edge Functions para OCR longo | SEO das páginas de escola; dívida acumulada; conflito permanente com o novo prompt | Mais peças para operar; custo cresce antes do uso |
| Tempo de implementação | Médio: rewrite do frontend, backend reaproveitado | Curto | Longo |
| Dependências externas | Vercel, Supabase, provedores de IA | Lovable, Supabase, provedores de IA | Vercel, host Node, Redis, Inngest/Trigger, Supabase/Neon, Langfuse |
| Adequação ao piloto | Alta | Alta no curto prazo, baixa para SEO e manutenção | Baixa: excesso para Cuiabá |
| Evolução | Alta: troca de fila ou worker isolada atrás de interface | Média | Muito alta |

## 4. Decisão por dimensão (proposta dentro de A)

| Dimensão | Opção A (recomendada) | Alternativa B | Alternativa C |
|---|---|---|---|
| Frontend | Next.js App Router, RSC, Tailwind, Zod, componentes com até 250 linhas | Vite SPA atual | Next.js com API separada |
| Backend | Server Actions e Route Handlers + Edge Functions para jobs | Só Edge Functions | Serviço Node dedicado |
| Banco | Supabase Postgres + RLS, migrations SQL com `gen_random_uuid()` | Igual | Neon ou Supabase |
| Autenticação | Supabase Auth (Google + e-mail mágico), perfis por tabela `profiles.role` | Igual | Clerk |
| Storage | Supabase Storage, buckets privados, URL assinada de curta duração | Igual | R2 ou S3 |
| OCR | Adapter `OcrProvider`. Primário: modelo de visão barato. Fallback: OCR dedicado (Google Vision ou equivalente) | Gemini atual | Serviço OCR dedicado |
| Síncrono até 10 s | Server Action com timeout de 10 s; ao estourar, cria job na fila e devolve `job_id` | Edge Function com timeout | Workflow gerenciado |
| Filas e jobs | Supabase Queues (pgmq) + pg_cron + worker em Edge Function, com idempotência por `job_id` | Tabela de jobs + cron | Inngest/Trigger.dev + Redis |
| Notificações | Web Push (VAPID) no MVP; e-mail depois; WhatsApp só por opt-in | Toast + e-mail | Serviço gerenciado (Knock ou OneSignal) |
| IA de extração e normalização | Adapter `LlmProvider` com saída validada por Zod; prompts versionados em tabela | Gemini fixo | Igual A, com Langfuse |
| Modelos baratos | DeepSeek e GLM como padrão de normalização; um modelo de visão barato para OCR; um modelo mais forte só no fallback | Gemini | Igual A |
| Roteamento | Regra por tarefa: barato primeiro, escala para o forte se a confiança ficar abaixo do limiar ou a validação Zod falhar | Cadeia fixa | Roteador gerenciado |
| Observabilidade | Sentry + logs do Supabase + tabela `ai_decisions` (modelo, versão do prompt, versão do pipeline, scores, alertas, timestamps) | Logs do Supabase | Datadog + Langfuse |
| Segurança | RLS por perfil, service role só no servidor, rate limit em upload e OCR, antivírus opcional no upload | Igual, sem SSR | Igual + WAF |
| LGPD | Dados de menor mínimos (apelido/série), consentimento versionado, revogação, retenção de documentos configurável, trilha de auditoria | Igual | Igual |
| Links de afiliado | Serviço `AffiliateLinkBuilder` por varejista + rota `/ir-para` com registro de clique | Atual | Igual A |
| Marketplaces | Adapter `RetailerProvider` por varejista; preço sempre com origem, data e hora da consulta | Atual | Igual A |
| WhatsApp da papelaria | `wa.me` com mensagem gerada e código do lead; API da Meta só na fase 2 | Igual | API oficial desde o início |
| Implantação | Vercel (preview por PR) + Supabase com um projeto (produção) + Supabase local para dev | Lovable | Vercel + host Node + serviços |

## 5. Recomendação: A

- Atende todos os requisitos do prompt (Next.js, Supabase, adapters, 10 s síncrono com fallback, auditoria de decisão de IA).
- Reaproveita o que já funciona: schema, RLS, Edge Functions e a lógica de carrinho viram base de migração.
- Custo fixo baixo e um único banco para operar no piloto.
- A fila fica no Postgres. Se o volume crescer, a troca para Inngest ou similar fica isolada atrás da interface `JobQueue`, sem mexer na regra de negócio.

## 6. Decisões pendentes do responsável

1. Arquitetura: A, B ou C.
2. Repositório: novo repo Next.js reaproveitando o Supabase atual, migração no mesmo repo, ou novo projeto Supabase do zero.
3. Marca: ListaCerta ou Lista da Escola.

Depois da escolha, a decisão é tratada como definitiva e não volta a ser perguntada.
