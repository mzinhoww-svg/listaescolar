# Spec rodada 2: papelaria local, WhatsApp, cobrança e administração (2026-09-24)

## Entendimento
- Objetivo: desenhar todas as telas do modelo papelaria + WhatsApp + cobrança mapeado no benchmark TeacherLists, cobrindo papelaria, admin interno, família, escola e parceiros B2B.
- Restrição central: a ListaCerta NÃO controla o WhatsApp da papelaria. Atribuição por link `wa.me` com código do lead (LC-XXXX), link rastreado da lista, confirmação da papelaria, confirmação do pai e Pix pela plataforma. Convertido = 2 de 3 sinais.
- Cobrança: híbrido. Primeiros [N] leads grátis, créditos pré-pagos por lead (preço por faixa de itens), passe de temporada (nov a mar, até 3x), comissão só quando o Pix passa pela plataforma, repasse opcional para escola ou APM que indicou a papelaria.
- Sucesso: toda tela da seção 5 da análise tem prancha, visual da marca, 0 falhas no teste, sem dado inventado (placeholders entre colchetes), sem logos de terceiros.

## Rulings
1. Sem subagentes e sem agent-browser: execução inline + Playwright/Chromium (mesmo racional da rodada 1).
2. Dono de papelaria usa mais o celular: painel em desktop + versões mobile da caixa de leads, do detalhe do lead e do perfil público.
3. Sidebar do admin cresce de 6 para 12 itens: altura do item cai de 44 para 40 px em todos os painéis desktop. Todas as pranchas de escola e admin são regeradas para manter a navegação idêntica.
4. Estrelas de avaliação desenhadas como ícone genérico; nota exibida como [nota].
5. Contestação de lead: prazo de 72 h, motivos fixos (número errado, lista incompleta, duplicado, fora da área).
6. Dados do responsável mostrados à papelaria: só primeiro nome e o que ele mesmo enviou na mensagem (LGPD, mínimo necessário).

## Telas (24)

### Painel da papelaria (página Papelaria)
| Arquivo | Formato | Conteúdo |
|---|---|---|
| Pap01-Cadastro | desktop | Stepper, CNPJ, nome fantasia, WhatsApp de atendimento com teste, bairros, raio, horário, pagamentos, aceite LGPD, "como você recebe leads" |
| Pap02-Leads | desktop | KPIs (novos, aguardando, vendidos, saldo), abas de status, filtro por escola, tabela resumida |
| Pap02m-Leads | mobile | Mesma caixa em cards com botão WhatsApp |
| Pap03-LeadDetalhe | desktop | Itens com disponível/em falta e subtotal do catálogo, contato mínimo, abrir WhatsApp, Vendi com valor, Não fechou, Contestar, linha do tempo |
| Pap03m-LeadDetalhe | mobile | Versão compacta do detalhe |
| Pap04-Catalogo | desktop | Tabela de preços e estoque, importar planilha, kits prontos por série |
| Pap05-EnviarListas | desktop | Envio de listas recebidas, créditos por lista aprovada, histórico |
| Pap06-Creditos | desktop | Saldo, pacotes via Pix, passe de temporada, extrato, notas |
| Pap07-Desempenho | desktop | Funil, conversão declarada x confirmada, ticket, comparação anônima do bairro, por escola |
| Pap08-PerfilPublico | mobile | Página pública: selos, entrega, pagamento, avaliações, pedir pelo WhatsApp |

### Admin interno (página Admin)
| Admin09-Papelarias | Aprovação e gestão de papelarias |
| Admin10-Planos | Grátis inicial, preço por lead por faixa, passe, comissão Pix |
| Admin11-Auditoria | Declarado x confirmado, divergência, cliente oculto |
| Admin12-Contestacoes | Fila de contestações com prazo e estorno |
| Admin13-Repasses | Repasse para escolas e APMs, lote de pagamento |
| Admin14-Inadimplencia | Saldo negativo, passe em atraso, pausar leads |

### Família (página App família)
| App21-EscolherPapelaria | Papelarias próximas, distância, prazo, pagamento, selo, WhatsApp |
| App22-VoceComprou | Pesquisa 48 h: comprei, ainda não, comprei em outro lugar |
| App23-Avaliar | Estrelas, etiquetas, comentário |
| App24-AviseMe | Lista não publicada: aviso por WhatsApp ou e-mail, enviar lista |

### Escola (página Escola)
| Escola11-Papelarias | Papelarias parceiras, vendas atribuídas, repasse, convidar |
| Escola12-Rede | Visão de rede de ensino por unidade |

### Parceiros B2B (página Parceiros), escopo ampliado a pedido
Ver seção "Lógica B2B" abaixo.

## Lógica B2B (ampliação pedida na rodada)

### Tipos de parceiro
1. **Varejista** (Magalu, Kalunga, atacarejos, redes regionais): consome a base de listas por API ou widget e leva o pai para o próprio carrinho. Paga licença pelo acesso.
2. **Marca** (fabricantes de material): compra campanhas de sugestão e relatórios agregados de demanda.
3. **EdTech e sistemas escolares** (ERP escolar, agenda digital): integra para publicar listas direto do sistema da escola. Entrada de oferta, sem custo para a escola.

### Regras de negócio
- **Dados expostos:** só listas publicadas (públicas) e agregados. Nenhum dado de família ou aluno sai por API.
- **Insights agregados:** recorte só aparece com k mínimo de [N] listas (k-anonimato); abaixo disso a célula fica oculta.
- **Campanha de marca:** aparece como "Sugestão patrocinada", separada da lista oficial. Nunca substitui nem altera item exigido pela escola. Bloqueada automaticamente em listas com alerta Procon de exigência de marca (Lei 12.886). Toda campanha passa por aprovação do admin. Cobrança por mil exibições ou por clique.
- **Planos de varejista:** Sandbox (grátis, dados de amostra, limite diário de [N] chamadas), Regional (MT), Nacional. Preços [R$] a definir.
- **Autenticação:** chave por ambiente (sandbox e produção) no cabeçalho `x-listacerta-key`; rotação sem downtime (duas chaves ativas).
- **Limites:** por plano, por minuto e por dia; resposta 429 com `retry-after`.
- **Webhooks:** `list.published`, `list.updated`, `list.archived`, `school.approved`. Assinatura HMAC no cabeçalho `x-listacerta-signature`; reenvio com backoff por até 24 h.
- **Atribuição:** widget e deep links levam `partner_id`; carrinhos e cliques gerados entram no relatório do parceiro.
- **Endpoints v1:** `GET /v1/schools`, `GET /v1/schools/{inep}`, `GET /v1/schools/{inep}/lists`, `GET /v1/lists/{id}`, `GET /v1/lists/{id}/items`, `POST /v1/carts/match` (casa itens da lista com SKUs do parceiro).

### Telas B2B (11)
| Arquivo | Formato | Conteúdo |
|---|---|---|
| B2B00-Parceiros | desktop 1440 | Landing "Para parceiros": varejistas, marcas, EdTech, como funciona, formulário de contato |
| B2B01-Visao | desktop | Consumo do mês, carrinhos atribuídos, cobertura de listas, status da integração, avisos |
| B2B02-API | desktop | Chaves sandbox/produção mascaradas, rotação, limites do plano, consumo por dia |
| B2B03-Docs | desktop | Endpoints, exemplo de requisição e resposta, erros |
| B2B04-Widget | desktop | Configuração, código de incorporação, pré-visualização |
| B2B05-Webhooks | desktop | Endpoints cadastrados, eventos, entregas e reenvio, segredo HMAC |
| B2B06-Campanhas | desktop | Campanhas de marca: status, regras de compliance, orçamento, desempenho |
| B2B07-NovaCampanha | desktop | Criar campanha: produto sugerido, séries e cidades, CPM/CPC, pré-visualização, checagem Procon |
| B2B08-Insights | desktop | Demanda agregada por item, série e cidade, com k-anonimato |
| B2B09-Faturamento | desktop | Plano, faturas, uso excedente, contrato |
| Admin15-ParceirosB2B | desktop | Contas, tipo, plano, chaves, limites, suspensão |
| Admin16-Campanhas | desktop | Fila de aprovação de campanhas com checagem Procon |

Ruling 7: sidebar do admin chega a 14 itens; altura do item cai para 36 px em todos os painéis.
