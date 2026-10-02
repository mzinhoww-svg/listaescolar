# S28 · Excelência de produto e design · Design Spec

- **Data:** 28/09/2026
- **Status:** aprovado em modo autônomo (ADR-006 e PLAN.md, S28: "registre o spec resultante como Ruling"). Nenhum humano foi consultado; as decisões estão no `docs/superpowers/ledger.md`, seção "S28".
- **Produto:** ListaCerta, `main` em `1b9fb28` (S00 a S18 e S21 a S27 mescladas ou concluídas).
- **Entradas:** `docs/MELHORIAS.md` (diagnóstico e top 15), `docs/superpowers/evidencias/S28/antes/` (Lighthouse, axe, capturas), ADR-006, ADR-007 (aprovada pelo humano em 28/09/2026, plano gratuito), `docs/tracking-plan.md`.
- **Caminho da skill de brainstorming:** arquitetural (mexe em várias áreas, cria um subsistema de instrumentação e uma migration). Como o modo é autônomo, as perguntas que a skill mandaria fazer ao humano foram respondidas na seção 2.

## 1. Entendimento (escrito de volta e conferido com o PLAN)

**Resultado pretendido.** Entrar em produção com o piloto de Cuiabá sabendo, por medição, que a família consegue chegar da mensagem de WhatsApp à lista e à cotação sem tropeçar; que a escola sabe o próximo passo; que a papelaria chega ao primeiro lead; e que o custo de IA por lista e as consultas lentas estão dentro do orçamento. A marca não muda; muda a aplicação dela e a clareza dos textos.

**Para quem.** Primeiro a mãe ou o pai no celular, em 4G, vindo de um grupo de WhatsApp (hipótese da pesquisa, ADR-005). Depois a escola, a papelaria, o parceiro B2B e a equipe admin.

**Sucesso (do PLAN e da ADR-006, todos mensuráveis).**
1. `docs/MELHORIAS.md` e `DESIGN.md` mesclados; top 15 implementado ou com Ruling de adiamento.
2. Lighthouse mobile ≥ 90 em desempenho e acessibilidade nas páginas principais (início, busca, lista, carrinho, login, painel da papelaria, landing).
3. axe sem violações sérias ou críticas nas mesmas páginas.
4. E2E com screenshots de antes e depois (o "antes" já está em `evidencias/S28/antes`).
5. Custo de IA por lista medido e registrado no `PROGRESS.md`, abaixo de R$ 0,50.
6. Instrumentação PostHog (ADR-007) entregue e desligada sem chave.

**Restrições herdadas.** Marca fechada (Tinta, Papel, Verde Certo, Verde Fundo, Plus Jakarta Sans); nenhum dado inventado; nenhum dado de menor nem do responsável nos eventos; sem dependência pesada sem Ruling; `prefers-reduced-motion` respeitado; componentes de até 250 linhas; estados de loading, erro, vazio e sucesso; migration só com RLS.

**Suposições (não confirmadas por humano).** (a) O piloto é 100% celular. (b) Sem fonte de preço de varejo no piloto, a cotação por papelaria é o caminho de compra que efetivamente funciona. (c) Login por link mágico continua sendo o único método até haver credencial do Google (D-042). (d) A pesquisa com mães ainda não tem amostra; as hipóteses dela são recalibradas com 100 respostas.

## 2. Perguntas da skill, respondidas de forma autônoma

| Pergunta que a skill faria ao humano | Resposta e fonte |
|---|---|
| Qual é o problema real, e para quem? | Perder gente entre a mensagem de WhatsApp e a cotação. Família primeiro (PLAN, ADR-006, pesquisa). |
| O que é "excelência" aqui? | O que a ADR-006 mede: Lighthouse ≥ 90, axe limpo, custo de IA < R$ 0,50, top 15 entregue com antes e depois. |
| Onde a família mais provavelmente desiste? | No login para montar carrinho ou cotar (F5), no carrinho com opções "indisponível" (F6), na foto acima de 4 MB (F8) e na busca vazia (F2). Fonte: código da `main` e demonstração local (`MELHORIAS.md`, seção 2). |
| Posso trocar a marca ou o logo? | Não (CLAUDE.md, ADR-006). |
| Posso adicionar dependências pesadas? | Não sem Ruling. Decisão: PostHog sem SDK (cliente mínimo de `fetch`), redução de foto com `canvas`, animação só com CSS. |
| O PostHog entra na S28 ou na S19? | Na S28: Ruling do orquestrador (a ADR-007 previa a S19 e a S19 ainda não foi mesclada). Aprovado pelo humano em 28/09/2026, plano gratuito. |
| Que dado pode ir ao PostHog? | Só identificadores pseudônimos: uuid do perfil no `distinct_id` após login, INEP, slug da série, IBGE, buckets. Nunca nome, e-mail, telefone, apelido ou série de estudante, texto livre, conteúdo de lista, IP, valores em dinheiro (ADR-007, tracking-plan). |
| Vale replay de sessão? | Não no piloto. O cliente mínimo não faz replay. Reduz o risco de dado pessoal e o peso no celular. Custo se estiver errado: adicionar o SDK adiado depois, atrás da mesma camada de consentimento. |
| Como medir custo de IA sem inventar preço? | Guardar o uso real devolvido pelo provedor (tokens e, quando o OpenRouter informa, o custo em dólar) e converter para reais só com uma taxa configurada em `ai_settings`; sem taxa, o relatório mostra dólar e "BRL indisponível". |
| O que o orçamento de consulta lenta significa? | p95 ≤ 100 ms local para leituras públicas quentes e nenhuma leitura quente com Seq Scan sobre tabela grande sem justificativa registrada (D-019 é a exceção conhecida). |
| Algum item exige ação que só o humano faz? | Sim, e ficam fora: código de 6 dígitos (template do e-mail hospedado), WhatsApp para papelaria (credencial e gasto), preço de varejo por afiliado, chave de produção do PostHog. Vão para "Aguardando humano" (seção 8). |
| Posso mudar regra de negócio? | Não. Mudança de texto, ordem, estado e apresentação apenas. Exceções (M04 módulo de redução de foto, M06 leitura de escolas com lista) são código novo sem alterar regra existente. |

## 3. Abordagens consideradas

**Instrumentação (M01).**
- **A. `posthog-js` com carregamento adiado.** Completo (autocaptura, flags, replay), mas pesa dezenas de KB no celular em 4G, captura por autocaptura texto de tela (risco de dado pessoal) e exige configuração de máscara.
- **B. Cliente mínimo próprio para a API de captura do PostHog, via `/ingest`.** Poucos KB, só envia o que o esquema Zod permite, desliga sozinho sem chave, sem autocaptura. Perde replay e flags, que a ADR-007 trata como opcionais. **Recomendada.**
- **C. Tabela própria no Supabase.** Rejeitada pela ADR-007.

**Ordem do trabalho.**
- **A. Auditoria, sistema, refinamento e implementação em sequência (como o PLAN).** **Recomendada.** As auditorias alimentam `DESIGN.md`, que orienta o refinamento.
- **B. Implementar o top 15 direto.** Mais rápido, mas sem `DESIGN.md` as áreas divergem de novo.

## 4. Design

### 4.1 Fases e como as skills entram

1. **Diagnóstico** (esta fatia, feita): `MELHORIAS.md`, spec, plano, medição "antes".
2. **Auditoria (`/impeccable`, audit e critique):** ordem família (mobile primeiro), papelaria, escola, admin, B2B, site. Comparar com `docs/design`. Saída: achados com severidade em `docs/superpowers/evidencias/S28/auditoria-<area>.md`; o que for bloqueio do top 15 vira task; o resto vai para `MELHORIAS.md`.
3. **Sistema (`/design-intelligence`):** `DESIGN.md` com tokens `lc-*`, componentes, formulário, feedback, movimento e o que a marca proíbe.
4. **Refinamento (`/tripled-ui`):** landing, como funciona, onboarding da família, lista pronta, pedido enviado, vazios. Blocos adaptados aos tokens, CSS e `prefers-reduced-motion`; nenhuma dependência nova.
5. **Implementação do top 15** por tasks pequenas com TDD onde houver lógica; PostHog; custo de IA e consultas.
6. **Depois:** o mesmo script de medição, comparação e revisão Opus de UX e acessibilidade.

### 4.2 PostHog (M01)

- **Módulo `lib/analytics/`**: `schema.ts` (Zod por evento, `strict`, sem campos de texto livre), `sanitize.ts` (descarta propriedade fora do esquema; recusa valor com formato de e-mail, telefone ou CPF; tamanho máximo), `client.ts` (cliente de navegador mínimo, fila em memória, `sendBeacon` no `pagehide`), `server.ts` (`server-only`, `fetch` direto ao host, disparado com `after()` para não atrasar a resposta), `consent.ts` (estado de consentimento), `config.ts` (lê `NEXT_PUBLIC_POSTHOG_KEY` e `NEXT_PUBLIC_POSTHOG_HOST`; sem chave, `enabled = false`).
- **Sem chave, nada acontece:** nenhuma requisição, nenhuma alocação de fila, nenhum `script`.
- **Proxy `/ingest`:** `rewrites` em `next.config.ts` de `/ingest/:path*` para o host do PostHog (variável de ambiente lida em build; sem chave, sem rewrite). O proxy não repassa cookie do app.
- **Consentimento (Ruling de leitura da ADR-007):** antes de qualquer escolha, o cliente envia só eventos anônimos com `distinct_id` em memória (um id por carregamento), sem cookie, sem `localStorage`, `$process_person_profile: false`, sem `identify` e sem endereço de IP guardado (o proxy `/ingest` não repassa o IP do visitante). Um aviso discreto e não bloqueante ("Ajude a melhorar o ListaCerta: medir o uso sem dados pessoais", aceitar ou recusar) grava a escolha; só depois do aceite o id passa a persistir e o `identify` fica liberado. **Recusa e revogação desligam o envio** (`opt_out` e `reset`). A escolha fica em `localStorage` (só depois de decidida) e, para quem está logado, também em `consents` (finalidade `analytics`, versão do texto) se a S17 permitir a finalidade sem migration; senão só no navegador. A frase "nada é enviado antes do consentimento" do texto proposto para a S19 é lida como "nada persistente e nada identificável"; quem quiser a leitura estrita muda um valor em `config.ts` (`sendBeforeConsent = false`).
- **Identificação:** `identify` no login concluído e no envio com telefone, sempre com o uuid do perfil; nunca telefone ou e-mail. `reset` no logout.
- **Eventos:** os 13 do `tracking-plan.md`, mais os que os itens do top 15 pedem e que respeitam as mesmas regras: `login_started`, `login_completed` (sem e-mail), `list_shared` (canal), `cart_options_viewed` (contagem de opções com preço), `stationery_onboarding_step` (passo do checklist). Cada um entra no `tracking-plan.md` na mesma task.
- **`is_internal`:** verdadeiro para `@listacerta.test`, `.invalid`, `source_group='e2e-teste'` e qualquer `app_env` diferente de `production`.
- **Eventos de servidor** (`ocr_completed`, `list_auto_approved`, `list_published`, `lead_received`, `lead_converted`, `catalog_activated`): disparados após o fato gravado no banco; falha do PostHog nunca falha a Server Action.
- **Teste de contrato:** varre todos os call sites, valida o esquema e falha com propriedade fora do esquema ou com valor que parece dado pessoal. E2E: com chave falsa apontando para um receptor local, nada chega antes do aceite.

### 4.3 Custo de IA por lista e consultas lentas (M02)

- **Migration `0800_s28_ai_usage.sql`** (aditiva): colunas `prompt_tokens`, `completion_tokens`, `total_tokens`, `provider_cost_usd_micros` (nulas quando o provedor não informa), em `ai_decisions`; chave `usd_brl_rate` em `ai_settings` (nula por padrão); função ou view `ai_cost_per_list` (soma por `entity_id` da submissão). RLS mantida; nada novo para `authenticated`.
- **Captura:** o roteador (`supabase/functions/_shared/ai/router*.ts`) já soma `usage`; passa a repassar ao recorder (`recorder.ts`) e o OpenRouter é chamado com `usage: { include: true }` para trazer o custo real. Sem nome de modelo no código.
- **Relatório:** `scripts/s28-custo-ia.ts` executa N listas de demonstração com o provedor real quando `OPENROUTER_KEY` está válida (D-077 registra que a chave do staging foi recusada; se o script não conseguir chamar, registra "indisponível" e usa o fake só para provar o cálculo). O custo por lista aparece em `/admin/ia` e no `PROGRESS.md`.
- **Consultas:** `scripts/s28-consultas.ts` sobe carga real de uso (as rotas principais), lê `pg_stat_statements` no banco local, roda `EXPLAIN (ANALYZE, BUFFERS)` das consultas quentes (busca de escolas, leitura de lista publicada, carrinho, lista de leads da papelaria) e grava `evidencias/S28/depois/consultas.md`. Correção: índice ou reescrita quando passar do orçamento, em migration aditiva `0801` se necessário.

### 4.4 Itens de produto e design

Os demais itens do top 15 estão em `docs/MELHORIAS.md`, seção 4, cada um com arquivos afetados e aceite. Regras comuns:
- Texto e ordem mudam; regra de negócio não.
- Todo estado novo tem teste de componente e captura de tela.
- Componentes novos de até 250 linhas; `pnpm check:sizes` verde.
- Nada de número, prazo, preço ou parceria sem fonte.

### 4.5 Medição

`scripts/s28-medir.mjs` mede o "antes" e o "depois" com o mesmo procedimento (build de produção local, dados de demonstração, mediana de 3 Lighthouse, axe com tags WCAG 2.2 AA e boas práticas, capturas 390×844). A comparação entra em `docs/superpowers/evidencias/S28/comparacao.md` e no PR.

## 5. Testes

- Vitest: esquema e sanitização de eventos, consentimento, redução de foto, cálculo de custo, textos críticos, estados novos.
- `pnpm test:db`: migration `0800` (colunas, view, privilégios, RLS).
- E2E com agent-browser na build local (e no preview quando houver): fluxos família, escola, papelaria, com capturas antes e depois; verificação de que nada é enviado ao PostHog antes do consentimento.
- Gate por task: `pnpm typecheck && pnpm lint && pnpm test`; gate da fatia adiciona `pnpm db:reset && pnpm test:db && pnpm build`.

## 6. Riscos e custo se a decisão estiver errada

| Risco | Mitigação | Custo se errar |
|---|---|---|
| Cliente mínimo sem replay não atende o fundador | Camada de consentimento e esquema são compatíveis com o SDK; trocar a implementação de `client.ts` | Um dia de trabalho para adicionar o SDK adiado |
| Refino visual mexe em telas testadas | E2E antes e depois, testes de texto atualizados na mesma task | Regressão pontual, revertida por commit |
| Meta de Lighthouse ≥ 90 exige remoção de recurso (por exemplo, Sentry no cliente) | Ruling por recurso, com carregamento adiado antes de remover | Perda de visibilidade de erro no navegador |
| Custo real de IA acima de R$ 0,50 por lista | Roteamento para modelo mais barato por configuração, limiar de escalonamento | Mais revisão humana ou mudança de modelo por variável de ambiente |
| Chave da OpenRouter recusada no staging (D-077) impede medir custo real | Medir localmente com chave válida se houver; senão registrar "indisponível" e provar o cálculo com o provedor falso | Custo real só conhecido no piloto |

## 7. Fora do escopo

Itens marcados "Pós-piloto" em `docs/MELHORIAS.md`; troca de marca; novo provedor de pagamento; SEO de listas reais; app nativo; regra de preço, de cobrança ou de conversão.

## 8. Ações que só o humano pode fazer (vão para "Aguardando humano" no `PROGRESS.md`)

- Criar os projetos PostHog (staging/preview e produção) e cadastrar `NEXT_PUBLIC_POSTHOG_KEY` e `NEXT_PUBLIC_POSTHOG_HOST` na Vercel.
- Definir `usd_brl_rate` em `ai_settings` (dado de negócio) e confirmar a chave da OpenRouter no staging (D-077).
- Alterar o template do e-mail de acesso no Supabase hospedado se o código de 6 dígitos for adotado depois (M16).
- Aplicar migrations `0800` e `0801` no staging, se o classificador barrar (ADR-003 permite; registrar se barrado).
