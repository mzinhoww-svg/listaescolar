# MELHORIAS · diagnóstico dos funis e prioridades (S28, Fase 1)

Data: 28/09/2026 · Fatia: S28 · Excelência de produto e design (ADR-006) · Método: `superpowers:brainstorming` em modo autônomo (as perguntas da skill foram respondidas pelo SPEC, pelo PLAN, pelas telas de `docs/design`, pelo código da `main` em `1b9fb28` e pelo desenho da pesquisa com mães; nenhum humano foi consultado).

Este documento é a base do spec (`docs/superpowers/specs/2026-09-28-s28-excelencia-design.md`) e do plano (`docs/superpowers/plans/2026-09-28-s28-excelencia.md`). A medição "antes" está em `docs/superpowers/evidencias/S28/antes/` (Lighthouse, axe, capturas 390×844).

## 1. Como ler

- **Impacto (I)**, de 1 a 5: efeito esperado sobre conclusão do funil, confiança ou risco de erro do usuário no piloto de Cuiabá. 5 = destrava ou evita perda de gente no funil principal.
- **Esforço (E)**, de 1 a 5: 1 = horas, um arquivo; 3 = 1 a 2 dias, vários arquivos, com testes; 5 = mais de 3 dias, migration, RLS ou dependência externa.
- **Prioridade** = I ÷ E. Empate se resolve pelo funil da família (é onde o piloto se decide) e por dependências.
- **Métrica** = o que prova o ganho. Métrica de funil usa os eventos do `docs/tracking-plan.md` (PostHog, ADR-007); métrica de qualidade usa Lighthouse, axe ou a tabela `ai_decisions`. Como o PostHog só passa a existir com o item M01, a linha de base dos eventos é "sem dado até o piloto"; a S28 entrega o instrumento e a meta é registrada como hipótese.
- **Regra de honestidade:** não há número inventado aqui. Onde a fonte não existe, está escrito "sem dado".

### O que a pesquisa com mães (ADR-005) permite afirmar hoje

Os números agregados que existem no repositório (`docs/superpowers/e2e/pesquisa-maes.md`) são de dados de teste (`source_group = 'e2e-teste'`, todos apagados) e de uma única resposta real em 25/09. **Não há amostra para citar percentual.** O que a pesquisa oferece nesta fase é o vocabulário do problema, embutido nas opções das perguntas (`lib/pesquisa/perguntas.ts`), e o canal de chegada:

- Dores mapeadas: preço alto, achar todos os itens, entender o item ou a marca pedida, ir até a loja, comprar item errado, falta de tempo (a mãe escolhe até 2).
- Recebimento da lista: papel impresso, **foto ou PDF no WhatsApp**, site ou app da escola. Logo, a família chega com foto, não com o nome da escola na cabeça.
- Onde comprou: papelaria do bairro, loja grande, internet, supermercado, kit da escola. Canal desejado: internet com entrega, **papelaria do bairro pelo WhatsApp** ou tanto faz.
- A distribuição é por link em grupo de WhatsApp, no celular. O produto precisa abrir rápido em 4G e funcionar bem dentro do navegador embutido do WhatsApp.

Tratamento: as hipóteses abaixo que se apoiam nisso estão marcadas "hipótese da pesquisa"; devem ser recalibradas quando houver 100 respostas completas (meta da pesquisa: 31/10/2026).

## 2. Mapa dos funis

Legenda de risco de abandono: **A** alto, **M** médio, **B** baixo. Cada linha cita a rota e o que foi observado no código da `main` e na demonstração local.

### 2.1 Família (mobile primeiro)

| # | Passo | Rota | Atrito observado | Risco | Clareza do texto | Sinal (pesquisa ou dado) |
|---|---|---|---|---|---|---|
| F1 | Chegar pelo link do WhatsApp e ver a promessa | `/` | Título e busca claros. O hero não diz que só Cuiabá está habilitado (só a meta description e o rodapé dizem). Quem é de outra cidade busca, não acha e sai. | M | Boa. Falta a frase de escopo ("piloto em Cuiabá") junto à busca. | Público da pesquisa é Cuiabá e Várzea Grande (M06, M14) |
| F2 | Buscar a escola | `/escolas` | Só digitação de nome ou INEP; sem sugestões; a mãe do fluxo "foto no WhatsApp" pode não saber o nome oficial. Busca vazia mostra estado de vazio, mas sem caminho alternativo forte. | A | Rótulo "Nome da escola ou INEP" é honesto; INEP é jargão para a maioria. | Recebimento por foto/PDF sugere que a mãe tem o documento, não o código (M06, M04) |
| F3 | Escolher escola e série | `/escolas/[inep]` | A série e o ano são escolhidos num seletor e a página só informa se há lista para a série já escolhida; não mostra quais séries têm lista publicada, então a mãe tenta série por série. | M | Selos de verificação existem; o texto do selo é técnico ("registrada", "reivindicada"). | Achar itens é dor declarada (M14) |
| F4 | Ver a lista | `/escolas/[inep]/[serie]` | Tabela de itens agrupada por categoria (D-034 resolvida). CTA verde "Montar carrinho com esta lista" fica depois da tabela inteira: em lista longa, a mãe rola muito até a ação. Sem lista: estado "Me avise" que exige login. | M | Boa; data e versão visíveis. | Entender item/marca é dor declarada; o produto não explica itens ambíguos (backlog M31) |
| F5 | Entrar para continuar | `/entrar?next=` | **Ponto de maior perda provável.** O carrinho, a cotação, o envio de lista e o "Me avise" exigem login por link mágico. No celular a mãe sai do navegador do WhatsApp para o app de e-mail, pode abrir o link em outro navegador e perde o contexto. A tela não explica o porquê do login nem o que fazer quando o e-mail não chega. Google OAuth ainda sem credencial (D-042). | A | "Entre para acompanhar a lista de cada aluno" fala de aluno, não do que a mãe acabou de pedir (montar carrinho). Falta o "abra o e-mail neste aparelho". | Sem dado ainda; evento `login_started`/`login_completed` a criar (M01, M03) |
| F6 | Montar carrinho | `/carrinho/novo`, `/carrinho/[id]` | Com dados de demonstração a tela mostra quatro opções, **três "indisponível" por falta de fonte de preço**, e o cabeçalho diz "Montamos 1 opção". O texto é honesto (regra do produto), mas a mãe passou pelo login para ver majoritariamente "indisponível". | A | O contraste entre o título ("1 opção") e os quatro cartões confunde. | Preço alto e comparar lojas são dores; sem fonte de preço a promessa não se cumpre (M05) |
| F7 | Pedir cotação à papelaria | `/cotacao/nova`, `/cotacao/[code]` | Consentimento antes do WhatsApp (correto). O caminho existe, mas não é apresentado como o principal quando não há preço. Canal "papelaria do bairro pelo WhatsApp" é preferência declarada na pesquisa. | M | Termos "cotação", "lead" (não aparece ao usuário; conferir) e "candidatas". | Hipótese da pesquisa: papelaria por WhatsApp é canal aceito (M05, M11) |
| F8 | Enviar a lista (foto ou PDF) | `/enviar-lista` | Requer login antes de tudo. **Teto de 4 MB** de upload (D-023): foto tirada com o celular costuma passar disso e falha. Orçamento de 10 s de OCR, depois fila. | A | Mensagens de erro de tamanho existem; a solução (reduzir a foto) não é oferecida. | Recebimento por foto/PDF no WhatsApp é o caso típico (M04) |
| F9 | Esperar a leitura | `/enviar-lista/[submissionId]` | Estados de processamento e assíncrono existem (S07, S18). Espera até 1 min pelo worker (D-026). | M | Boa. | `ocr_completed.duracao_ms` no tracking plan (M01, M02) |
| F10 | Revisar itens | `/enviar-lista/[id]/revisar` | Revisão item a item em tela estreita; cobre a dor "comprar item errado". | B | A conferir na auditoria. | — |
| F11 | Voltar e comprar (pós) | `/conta`, `/conta/compras` | "Você comprou?" (S22) fecha o ciclo; hub da conta com 4 links (S15/S18). Onboarding do primeiro acesso não guia (adicionar aluno por apelido). | M | Apelido e série, sem dado de menor (correto). | (M11) |

### 2.2 Escola

| # | Passo | Rota | Atrito observado | Risco | Clareza | Sinal |
|---|---|---|---|---|---|---|
| E1 | Descobrir que pode publicar | `/` (seção "Para escolas"), `/escolas/[inep]` | Bloco "Cadastrar minha escola" existe; leva a `/escolas`, ou seja, a mais uma busca. | M | "Cadastrar minha escola" vs "reivindicar" (nome interno) inconsistentes. | (M14) |
| E2 | Reivindicar | `/escolas/[inep]/reivindicar` | Login obrigatório, três métodos de verificação (e-mail institucional, WhatsApp institucional, documentos). Sem prazo prometido (correto: sem fonte). | M | Estados `awaiting_verification`, `token_expired`, `insufficient_evidence` são técnicos; a página de status precisa dizer o próximo passo em português. | (M13) |
| E3 | Aguardar aprovação | `/escola`, Escola02 | Espera sem "o que fazer enquanto isso". Nada convida a preparar o PDF. | A | Depende do texto de cada estado. | Sem dado; `claim_*` não estão no tracking plan (backlog M24) |
| E4 | Enviar o PDF da lista | `/escola/listas/nova` | Mesmo teto de 4 MB; PDF de escola costuma ser leve. | B | Boa. | `list_upload_started source=school` |
| E5 | Revisar e publicar | `/escola/listas/[id]/revisar` | Revisão humana da S10; alertas de item coletivo/marca são "sinalização, não parecer" (correto). | M | Texto dos alertas é denso. | `list_published` |
| E6 | Divulgar | Cartão Compartilhar, `/l/[code]` | Link curto e QR existem (S27). Falta o momento "lista publicada, compartilhe agora" com mensagem pronta de WhatsApp. | M | (M11) | Cliques no link curto sem evento hoje |

### 2.3 Papelaria

| # | Passo | Rota | Atrito observado | Risco | Clareza | Sinal |
|---|---|---|---|---|---|---|
| P1 | Conhecer e cadastrar | `/cadastrar-papelaria` | Exige login como pai (papel `parent`) antes do cadastro; o formulário pede razão social, CNPJ, contato, bairros. | M | Título direto; termos legais ("passe", "crédito") só depois. | `stationery_registered` |
| P2 | Aguardar aprovação | `StatusPanel` | Estados `under_review`, `rejected` (D-036: sem tela para editar cadastro rejeitado). | A | O que falta e como corrigir precisa estar explícito. | (M12) |
| P3 | Preencher catálogo e áreas | `/papelaria/catalogo`, `/papelaria/areas` | Sem catálogo ativo a papelaria não recebe cotação útil; hoje nada mostra "faltam 3 passos para receber leads". | A | (M12) | `catalog_activated`, `days_since_registered` |
| P4 | Receber e responder lead | `/papelaria/leads`, `[code]` | Lista e detalhe (Pap02/03 e versões mobile); primeiro lead é o momento de ativação. | M | Termos "lead" e "conversão" são de mercado; verificar linguagem para dono de papelaria. | `lead_received`, `lead_converted` |
| P5 | Créditos e passe | `/papelaria/creditos` | Sem plano publicado no staging (`billing_unavailable`); estado precisa ser claro. | M | Valores só de `plans`, nunca fixos (correto). | (M12) |
| P6 | Desempenho | `/papelaria/desempenho` | Existe (S22). | B | A conferir. | — |

### 2.4 B2B (parceiros)

| # | Passo | Rota | Atrito observado | Risco | Clareza | Sinal |
|---|---|---|---|---|---|---|
| B1 | Conhecer | `/parceiros` | Página de apresentação com docs públicos. | B | A conferir. | — |
| B2 | Cadastrar e obter chave sandbox | `/b2b/conta`, `/b2b/api` | A primeira chamada bem-sucedida é o marco de ativação; a página de chaves não traz um exemplo copiável com a chave e a resposta esperada. | M | Docs em `/b2b/docs`; falta o caminho "primeira chamada em 2 minutos" (backlog M22). | Sem evento; tempo até 1ª chamada só pelo uso de API no banco |
| B3 | Widget e webhooks | `/b2b/widget`, `/b2b/webhooks` | Configuração por snippet e endpoint; sem pré-visualização ao vivo (backlog M23). | M | — | — |
| B4 | Campanhas, insights, faturamento | `/b2b/campanhas`, `/b2b/insights`, `/b2b/faturamento` | Fluxo de marca; fora do piloto de famílias. | B | Consistência visual com o resto do sistema (M15). | — |

Conclusão do mapa: o piloto se perde principalmente em **F5** (login), **F6** (opções "indisponível"), **F8** (foto acima de 4 MB), **F2** (busca sem rede de segurança), **P3** (papelaria sem catálogo) e **E3** (escola sem próximo passo). O topo da lista abaixo ataca esses seis pontos e cumpre o aceite mensurável da ADR-006.

## 3. Backlog priorizado (todos os itens)

Ordenado por prioridade (I ÷ E). "Fatia" indica se entra no top 15 desta fatia (S28) ou fica para depois do piloto.

| ID | Melhoria | I | E | Prior. | Áreas e arquivos afetados | Métrica que prova o ganho | Fatia |
|---|---|---|---|---|---|---|---|
| M03 | Entrar sem perder o lugar: motivo do login em uma linha, retorno garantido ao passo, tela "link enviado" com instrução, reenvio com espera e troca de e-mail | 5 | 2 | 2,5 | `app/entrar/*`, `components/auth/*`, `features/auth/actions.ts`, `features/auth/redirect.ts` | Taxa `login_started` → `login_completed` (a criar; meta: hipótese ≥ 70% em 10 min); taxa de retorno ao `next` | S28 |
| M05 | Sem preço, sem promessa vazia: título do carrinho coerente com as opções, cotação por papelaria como caminho principal quando não há fonte, aviso na lista antes do login | 5 | 2 | 2,5 | `app/carrinho/[id]/page.tsx`, `components/cart/*`, `app/escolas/[inep]/[serie]/page.tsx`, `features/cart/*` (texto e ordem, sem tocar regra de preço) | `purchase_clicked` por `canal`; proporção de carrinhos com `papelaria_cotacao`; auditoria de texto (0 títulos contraditórios) | S28 |
| M06 | Rede de segurança na busca: escolas com lista publicada como atalhos, frase de escopo (piloto em Cuiabá), busca vazia com saída (enviar a lista, avisar quando existir) | 4 | 2 | 2,0 | `components/site/Hero.tsx`, `app/escolas/page.tsx`, `components/schools/SearchResults.tsx`, `features/schools/*` (consulta de escolas com lista publicada, só leitura) | `school_searched.results_count = 0` seguido de `list_upload_started` ou `school_viewed`; taxa `school_searched` → `school_viewed` | S28 |
| M14 | Passe de copy pt-BR nos quatro funis: jargão (INEP, reivindicar, lead, candidata), erros acionáveis, uma palavra por conceito, data e origem sempre visíveis | 4 | 2 | 2,0 | `features/site/copy.ts`, `features/*/messages.ts`, componentes de estado; sem mudar regra | Checklist de vocabulário aprovado; leitura de 15 telas sem jargão; redução de `error` em `list_upload_started` seguido de nova tentativa | S28 |
| M01 | Instrumentação PostHog conforme ADR-007 e `tracking-plan.md` (aprovada em 28/09/2026, plano gratuito): SDK adiado, proxy `/ingest`, cookieless até consentimento, só identificadores pseudônimos, desligada sem `NEXT_PUBLIC_POSTHOG_KEY` | 5 | 3 | 1,7 | `lib/analytics/*` (novo), `app/layout.tsx` ou provedor no `components/`, `next.config.ts` (rewrites), `features/privacy/*` (consentimento), Server Actions nos pontos de evento, `docs/tracking-plan.md` | Teste que falha com propriedade fora do esquema ou com dado pessoal; E2E: nada é enviado antes do consentimento; funil da família visível no PostHog | S28 (fixo) |
| M04 | Reduzir a foto no aparelho antes do envio (canvas, sem dependência) para caber no teto de 4 MB; PDF acima do teto recebe orientação clara | 5 | 3 | 1,7 | `app/enviar-lista/SubmitForm.tsx`, `features/submissions/*` (novo módulo puro de redução), `app/escola/listas/nova/*` | `list_upload_started.size_bucket` `>5MB` cai para ~0 no envio; taxa de falha de envio por tamanho; teste do módulo | S28 |
| M09 | Corrigir tudo que o axe e o Lighthouse apontam (contraste, nomes acessíveis, alvos de toque ≥ 44 px, landmarks, ordem de foco) nas 7 páginas principais e nas demais áreas | 5 | 3 | 1,7 | Componentes de `components/*` e `app/*` citados em `evidencias/S28/antes/axe.md` | axe sem violações sérias ou críticas; Lighthouse acessibilidade ≥ 90 nas 7 páginas (aceite da ADR-006) | S28 |
| M07 | Skeletons por rota (lista, escola, carrinho, painéis) no lugar do spinner de tela cheia; altura reservada para evitar salto de layout | 3 | 2 | 1,5 | `app/loading.tsx`, `app/**/loading.tsx`, `components/ui/Skeleton` (novo) | CLS < 0,1 nas páginas medidas; LCP percebido (captura em 4G simulado) | S28 |
| M02 | Custo de IA por lista (meta < R$ 0,50) e consultas lentas do banco: gravar tokens, custo estimado e latência por decisão; relatório de `pg_stat_statements` e `EXPLAIN` das consultas quentes; corrigir o que estourar | 4 | 3 | 1,3 | Migration nova (colunas de uso em `ai_decisions`), `supabase/functions/_shared/ai/router*.ts`, `features/extraction/*`, `app/admin/ia`, `scripts/` (relatório) | Custo médio por lista publicado no `PROGRESS.md` (< R$ 0,50); nenhuma consulta quente acima do orçamento (p95 registrado) | S28 (fixo) |
| M08 | Orçamento de desempenho: pesos de fonte, carregamento do Sentry no cliente, cache das páginas públicas, divisão de código, imagens | 4 | 3 | 1,3 | `app/layout.tsx`, `sentry.client.config.ts`, `instrumentation-client.ts`, `next.config.ts`, componentes pesados | Lighthouse desempenho ≥ 90 nas 7 páginas; LCP, TBT e tamanho de JS por página (antes e depois) | S28 |
| M10 | Landing e "Como funciona" com blocos e microinterações do tripled-ui, sem prova social inventada, `prefers-reduced-motion` respeitado, sem dependência pesada | 4 | 3 | 1,3 | `components/site/*`, `app/(site)/page.tsx`, `app/(site)/como-funciona/page.tsx`, `app/globals.css` | Lighthouse (desempenho e acessibilidade) não regridem; `landing_viewed` → `school_searched`; revisão visual contra `docs/design` | S28 |
| M11 | Momentos-chave da família: onboarding do primeiro acesso, "lista pronta" com compartilhamento por WhatsApp em um toque, "cotação enviada" com próximo passo, vazios úteis | 4 | 3 | 1,3 | `components/lists/*`, `components/leads/*`, `components/share/*`, `app/conta/*`, `components/students/*` | Taxa de compartilhamento após `list_viewed` (evento novo `list_shared`); `purchase_clicked` após "lista pronta"; roteiro E2E | S28 |
| M12 | Papelaria: checklist de ativação no painel (dados, áreas, catálogo, primeiro lead), vazios orientados, lead mobile com a ação principal à vista | 4 | 3 | 1,3 | `components/stationeries/*`, `components/leads/*`, `app/papelaria/*` | `stationery_registered` → `catalog_activated` (dias); `catalog_activated` → `lead_received` | S28 |
| M13 | Escola: painel com "próximo passo" (aguardando verificação, enviar PDF, revisar, compartilhar), estados de reivindicação em linguagem clara | 4 | 3 | 1,3 | `components/claims/*`, `app/escola/*`, `features/claims/messages*` | Tempo de `claim` aprovada até `list_upload_started source=school`; `list_published` por escola | S28 |
| M15 | `DESIGN.md` do projeto e componentes compartilhados (botão, campo, tabela, foco, feedback, movimento) alinhando escola, papelaria, admin e B2B às telas de referência | 3 | 3 | 1,0 | `DESIGN.md` (novo), `components/ui/*` (novo, pequeno), `app/globals.css`, telas das áreas | Zero achados de consistência na auditoria impeccable das 6 áreas; componentes de até 250 linhas; `pnpm check:sizes` verde | S28 |
| M22 | Quickstart B2B: exemplo copiável com a chave sandbox e a resposta esperada | 3 | 2 | 1,5 | `app/b2b/api/page.tsx`, `app/b2b/docs/page.tsx` | Tempo da criação da chave à 1ª chamada 200 no sandbox | Pós-piloto |
| M26 | Kit de divulgação da escola: cartaz A4 com QR e mensagem de WhatsApp | 3 | 2 | 1,5 | `features/short-links/*`, `app/l/*`, `components/share/*` | Cliques no link curto por escola | Pós-piloto |
| M30 | Ajuda contextual nos pontos de dúvida (marca, item coletivo, INEP) | 3 | 2 | 1,5 | `components/lists/*`, `components/schools/*` | Menos `report` de lista por dúvida; leitura de item | Pós-piloto |
| M19 | Indexar listas reais de escolas verificadas (D-033) para chegar por busca do Google | 3 | 2 | 1,5 | `app/escolas/[inep]/[serie]/page.tsx`, `lib/robots-header.ts`, `app/sitemap.ts` | `landing_viewed` por origem orgânica; só após go-live e SITE_INDEXING=1 | Pós-piloto |
| M16 | Entrada por código de 6 dígitos no mesmo aparelho (além do link) | 4 | 3 | 1,3 | Template do e-mail de acesso no Supabase hospedado (ação do humano), `features/auth/*` | `login_completed` no mesmo dispositivo; depende do template hospedado | Pós-piloto |
| M18 | Busca com sugestões em tempo real | 3 | 3 | 1,0 | `app/escolas/SearchForm.tsx`, rota de sugestões, índice trigram (D-019) | `school_searched` → `school_viewed` | Pós-piloto |
| M24 | Painel da escola com métricas de visualização da lista | 3 | 3 | 1,0 | `app/escola/*`, eventos `list_viewed` | Retorno da escola ao painel | Pós-piloto |
| M29 | Relatório semanal de funil (PostHog + banco) | 3 | 3 | 1,0 | `scripts/`, `docs/superpowers/` | Relatório semanal publicado | Pós-piloto |
| M25 | Adicionar à tela inicial (manifest leve) | 2 | 2 | 1,0 | `app/manifest.ts`, ícones | Instalações; baixa prioridade sem push | Pós-piloto |
| M27 | Teste A/B de título e CTA da landing | 2 | 2 | 1,0 | Landing, PostHog flags | Só com tráfego suficiente | Pós-piloto |
| M23 | Widget B2B com pré-visualização ao vivo | 2 | 3 | 0,7 | `app/b2b/widget/*` | Cadastros de widget concluídos | Pós-piloto |
| M28 | Regressão visual automatizada por captura | 3 | 4 | 0,8 | CI, `scripts/` | Regressões visuais barradas antes do merge | Pós-piloto |
| M20 | Upload direto ao Storage por URL assinada (D-023) | 3 | 4 | 0,8 | `features/submissions/*`, Storage | Falhas de upload; M04 cobre o grosso do ganho | Pós-piloto |
| M31 | Explicar item ambíguo ("por que a escola pede isso?") | 4 | 4 | 1,0 | Pipeline, `list_items`, curadoria | Menos `comprar item errado` (pesquisa) | Pós-piloto |
| M21 | Aviso de lead à papelaria por WhatsApp | 4 | 4 | 1,0 | Notificações (S11); exige credencial e custo (humano) | Tempo até `lead_viewed` | Pós-piloto (depende de humano) |
| M17 | Carrinho como visitante (sessão anônima), sem login | 5 | 5 | 1,0 | Auth, RLS de `carts`, retenção, S17 | `login_completed` deixa de ser pré-requisito; exige revisão de segurança | Pós-piloto (segurança) |
| M32 | Preço real de varejo por afiliado | 5 | 5 | 1,0 | S12 adapters; credenciais e contratos (humano) | Opções sem "indisponível" | Pós-piloto (depende de humano) |

Nota sobre M15, M02 e M09: têm prioridade calculada menor ou igual a 1,7 mas entram no top 15 por exigência de aceite da ADR-006 (sistema visual documentado, custo de IA medido, acessibilidade medida). M16, M17, M21 e M32 dependem de ação do humano ou de revisão de segurança; ficam fora da fatia pelas regras de autonomia do CLAUDE.md.

## 4. Top 15 desta fatia

Ordem de execução sugerida no plano (dependências primeiro). Cada item traz o aceite de uma linha; o aceite testável detalhado está no plano.

1. **M01 · PostHog (ADR-007), fixo.** Instrumentação com o esquema Zod, proxy, consentimento e desligada sem chave. Aceite: teste barra propriedade fora do esquema e dado pessoal; nada sai antes do consentimento.
2. **M02 · Custo de IA por lista e consultas lentas, fixo.** Aceite: custo médio por lista medido no `PROGRESS.md`, abaixo de R$ 0,50; consultas quentes com p95 registrado e correção do que estourar.
3. **M03 · Entrar sem perder o lugar.** Aceite: teste de componente e E2E do retorno ao passo; tela "link enviado" com instrução e reenvio.
4. **M05 · Sem preço, sem promessa vazia.** Aceite: nenhuma tela mostra título que contradiz as opções; cotação por papelaria em destaque quando nenhuma opção tem preço.
5. **M06 · Rede de segurança na busca.** Aceite: busca sem resultado oferece três saídas; atalhos só com escolas que têm lista publicada; escopo do piloto visível.
6. **M04 · Reduzir foto antes do envio.** Aceite: teste do módulo (foto de 8 MB vira menos de 4 MB, mantém legibilidade); fluxo E2E com imagem grande.
7. **M14 · Copy pt-BR.** Aceite: lista de vocabulário aplicada e testes de texto atualizados; nenhum jargão sem explicação nas 15 telas principais.
8. **M09 · Correções de acessibilidade.** Aceite: axe sem sérias/críticas e Lighthouse de acessibilidade ≥ 90 nas 7 páginas.
9. **M08 · Orçamento de desempenho.** Aceite: Lighthouse de desempenho ≥ 90 nas 7 páginas, medido pelo mesmo script do "antes".
10. **M07 · Skeletons e layout estável.** Aceite: CLS < 0,1; sem spinner de tela cheia nas rotas cobertas.
11. **M10 · Landing e Como funciona.** Aceite: blocos aplicados, reduced-motion testado, sem nova dependência; Lighthouse não regride.
12. **M11 · Momentos-chave da família.** Aceite: lista pronta, cotação enviada, onboarding e vazios com screenshots antes e depois.
13. **M12 · Papelaria: ativação.** Aceite: checklist reflete dados reais (nunca inventados) e some quando concluído.
14. **M13 · Escola: próximo passo.** Aceite: cada estado de reivindicação e de lista mostra o próximo passo em português.
15. **M15 · DESIGN.md e componentes compartilhados.** Aceite: `DESIGN.md` mesclado; auditoria das 6 áreas sem achado de consistência aberto.

Os itens de 6 a 15 podem trocar de posição conforme o baseline (por exemplo, se o Lighthouse de desempenho já passar de 90, M08 diminui de escopo e o esforço vai para M07 e M10). A troca exige Ruling no `ledger.md`.

## 5. Pós-piloto (resto, já ordenado)

Ordem: M22, M26, M30, M19, M16, M18, M24, M29, M31, M25, M27, M28, M20, M23; depois os quatro que dependem do humano ou de segurança: M21, M17, M32. Cada item tem os campos na tabela da seção 3. Revisitar com dados reais do PostHog e com as 100 respostas da pesquisa.

## 6. Como cada métrica é medida

| Tipo | Instrumento | Onde fica |
|---|---|---|
| Desempenho e acessibilidade | `scripts/s28-medir.mjs` (Lighthouse 12 mobile, mediana de 3 execuções, axe-core injetado) | `docs/superpowers/evidencias/S28/{antes,depois}/` |
| Funis | Eventos do `tracking-plan.md` no PostHog (`is_internal = false`) | PostHog do ambiente; sem dado até o piloto |
| Custo de IA | Colunas de uso em `ai_decisions` (tokens, custo estimado em BRL por preço configurado, latência) e relatório por lista | `PROGRESS.md` e `/admin/ia` |
| Consultas lentas | `pg_stat_statements` no banco local (o staging só com leitura autorizada pelo orquestrador) e `EXPLAIN (ANALYZE)` das consultas quentes | Relatório em `docs/superpowers/evidencias/S28/depois/consultas.md` |
| Texto e consistência | Auditoria impeccable por área e checklist de vocabulário | Ledger e PR |
