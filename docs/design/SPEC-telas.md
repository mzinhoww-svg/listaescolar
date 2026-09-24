# Spec: telas faltantes ListaCerta (2026-09-24)

## Entendimento
- Objetivo: cobrir 100% das rotas de `src/App.tsx` do repo `lista-certa-ia` (36 rotas) mais as 5 telas planejadas em NEXT-ACTIONS (LC-010, LC-013, LC-016), no canvas "ListaCerta — Identidade".
- Público: famílias (mobile), coordenação e diretoria de escola (desktop), time interno (desktop).
- Sucesso: toda rota tem prancha, visual segue a marca (Tinta #0F1B2D, Papel #F5F2EA, Verde Certo #2FCB86, Verde Fundo #0B6B4A, Plus Jakarta Sans), zero overflow, sem dados inventados (placeholders entre colchetes).
- Fonte de verdade: enums de `schema.sql` (school_status, list_status + pending_review/rejected da LC-070-A, cart_strategy cheapest/fastest/recommended, retailer_slug kalunga/magalu/mercadolivre/amazon, procon_severity, list_source).

## Rulings (decisões tomadas sem perguntar)
1. Sem ferramenta de subagentes neste chat: execução inline via executing-plans, gerador único com componentes compartilhados. Custo se errado: nenhum no resultado, só no método.
2. Sem agent-browser: teste com Playwright + Chromium headless renderizando cada prancha (tamanho, overflow, texto cortado) e inspeção visual por screenshot.
3. Família e sistema em mobile 390x844. Escola e admin em desktop 1280x800 (coordenação trabalha no computador; wizard e revisão de rascunho exigem tabela).
4. Estratégia "Menos lojas" do carrinho vira "Recomendado" (enum `recommended`).
5. Tela "Criar conta" vira "Entrar" com Google (repo só tem OAuth Google).
6. Foto da lista marcada como pós-launch (LC-011). Cotação e Pedido confirmado marcadas como CotaMT (não existem neste repo).
7. Os 4 estados do NonAdminCTAs ganham prancha própria.

## Telas (37 novas + 3 ajustes)

### Família, mobile (página App)
| Arquivo | Rota | Conteúdo |
|---|---|---|
| App11-AuthCallback | /auth/callback | Símbolo, anel de carregamento, "Entrando com Google" |
| App12-MinhaConta | /minha-conta | Perfil, cidade, Minhas reivindicações (pendente/rejeitada + motivo), Listas que enviei (em revisão/publicada/rejeitada), sair |
| App13-NovoAluno | /meus-alunos/novo | Nome, escola escolhida, série em chips, ano letivo, consentimento LGPD, salvar |
| App14-EscolaPublica | /escola/:slug | Cabeçalho da escola, séries com lista, CTA de reivindicar, enviar lista |
| App14b-EscolaEstados | /escola/:slug | 4 estados do NonAdminCTAs |
| App15-EnviarLista | /escola/:slug/enviar-lista | Aviso de revisão, série/ano, editor de itens, enviar para revisão |

### Planejadas, mobile (página App, linha 3)
| App16-HubPais | /pais (LC-010) | "Oi, [Nome]", busca, chips de cidade, alunos com progresso, CTA fixo |
| App17-CarrinhoOpcoes | /pais/carrinho/:shortCode | 3 CartOption: Mais barato, Recomendado, Mais rápido |
| App18-Checkout | /pais/carrinho/:shortCode/checkout | RetailerSplit por loja, progresso de lojas abertas, "Já comprei" |
| App19-Historico | /pais/historico | Carrinhos anteriores por aluno e ano |
| App20-AILoading | AILoading | Tela cheia com etapas da IA |

### Escola, desktop (página Escola)
| Escola01-Cadastrar | /escola/cadastrar | Stepper, busca INEP, CEP com auto-fill, responsável |
| Escola02-Aguardando | /escola/aguardando | Linha do tempo enviado > em análise > aprovada |
| Escola03-MinhasEscolas | /minhas-escolas | Escolas com status aprovada/em análise/recusada/suspensa |
| Escola04-Status | /escola/:id/status | Status, próximos passos, link público, indicadores |
| Escola05-Admins | /escola/:id/admins | Tabela de admins, gerar convite, revogar |
| Escola06-Convite | /escola/admin-convite/:token | Aceitar ou recusar convite, estado expirado |
| Escola07-NovaLista | /escola/:id/listas/nova | Wizard 3 passos, método PDF/manual/foto |
| Escola08-UploadPDF | /escola/:id/lista/upload-pdf | Área de envio, progresso da leitura pela IA |
| Escola09-Revisar | /escola/:id/lista/draft/:draftId/revisar | PDF ao lado dos itens, confiança por item, alerta Procon, publicar ou descartar |
| Escola10-ListaDetalhe | /escola/:id/listas/:listId | Itens, link público, QR code, indicadores, arquivar |

### Admin, desktop (página Admin)
| Admin01-Visao | /admin | Filas e indicadores |
| Admin02-Escolas | /admin/escolas | Fila por status, aprovar/recusar |
| Admin03-EscolaDetalhe | /admin/escolas/:id | INEP x informado, decisão com motivo |
| Admin04-Claims | /admin/claims | Evidência (até 500 caracteres), decisão (LC-070-C) |
| Admin05-ListasPendentes | /admin/listas-pendentes | Fila parent_upload, pré-visualização, decisão (LC-070-C) |
| Admin06-Sessoes | /admin/sessoes | Tabela paginada 50/página, filtros |
| Admin07-SessaoDetalhe | /admin/sessoes/:sessionId | Linha do tempo dos 6 eventos |
| Admin08-Eventos | /admin/eventos | Funil search > deep_link_click, eventos recentes |

### Site e sistema (página Sistema)
| Landing | / | Página completa: hero, pais, escolas, como funciona, perguntas, rodapé |
| Sis01-LinkCurto | /r/:shortId | Resolvendo link |
| Sis02-IrPara | /ir-para/:strategyId/:retailerKey | Aviso de afiliado, abrir loja |
| Sis03-Privacidade | /privacidade | Estrutura do documento |
| Sis04-Termos | /termos | Estrutura do documento |
| Sis05-403 | /403 | Sem acesso |
| Sis06-404 | * | Página não encontrada |
| Sis07-Sobre | /sobre (LC-016) | Missão e como funciona |
