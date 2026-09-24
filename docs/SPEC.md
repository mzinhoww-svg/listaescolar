# SPEC-3: ListaCerta, produto completo (decisões definitivas)

Data: 2026-09-24 · Decisões fechadas: **Arquitetura A** · **Repo novo + Supabase do zero** · **Marca ListaCerta**. Não reabrir.

## 1. Stack
- **Front e servidor:** Next.js App Router (versão estável atual), TypeScript strict, Tailwind com tokens da marca, Zod, React Hook Form. Componentes com até 250 linhas.
- **Supabase (dois projetos: staging e produção):** Postgres com RLS, Auth, Storage, Edge Functions e Queues (pgmq). Migrations SQL versionadas, chaves com `gen_random_uuid()`.
- **Deploy:** Vercel, com preview por PR.
- **Testes:** Vitest para domínio e serviços; agent-browser para E2E por fatia.
- **Observabilidade:** Sentry, logs do Supabase e tabela `ai_decisions`.

## 2. Princípios
1. A plataforma não vende. Organiza a informação, compara, gera leads e redireciona.
2. **Nada inventado.** Preço, estoque, prazo, métrica, parceria, dado de escola ou regulatório só com origem registrada. Sem origem, a interface mostra "indisponível".
3. Dado demonstrativo tem a flag `is_demo = true` e selo visível "Demonstração".
4. Toda decisão automatizada é auditável.
5. Mínimo de dados de menor. Nunca nome completo de criança em telas demonstrativas: usar "Estudante 1" ou "Aluno do 4º ano".

## 3. Perfis (tabela `profiles.role` + tabelas de vínculo)
`parent`, `school_member`, `admin`, `stationery_member`, `system` (service role, só no servidor). Função `auth_role()` SECURITY DEFINER usada nas políticas RLS.

## 4. Estados canônicos (enums Postgres)

**Escola**, com dois eixos independentes: `registry_source` e `verification_status`.
- `verification_status`: `registered`, `claimed`, `verified`, `suspended`.
- A situação da lista é derivada: sem lista, lista pendente, aprovada, publicada.
- Escola importada do INEP nasce `registered`, não reivindicada e não verificada. **Cadastro INEP não é verificação.**

**Reivindicação** (`claim_status`): `submitted`, `awaiting_verification`, `token_expired`, `insufficient_evidence`, `rejected`, `approved`.
- Método: `institutional_email`, `institutional_whatsapp` ou `documents`.
- Aprovada, torna a escola `verified` e exibe o selo "Escola verificada".

**Lista** (`list_status`): `draft`, `submitted`, `processing`, `processing_async`, `review_needed`, `human_review`, `approved`, `published`, `archived`, `rejected`.
- Listas enviadas começam como candidatas e nunca aparecem como oficiais.
- Publicada exige escola, série, ano letivo e versão.
- Arquivada nunca aparece como a versão atual.

**Papelaria** (`stationery_status`): `signup`, `accreditation`, `under_review`, `approved`, `active`, `paused`, `suspended`, `rejected`.

**Lead** (`lead_status`): `received`, `viewed`, `in_progress`, `quote_sent`, `awaiting_customer`, `converted`, `declined`, `expired`, `cancelled`.

**Job** (`job_status`): `queued`, `running`, `succeeded`, `failed`, `retrying`, `dead`.

## 5. Modelo de dados (núcleo)

**Localização**
- `municipalities`: IBGE, UF, nome, `is_enabled`. A expansão para outras cidades é só dado, sem mudança estrutural.

**Escolas**
- `schools`: INEP único, nome e nome normalizado, rede, bairro, endereço, contatos, município, `verification_status`, `source_batch_id`, `is_demo`.

**Importação**
- `import_batches`: arquivo, hash, origem, totais, status, `imported_by`, datas.
- `import_rows`: linha bruta, normalizada, erros, ação (inserida, atualizada, duplicada, rejeitada).

**Séries e listas**
- `grades`: catálogo de séries.
- `school_lists`: escola, série, ano letivo, status, versão atual.
- `list_versions`: versão, itens, publicada em, arquivada em.
- `list_items`: nome original, nome normalizado, categoria, quantidade, unidade, confiança, alertas.

**Envios e processamento**
- `list_submissions`: quem enviou, origem (pai ou escola), arquivo no Storage, consentimento.
- `ocr_jobs` e `jobs`: fila espelhada com status, tentativas e último erro.
- `ai_decisions`: entidade, modelo, provedor, versão do prompt, versão do pipeline, score geral, scores por item, alertas, decisão, justificativa, usuário, versão anterior e nova, timestamps.
- `prompt_registry`: chave, versão, texto, schema Zod serializado, ativo.
- `ai_settings`: limiares de confiança, alertas críticos, rotas de modelo.

**Reivindicações**
- `claims`, `claim_tokens` (hash + expiração), `claim_evidence` (Storage privado).

**Famílias**
- `students`: apelido e série, sem sobrenome nem nascimento.
- `saved_lists`.

**Carrinho**
- `carts`: estratégia, snapshot de preços com origem e `checked_at`.
- `retailers`, `affiliate_clicks`.

**Papelarias**
- `stationeries`, `stationery_members`, `stationery_areas` (bairros), `catalog_items` (preço com `updated_at` e origem "informado pela papelaria").

**Leads**
- `leads`: código `LC-XXXX`, lista, papelaria, status, `expires_at`.
- `lead_events`.

**Transversais**
- `notifications`, `push_subscriptions`, `notification_preferences`.
- `consents`: finalidade, versão do texto, concedido e revogado em.
- `retention_policies`, `audit_log` (ator, ação, entidade, antes e depois, IP em hash).
- `reports` (denúncias).

## 6. Fluxos críticos

**OCR**
1. Upload para bucket privado. O servidor cria `list_submission`.
2. A Server Action chama o pipeline com orçamento de **10 s**.
3. Se concluir, devolve o resultado.
4. Se não concluir, enfileira no pgmq e devolve `job_id` com status `processing_async`. A interface oferece "continuar aguardando", ativar notificação do navegador e informar e-mail ou WhatsApp (canal opcional).
5. O worker em Edge Function consome a fila de forma idempotente por `job_id`, com retry exponencial e dead letter.

**Decisão automática**
- Publica sozinha só se todas as condições forem verdadeiras:
  - score geral maior ou igual ao limiar;
  - nenhum alerta crítico;
  - nenhum item pendente;
  - campos obrigatórios completos;
  - escola, série e ano válidos.
- Qualquer falha manda para `human_review`.
- Cada decisão grava uma linha em `ai_decisions`.

**Alertas**
`low_confidence_item`, `ambiguous_item`, `handwritten`, `possible_collective_item`, `restrictive_brand_or_spec`, `text_document_mismatch`, `invalid_school_grade_year`. Os que são críticos fica configurável em `ai_settings`.
- Os alertas `possible_collective_item` e `restrictive_brand_or_spec` são sinalizações para revisão. Não são parecer jurídico.

**Roteamento de IA**
- `OcrProvider` e `LlmProvider` são interfaces; implementações para DeepSeek, GLM e um modelo de visão barato.
- O roteador tenta o provedor barato. Escala para o forte se:
  - a saída falhar na validação Zod;
  - a confiança ficar abaixo do limiar;
  - houver timeout.
- Trocar de provedor é configuração, não mudança de regra de negócio.

**Carrinho**
- Quatro opções: menor preço total, menor número de lojas, equilíbrio (preço, disponibilidade, prazo, conveniência) e papelaria local.
- Cada opção mostra:
  - valor dos produtos, frete e prazo;
  - número de lojas e disponibilidade;
  - data, hora e origem do preço;
  - aviso de que preço e estoque podem mudar;
  - selo de link afiliado.
- Sem fonte de preço, a opção aparece como indisponível.

**Cotação por WhatsApp**
- Mensagem via `wa.me` contendo só: código do lead, escola, série, ano e link da lista.
- Nunca vai: nome completo, CPF, nascimento, endereço ou qualquer dado de menor.
- Consentimento explícito antes de abrir o WhatsApp.

## 7. MVP e fases
- **MVP:** seção 8 do prompt do responsável.
- **Fase 2 (não construir agora):** assinatura, comissão automática, integração profunda com marketplaces, estoque em tempo real, app nativo, analytics avançado, fidelidade, expansão de municípios, conciliação financeira.
- **Preparado sem construir:** eventos de conversão registrados em `lead_events` e `affiliate_clicks`, para cálculo futuro.
- Mudança de escopo exige registro em `docs/decisions/` com impacto técnico, impacto financeiro e prioridade.

## 8. Critérios de pronto (toda fatia)
1. Migrations aplicáveis do zero.
2. RLS testada por perfil.
3. Vitest verde.
4. `tsc` sem erro.
5. Lint verde.
6. Componentes com até 250 linhas.
7. Estados de loading, sucesso, erro, vazio e retry.
8. E2E com agent-browser no preview da Vercel.
9. Sem dado inventado.
10. PR com checklist.
