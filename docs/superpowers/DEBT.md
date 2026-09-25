# DEBT · dívida técnica consolidada

Lista única e sem duplicatas da dívida registrada em `ledger.md`, `ledger-dados.md`, `ledger-pipeline.md`, `ledger-comercio.md`, nos planos (`plans/`) e nos relatórios E2E (`e2e/`). Levantamento feito em 2026-09-25; atualizado sobre `main` em `b905cce` (S09 e S27 mescladas). Dívida de branches abertas (S10) entra quando forem mescladas.

**Regras**
- Um item por problema. Quando o mesmo problema aparece em mais de um ledger, a coluna "Origem" lista todas as fontes.
- Severidade: **alta** = risco de segurança, de LGPD ou de dado errado em produção, ou bloqueio do go-live; **média** = defeito ou limite que o usuário percebe, ou custo operacional relevante; **baixa** = legibilidade, cópia de texto, flakiness de teste, escala futura.
- "Dono" é a fatia que paga a dívida. "Humano" indica uma ação que só o humano executa (ver PROGRESS.md).
- Go-live (S20): nenhum item **alta** pode estar `aberta` sem Ruling explícito no `ledger.md`.
- Ao pagar um item: marcar `resolvida em <PR/branch>` e manter a linha.

## Segurança

| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-001 | ledger-comercio S14 plano; PLAN S19 | Sem rate limit por IP em upload, OCR, login e leads (hoje só limites por usuário no banco) | alta | S19 | aberta |
| D-002 | ledger-pipeline S07 onda final | Envio de lista pela escola usa `profiles.role = school_member` sem conferir o vínculo em `school_members`; uma escola pode enviar em nome de outra (a revisão humana antes de publicar cobre o intervalo) | alta | S11 | aberta |
| D-003 | ledger.md (S01, itens adiados) | S01: `created_at` mutável (sem trigger), guard de papel sem `current_user`/SECURITY DEFINER, políticas permissivas múltiplas (advisor), triggers de auditoria supõem `id` uuid, sem FORCE RLS | média | S19 | aberta |
| D-004 | ledger.md (S01) | `auth_role()` executável por anon como RPC e ramos `system` inertes nas políticas `to authenticated` | baixa | S19 | aberta |
| D-005 | ledger.md (S02) | Erros do provedor de auth e do exchange sem registro no Sentry (sem PII) | média | S19 | aberta |
| D-006 | ledger-dados S06 revisão final | Aprovar reivindicação é terminal e imediato, sem tela de confirmação; clique errado do admin exige correção manual no banco | média | S16 | aberta |
| D-007 | ledger-dados S06 T1 revisão | `schools_guard_verification` bloqueia `claimed/verified -> suspended` por admin; falta função de suspensão (SECURITY DEFINER do dono) | média | S16 | aberta |
| D-008 | ledger-dados S06 revisão final | Token do link de e-mail da reivindicação vai na query da URL e aparece em logs de acesso (aceito: uso único, expira, exige sessão); mover para POST/fragmento | baixa | S19 | aberta |
| D-009 | ledger-comercio S14 T2 | `CRON_SECRET` com `min(16)` em `lib/env.ts` derruba o boot com segredo curto, enquanto o contrato da rota é 503 | baixa | S19 | aberta |
| D-010 | ledger-comercio S12 T2 | Trava fail-closed do demo de varejistas depende de `VERCEL_ENV`; deploy fora da Vercel sem a variável precisa ser documentado | baixa | S20 | aberta |
| D-011 | ledger-dados S04 T2 / T1 rodada 1 | `grant select on schools to anon` de tabela inteira expunha `email` | média | S04 | resolvida em S04 (grants por coluna na 0102) |

## Dados e LGPD

| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-012 | ledger-dados S06 (dívida e plano) | Sem exclusão/retenção de evidências e tokens de reivindicação (bucket `claim-evidence`, `claim_tokens`) | alta | S17 | aberta |
| D-013 | ledger.md (S01) | `audit_log` imutável remove só as colunas sensíveis listadas por tabela; ampliar a lista a cada tabela nova com PII (LGPD) | média | S17 | aberta |
| D-014 | ledger-comercio S14 plano | `lead_events.actor_id` e dados do solicitante sem rotina de anonimização na exclusão de conta | média | S17 | aberta |
| D-015 | ledger-comercio S14 revisão final | Texto de consentimento do lead não mostra o bairro que será enviado ("Bairro enviado: X") nem cita o evento `whatsapp_opened` visível à papelaria | média | S17 | aberta |
| D-016 | ledger-dados S06 plano | Aceite de privacidade da reivindicação fica em `claims.privacy_ack_at` e não em `consents` | baixa | S17 | aberta |
| D-017 | ledger-dados S06 revisão final | Falha em `claim_add_evidence` depois do upload deixa objeto órfão no Storage (limpeza best-effort); falta varredura | baixa | S17 | aberta |
| D-018 | ledger-pipeline S07 T3 | Worker com pipeline demo sobre envio de app sem pipeline deixava `is_demo` falso | média | S07 | resolvida em S07 (`jobs_complete` com `p_is_demo`) |

## Desempenho e escala

| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-019 | ledger-dados S04 T1 rodada 1 | `search_schools` sob RLS cai em Seq Scan (operadores trigram não leakproof); aceitável no piloto, inviável em escala nacional (~200 mil escolas): view materializada pública ou wrapper leakproof | média | S20 | aberta |
| D-020 | ledger-dados S04 T1 (nota) | Dois índices GIN trigram encarecem a carga do CSV nacional; recriar índice ou `fastupdate` na carga | baixa | S20 | aberta |
| D-021 | ledger-dados S05 | `list_items_sync_count` recalcula `count(*)` por linha (O(n²) em inserts grandes) e `list_status_events` não passa por `audit_row_change` | baixa | S20 | aberta |
| D-022 | ledger-dados S05 | `addItems` concorrente na mesma versão pode falhar com 23505 (posição duplicada); o chamador precisa repetir/serializar | média | S10 | aberta |
| D-023 | ledger-pipeline S07 onda final | Teto de upload web de 4 MB (limite da Vercel); falta upload direto ao Storage por signed upload URL | média | S11 | aberta |
| D-024 | ledger-pipeline S08 correção pontual | Margem de 500 ms não cobre `settings.load()` a frio + gravação da decisão; falta deadline único medido desde a entrada do pipeline | média | S19 | aberta |
| D-025 | ledger-pipeline S08 correção final | `ai_decisions` sem `job_id`: tentativas do síncrono e do worker se misturam por `entity_id` | média | S19 | aberta |
| D-026 | ledger-pipeline S07 onda final | Sem "kick" do worker: envio assíncrono espera até 1 min pelo pg_cron | baixa | S19 | aberta |
| D-027 | ledger-dados S03 | Lote preso em `processing` após queda dura só é retomado depois de 10 min; CSV parseado inteiro em memória (maiores exigem streaming) | baixa | S20 | aberta |
| D-028 | ledger-comercio S13 onda final | Limite de 5.000 candidatos da cotação local conta itens vencidos (a validade é aplicada depois, no domínio) | baixa | S20 | aberta |
| D-029 | ledger-comercio S14 T2 | `listCandidateStationeries` corta em silêncio acima do limite; mostrar "e mais N" ou paginar | baixa | S15 | aberta |

## UX, design e produto

| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-030 | ledger-pipeline S08 T3 / correção final; e2e/S08 | `cleanText` mutila trechos como "< 5 anos" nos itens extraídos (dado da lista alterado) | média | S10 | aberta |
| D-031 | ledger-pipeline S08; e2e/S08 | Tela de status decide "leitura indisponível" pelo ambiente e não pelas rotas de `ai_settings` | média | S18 | aberta |
| D-032 | ledger-pipeline S08 | Sem extração da camada de texto do PDF (`text_document_mismatch` só quando o modelo sinaliza) | baixa | S20 | aberta |
| D-033 | ledger-dados S05 | Lista e perfil sempre `noindex`; liberar indexação de lista real de escola `claimed/verified` | média | S27 | aberta |
| D-034 | ledger-dados S05 | Itens da lista não agrupados por categoria (a App05 agrupa) | baixa | S18 | aberta |
| D-035 | ledger-dados S06 (dívida, plano) | Convites de co-admin e telas Escola04, Escola05, Escola06 e Escola12 adiados | média | S16 | aberta |
| D-036 | ledger-comercio S13 onda final | Sem tela para o dono editar cadastro de papelaria `rejected` (razão social, CNPJ, contato) | média | S16 | aberta |
| D-037 | ledger-comercio S13 onda final | `recordConsent` sem tela; editar item do catálogo pelo nome cria item novo se o nome mudar | baixa | S16 | aberta |
| D-038 | ledger-comercio S14 T2 / T3 | Rótulo "últimos 7 dias" dos KPIs com janela rolante `WEEK_MS`; revisar o texto | baixa | S18 | aberta |
| D-039 | ledger-comercio S14 revisão final | `createLeadAction` perde papelaria/bairro no redirect de erro; `/cotacao` aberta a papéis que não criam lead; cartão mobile "valor enviado: indisponível"; item em falta como "fora do subtotal (em falta)"; tabela e cartões duplicados no HTML | baixa | S18 | aberta |
| D-040 | ledger-comercio S14 revisão final | Pap02 sem a coluna "Estimado" (exigiria consulta agregada de itens × catálogo) | baixa | S21 | aberta |
| D-041 | ledger-comercio S14 plano | Pap05-EnviarListas adiada (depende do upload da Pipeline e de créditos) | baixa | S21 | aberta |
| D-042 | ledger.md (S02) | `/entrar` mostra o link mágico abaixo dos termos (desvio da App02); reorganizar quando o Google OAuth for ativado | baixa | S18 | aberta |
| D-043 | ledger-dados S04 T3; ledger-dados S05 T3; ledger-comercio S12 T3 e S13; e2e/S04, S05 | Soft-404: `notFound()`/`redirect()` respondiam HTTP 200 por causa dos `loading.tsx` que forçavam streaming | média | chore | resolvida em chore/soft-404 (PR #17) |
| D-044 | ledger-comercio S13 T3 | Nome do bairro digitado não era preservado (normalizado para minúsculas) | baixa | S13 | resolvida em S13 T2 rodada 2 (`display_name`) |

## Integração entre trilhas (S11)

| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-045 | ledger.md (ADR-004); ledger-comercio S12 T3 e S14 plano | Portas sem implementação real: leitor de lista (carrinho nasce `is_demo`), contexto do lead (escola/série/município), cotação local ligada ao carrinho; FKs entre trilhas na `0600_cross_track_fks` | alta | S11 | aberta |
| D-046 | ledger-dados S06 plano | `SessionActor` duplicado em `features/auth/actor.ts` e `features/stationeries/actor.ts` | baixa | S11 | aberta |
| D-047 | ledger-dados S06 (dívida) | Expiração de tokens de reivindicação só preguiçosa; falta cron | baixa | S11 | aberta |
| D-048 | ledger.md (Ruling de ledgers por trilha) | Consolidar os Rulings de `ledger-dados.md`, `ledger-pipeline.md` e `ledger-comercio.md` em `ledger.md` | baixa | S11 | aberta |

## Testes e cobertura de E2E

| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-049 | ledger.md (Ruling de E2E local); e2e/S00 | Nenhum E2E rodou no preview da Vercel: a proteção foi desativada em 2026-09-25 (Ruling de previews públicos) e o E2E de cada fatia passa a rodar no preview após o primeiro deploy verde; enquanto isso vale o E2E local | alta | Orquestrador (a cada fatia) → S20 | em andamento |
| D-050 | ledger.md (ADR-004, itens 7 a 10); PR #8 | E2E parcial até a S11: fluxos ponta a ponta com listas reais (lista → carrinho → lead) não exercitados | alta | S11 | aberta |
| D-051 | ledger-dados S03 T3 e S06 T3 | `agent-browser upload` trava o renderer; E2E injeta arquivo por `DataTransfer`, sem exercitar o seletor real | baixa | S20 | aberta |
| D-052 | ledger-dados S06 revisão final | Reenvio por `add_file` no E2E da S06 não confirma o fim do upload (flakiness) | baixa | S18 | aberta |
| D-053 | ledger-comercio S14 revisão final | E2E da S14: "B não altera lead da A" deve rodar com o lead ainda `received`; seção g do S14.md só com capturas | baixa | S20 | aberta |
| D-054 | ledger.md (S01); ledger-dados S03 T2 | Testes de RLS usam `pg` direto (não cobrem PostgREST/GoTrue); o gateway supabase-js só é exercitado no E2E | baixa | S20 | aberta |
| D-055 | ledger-pipeline S08; e2e/S08 | Pipeline de IA nunca rodou com provedor real (`scripts/ai-smoke.ts` tem custo) | média | Humano / S20 | aberta |
| D-056 | ledger-pipeline S07 (Edge Function) | Teste E2E da Edge Function é ignorado sem `WORKER_URL`/`WORKER_SHARED_SECRET` (não roda no CI) | baixa | S19 | aberta |

## Arquivos grandes (limite de 250 linhas)

A regra do CLAUDE.md vale para **componente React** (250 linhas). Varredura de 2026-09-25, reconferida com `wc -l` sobre `b905cce` (contagens iguais; varredura com `find app components features lib supabase/functions scripts -name '*.ts' -o -name '*.tsx' | xargs wc -l`, sem testes): **nenhum `.tsx` passa de 250 linhas**, então a regra não é violada. Os arquivos abaixo são módulos (repositórios, motores, núcleo de IA) e entram como recomendação com o mesmo limiar de 250.

| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-057 | ledger-dados S06 T2; ledger-comercio S14 T2; varredura | Refatorar módulos acima de 250 linhas sem mudar comportamento (suítes verdes): `features/stationeries/repository.ts` (630), `features/leads/repository.ts` (612; dividir em leitura do solicitante, leitura da papelaria e escrita), `features/cart/options-engine.ts` (445), `supabase/functions/_shared/worker-core.ts` (424; S09 M-4), `supabase/functions/_shared/publication/decide.ts` (300; S09 M-4), `features/cart/repository.ts` (276), `features/claims/queries.ts` (266; ex.: `queries-admin.ts`), `supabase/functions/_shared/ai/router.ts` (261), `supabase/functions/_shared/ai/extraction.ts` (260), `features/claims/repository.ts` (258; ex.: `repository-evidence.ts`, `repository-tokens.ts`) | média | S18 | aberta |

## Ambiente e infraestrutura

| ID | Origem | Descrição | Sev. | Dono | Status |
|---|---|---|---|---|---|
| D-058 | checks dos PRs #4 a #17; verificação de 2026-09-25 | Deploy de preview da Vercel falhava desde o PR #4 (`NEXT_PUBLIC_SUPABASE_*` ausentes). Resolvido: o humano criou as variáveis no projeto `listaescolare` (Preview, Production e Development) e os deploys de preview (S11 `32845a8`) e de produção da `main` (`02dfe00`) ficaram READY | alta | Orquestrador | resolvida em 2026-09-25 (variáveis criadas; deploys READY) |
| D-059 | ledger.md (S01, S02); verificação de 2026-09-25 | Pepper do IP de auditoria: o Supabase hospedado NÃO permite `alter database … set app.audit_ip_pepper` ao papel `postgres` (permission denied), então o GUC não pode ser definido. Criado o segredo `audit_ip_pepper` no Vault do staging (valor gerado no banco); falta a S11 (0601) fazer `audit_row_change` ler o pepper do Vault (com fallback ao GUC) e validar `x-forwarded-for` no staging; na produção, gerar outro pepper | alta | S11 (0601) / S20 | em andamento |
| D-060 | ledger-pipeline S07 T2; PR #14; verificação de 2026-09-25 | Edge Function `ocr-worker`: no staging já existem `pg_cron`, `pg_net`, os segredos `ocr_worker_url` e `ocr_worker_secret` no Vault e o job `ocr-worker-tick` (a cada minuto, `timeout_milliseconds` 120000, lê URL e segredo do Vault) INATIVO. Falta (1) deploy da função com `verify_jwt=false` e (2) os secrets da função (`WORKER_SHARED_SECRET` = o do Vault, `APP_ENV=staging`, `OPENROUTER_KEY`, `AI_MODEL_*`): a CLI local não tem acesso ao projeto (403; ele pertence à org da integração Vercel) e o MCP não define secrets; depois ativar o job | alta | Humano (acesso CLI/secrets) → orquestrador | em andamento |
| D-061 | ledger.md (S01) | Histórico remoto de migrations do staging usa timestamps e nomes diferentes dos arquivos; reconciliar antes da S20 | média | S20 | aberta |
| D-062 | ledger-comercio S12 T2 | Formato do link de afiliado do Mercado Livre (`matt_tool`/`matt_word`) não confirmado | média | Humano / S20 | aberta |
| D-063 | ledger.md (S02) | Supabase Auth hospedado: o humano configurou em 2026-09-25 Site URL, Redirect URLs (incl. `https://listaescolare-*.vercel.app/**`) e os templates `magic_link` e `confirmation`; falta validar o link mágico em outro navegador no preview e configurar SMTP próprio antes de produção (o SMTP padrão do Supabase tem limite de envio) | média | Orquestrador (validar) / S20 (SMTP) | em andamento |
| D-064 | ledger-pipeline S07 T3 | `bodySizeLimit` de 11 MB divergia do teto da Vercel | média | S07 | resolvida em S07 onda final (teto único de 4 MB) |
| D-065 | ledger-pipeline S09 (M-2) | `ocr-worker`: o ramo sem pipeline responde 500 `misconfigured`/`pipeline_unavailable` mesmo varrendo publicação; sem regressão em deploys hospedados | baixa | S11 | aberta |
| D-066 | ledger-pipeline S09 (M-7) | Quando a porta publica e o envio já não está `approved` (`not_approved`), a versão fica órfã sem linha persistente própria; só alerta `published_not_recorded` | média | S11 | aberta |
| D-067 | ledger-pipeline S09 | O array `calls` do `MemoryListPublisher` (singleton em memória por processo) cresce sem limite | baixa | S18 | aberta |
| D-068 | ledger-pipeline S09 (pendência) | Regra 5 só bloqueia lista-alvo `archived`; lista em `human_review`/`review_needed` passa pelo motor | média | S10 / S11 | aberta |
| D-069 | ledger-pipeline S09 (pendência) | Índice `ai_decisions_publication_once` limita a um `published`/`publish_failed` por envio; republicação após `publish_failed` + aprovação humana exige outro `kind`/`decision` | média | S10 / S11 | aberta |
| D-070 | ledger-pipeline S09 | `PortError` tipado (`transient`) obrigatório na porta real; versão real idempotente por `list_versions.submission_id`, perfil `system` e ajuste na 0600 (`p_actor_id` obrigatório) | alta | S11 | aberta |
| D-071 | ledger-pipeline S09; OBRIGAÇÃO da S10 | `ReviewSummary` mostra "Publicada automaticamente" para qualquer status `published`; deve vir da linha `publication:published` automática (`actor_id` nulo), não só do status (aprovação humana também vira `published`) | alta | S10 | aberta |
| D-072 | PR #20 (CI); ledger-comercio S27 (assets/fonts) | `pnpm build` do CI depende de `next/font/google` (busca Plus Jakarta Sans no Google Fonts): falhou uma vez ao obter a fonte do Google Fonts no build no PR #20 (rerun passou). Hospedar a fonte localmente (a S27 já commitou `assets/fonts` para a OG image) | média | S19 / S18 | aberta |
| D-074 | Ruling de previews públicos (ledger.md) | Previews da Vercel públicos com o Supabase de staging (dados demo): reativar a Vercel Authentication (ou equivalente) ANTES de qualquer dado real; hoje só `X-Robots-Tag: noindex` os protege da indexação | alta | S20 (checklist de go-live; humano reativa) | aberta |
| D-075 | Ruling de indexamento (ledger.md) | O deploy "de produção" da Vercel (`main`) aponta para o staging e seria indexável: passou a exigir `SITE_INDEXING=1` (além de `VERCEL_ENV=production`) para robots, sitemap e remoção do `X-Robots-Tag`; o humano liga `SITE_INDEXING=1` só no go-live | alta | S20 (checklist de go-live) | aberta |
| D-076 | verificação de 2026-09-25 (env da Vercel) | Chaves `ASAAS_*` existem no projeto Vercel (PSP Asaas escolhido) e em `.env.local`, mas a S21 proíbe dinheiro real e credencial no código: usar só sandbox/fake até o go-live e revisar o adapter Pix (planejado genérico BACEN) contra a API do Asaas | média | S21/S23 | aberta |

Nota (E2E da S27): o E2E da S27 rodou local, em build de produção, e não no preview da Vercel (proteção de login). Já coberto por D-049; não duplicado.

## Resumo

| Severidade | Abertas | Resolvidas | Total |
|---|---|---|---|
| alta | 12 | 1 | 13 |
| média | 27 | 4 | 31 |
| baixa | 30 | 1 | 31 |
| **Total** | **69** | **6** | **75** |
