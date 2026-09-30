# Mapa de fluxos · S29

Um diagrama por jornada (spec §4). Cada nó é uma rota (`app/**/page.tsx`) ou um estado global; cada aresta é a ação que leva de uma à outra. Linha tracejada e nó em hexágono `{{ }}` marcam **costura entre públicos**: quem age muda (família, escola, papelaria, equipe) ou a ação acontece fora do produto (e-mail, WhatsApp, loja). Rotas com `{x}` recebem dado do banco. As rotas dos passos foram conferidas contra `lib/ux-checks/journeys.ts`; as arestas de J1, J2, J3, J4, J5, J6 e J9 foram percorridas no navegador (fichas em `fichas/`), as demais vêm do código e serão percorridas nas Tasks 7 a 9.

Legenda: retângulo = tela; losango = decisão; hexágono = costura com outro público ou com sistema externo; seta tracejada = passagem sem clique da mesma pessoa (aviso, e-mail, ação de outro papel).

## J1 · Família acha a lista (piloto)

```mermaid
flowchart LR
  home["/ (início)"] -->|"Buscar escola"| escolas["/escolas"]
  home -->|"Como funciona"| como["/como-funciona"]
  escolas -->|"digita nome e abre resultado"| escola["/escolas/[inep]"]
  escolas -->|"sem resultado"| vazio["/escolas (vazio)"]
  vazio -.->|"enviar a lista da escola"| enviar["/enviar-lista (J4)"]
  escola -->|"escolhe a série"| lista["/escolas/[inep]/[serie]"]
  escola -->|"escola sem lista publicada"| semlista["/escolas/[inep]/[serie] (indisponível)"]
  lista -->|"Compartilhar"| curto{{"/l/[code] (link curto, WhatsApp)"}}
  lista -->|"QR"| qr["/l/[code]/qr"]
  curto -->|"redireciona"| lista
  lista -->|"Montar carrinho"| carrinho["/carrinho/novo (J2)"]
  lista -. "AUSENTE hoje: só o carrinho leva à cotação (J1-02)" .-> cotacao["/cotacao/nova (J2)"]
  semlista -. "AUSENTE hoje: falta Enviar a lista (J1-04)" .-> enviar
  publicou{{"Escola publicou a lista (J5)"}} -.-> lista
  lista -.->|"exige login"| entrar["/entrar (J3)"]
```

## J2 · Família compra (piloto)

```mermaid
flowchart LR
  lista["/escolas/[inep]/[serie] (J1)"] -->|"Montar carrinho com esta lista"| novo["/carrinho/novo?lista="]
  novo -.->|"sem sessão"| entrar["/entrar (J3)"]
  entrar -.->|"volta ao ponto de origem"| novo
  novo -->|"Comparar opções"| cart["/carrinho/[id] (4 opções)"]
  cart -->|"Escolher esta"| checkout["/carrinho/[id]/checkout (Comprar por loja)"]
  checkout -->|"Buscar / Abrir busca de item"| irpara["/ir-para/[id]/[loja]"]
  irpara -->|"Abrir loja"| loja{{"Site da loja"}}
  irpara -->|"Voltar ao carrinho (leva ao checkout)"| checkout
  cart -->|"Pedir cotação a papelarias"| escolhe["/cotacao/nova?carrinho="]
  escolhe -->|"Pedir pelo WhatsApp"| consent["/cotacao/nova?carrinho=&papelaria="]
  consent -->|"Confirmar pedido de cotação"| cot["/cotacao/[code]"]
  consent -.->|"lead chega à papelaria"| papelaria{{"/papelaria/leads (J6)"}}
  papelaria -.->|"papelaria responde"| cot
  cot -->|"Abrir WhatsApp"| wa{{"WhatsApp da papelaria"}}
  cot -->|"Voltar"| idx["/cotacao"]
  conta{{"/conta (J3)"}} -->|"Minhas cotações"| idx
  idx -->|"abre um pedido"| cot
  compras["/conta/compras"]
  cot -. "SEM LINK hoje (J2-01): a pergunta Você comprou nesta papelaria? é órfã" .-> compras
  compras -.->|"Comprei aqui: registra a venda (J6)"| papelaria
```

## J3 · Família entra e cuida da conta (piloto)

Percorrida no navegador (fichas/J3.md). O link de acesso chegou pelo Mailpit local e voltou à rota de origem; o Google não está configurado localmente.

```mermaid
flowchart LR
  qualquer["Qualquer rota protegida"] -.->|"sem sessão, ?next="| entrar["/entrar"]
  entrar -->|"E-mail: Receber link por e-mail"| email{{"E-mail com link de acesso"}}
  entrar -->|"Entrar com Google"| google{{"Google (não exercitado localmente: JSON cru do Auth)"}}
  email -.->|"abre o link neste aparelho"| retorno["Rota de origem (next)"]
  email -.->|"link usado ou expirado"| entrar
  entrar -. "SEM VOLTA hoje (J3-01): nem logo, nem link ao site" .-> home["/ (início)"]
  retorno --> conta["/conta"]
  conta -->|"Adicionar aluno"| novoaluno["/conta/alunos/novo"]
  novoaluno -->|"Salvar aluno"| conta
  conta -->|"toca no aluno"| editar["/conta/alunos/[id]/editar"]
  editar -->|"Excluir aluno (ConfirmDialog)"| conta
  conta -->|"Ver todas"| salvas["/conta/listas-salvas"]
  conta -->|"Ver todos"| carrinhos["/conta/carrinhos"]
  conta -->|"sino"| notif["/conta/notificacoes"]
  conta -->|"Privacidade e dados"| priv["/conta/privacidade"]
  priv -->|"Excluir minha conta (digitar excluir)"| exclusao{{"Exclusão da conta (não executada)"}}
  conta -. "AUSENTE hoje (J3-03): Enviar a lista e Minhas compras" .-> enviar["/enviar-lista (J4)"]
  notif -. "SEM VOLTA hoje (J3-10): só o sino, que leva a si mesmo" .-> conta
  priv -. "SEM VOLTA hoje (J3-10)" .-> conta
  notif -.->|"aviso de lista pronta / cotação (nenhum canal ativo localmente)"| destino["Rota do aviso"]
```

## J4 · Família envia a lista da escola (piloto)

Percorrida no navegador (fichas/J4.md) com foto real de 7,5 MB. Sem `OPENROUTER_KEY` local, o envio termina em "Leitura automática indisponível"; os estados "lendo" e "lista lida com itens" não foram exercitados.

```mermaid
flowchart LR
  busca["/escolas (busca vazia)"] -->|"Enviar a lista da escola"| enviar["/enviar-lista"]
  conta["/conta"] -. "AUSENTE hoje (J4-01): nenhum link para enviar a lista" .-> enviar
  semlista["Lista sem publicação (J1)"] -. "AUSENTE hoje (J1-04)" .-> enviar
  enviar -->|"foto ou PDF, escola, série, consentimento, Enviar para revisão"| status["/enviar-lista/[id] (processando)"]
  status -->|"leitura terminou"| lida["/enviar-lista/[id] (Lista lida)"]
  status -->|"sem leitura automática / falhou"| aviso2["Aviso sem itens"]
  aviso2 -->|"Enviar outro arquivo"| enviar
  lida -->|"Revisar meus itens"| revisar["/enviar-lista/[id]/revisar"]
  status -.->|"cai em revisão humana"| admin{{"/admin/revisao (J7)"}}
  admin -.->|"aprova e publica"| aviso{{"Aviso: lista publicada (central e push)"}}
  revisar -->|"Salvar minha lista"| salvo["Cópia privada salva"]
  salvo -->|"Montar carrinho com esta lista"| carrinho["/carrinho/novo (J2)"]
  aviso -.-> lista["/escolas/[inep]/[serie] (J1)"]
  status -. "SEM VOLTA hoje (J4-05): nenhum link para /conta nem para o início" .-> conta
  conta -. "AUSENTE hoje (J4-02): não há lista dos meus envios" .-> status
```

## J5 · Escola assume e publica (piloto)

Percorrida no navegador (fichas/J5.md) com `escola@` (membro aprovado) e `familia@` (pedido de administração de uma escola sem administrador, criada só no banco local: o seed tem uma escola única, já com administrador). Confirmação por link e decisão da equipe não foram exercitadas.

```mermaid
flowchart LR
  escola["/escolas/[inep] (J1)"] -->|"Pedir para administrar (só escola sem administrador)"| reiv["/escolas/[inep]/reivindicar"]
  escola -. "escola com administrador: só aviso, sem saída (J5-08)" .-> reiv
  reiv -->|"método, nome, cargo, consentimento: Continuar"| arq["/reivindicar (enviar arquivos)"]
  arq -->|"Enviar para análise"| analise["/reivindicar (Em análise)"]
  analise -. "SEM VOLTA hoje (J5-09): Cancelar leva à escola; /conta e /escola 403 não citam o pedido" .-> conta{{"/conta (J3)"}}
  analise -.->|"pedido chega à equipe"| adminclaim{{"/admin/reivindicacoes (J7)"}}
  adminclaim -.->|"decide; aviso na central"| painel["/escola"]
  adminclaim -.->|"e-mail com link (método e-mail)"| confirmar["/escolas/[inep]/reivindicar/confirmar"]
  confirmar -->|"Confirmar e-mail da escola"| analise
  painel -->|"Pedir para administrar outra escola"| busca["/escolas (busca)"]
  painel -->|"Ver a lista publicada"| escolapub["/escolas/[inep] (J1)"]
  painel -. "AUSENTE hoje (J5-01): com lista publicada nada leva ao envio de outra série" .-> nova["/escola/listas/nova"]
  nova -->|"Enviar para revisão"| statusfam["/enviar-lista/[id] (tela da família, J4)"]
  statusfam -. "SEM VOLTA hoje (J5-03): nenhum link para /escola nem lista de envios da escola" .-> painel
  nova -. "SEM VOLTA a 390 px (J5-02): sem cabeçalho nem menu" .-> painel
  statusfam -.->|"cai em revisão humana"| revisaoadm{{"/admin/revisao (J7)"}}
  revisaoadm -.->|"publica; aviso"| divulg["/escolas/[inep]/[serie] (J1)"]
  painel -. "AUSENTE hoje (J5-11): sem compartilhar (link curto, QR, WhatsApp)" .-> divulg
  divulg -.-> famlista{{"Família vê a lista (J1)"}}
```

## J6 · Papelaria vende (piloto)

Percorrida no navegador (fichas/J6.md), inclusive a costura J2 para J6 (pedido da família, resposta, "Comprei aqui", "Vendi", contestação). A fatura não foi exercitada (sem seed).

```mermaid
flowchart LR
  site["Site público (home, rodapé, /parceiros)"] -. "AUSENTE hoje (J6-01): nenhum link para o cadastro" .-> cad["/cadastrar-papelaria"]
  cad -->|"Continuar (3 passos), Enviar para análise"| emanalise["/cadastrar-papelaria (Em análise)"]
  emanalise -. "SEM VOLTA hoje (J6-12): sem logo, conta nem home" .-> site
  emanalise -.->|"equipe aprova"| aprova{{"/admin/papelarias (J7)"}}
  aprova -.-> painel["/papelaria (visão geral)"]
  painel -->|"menu"| areas["/papelaria/areas"]
  painel -->|"menu"| catalogo["/papelaria/catalogo"]
  painel -->|"menu"| creditos["/papelaria/creditos"]
  creditos -->|"abre fatura (sem seed)"| fatura["/papelaria/creditos/faturas/[id]"]
  painel -->|"menu"| leads["/papelaria/leads"]
  familia{{"Família: Confirmar pedido de cotação (J2)"}} -.->|"lead chega, status Novo"| leads
  leads -->|"Abrir e responder o pedido"| lead["/papelaria/leads/[code]"]
  lead -->|"Orçamento enviado (1 clique, valor opcional)"| resposta{{"/cotacao/[code] (J2): 'informou o valor' sem valor (J6-02)"}}
  lead -->|"Vendi (1 clique, encerra)"| venda["Venda declarada"]
  compras{{"/conta/compras (J2): Comprei aqui"}} -.->|"2º sinal: pedido vira converted"| venda
  venda --> desempenho["/papelaria/desempenho (Declarado × confirmado)"]
  lead -->|"Contestar (motivo)"| contest{{"/admin/contestacoes (J7)"}}
  painel -->|"Ver perfil público"| publica["/papelarias/[slug]"]
  publica -. "SEM VOLTA hoje (J6-13): sem cabeçalho; WhatsApp fora do fluxo da cotação" .-> site
  painel -->|"Pausar (sem confirmar)"| pausada["/papelaria (Pausada, some das famílias)"]
  painel -->|"menu"| desempenho
```

## J7 · Equipe opera (núcleo piloto)

Percorrida no navegador (fichas/J7.md) com decisões reais: revisão de lista, pedido de administração, papelaria e contestação, e o efeito de cada uma vista do outro lado. Detalhes de denúncia e de lote de importação não foram exercitados (sem seed).

```mermaid
flowchart LR
  admin["/admin (contagem por entidade)"] -. "AUSENTE hoje (J7-07): fila de atenção; chips sem link, sem contestações nem listas em revisão" .-> revisao
  admin -->|"menu"| revisao["/admin/revisao"]
  familiaenv{{"Família: envio de lista (J4)"}} -.->|"cai em revisão humana"| revisao
  revisao -->|"Abrir (fora do cartão a 390 px, J7-01)"| revitem["/admin/revisao/[id]"]
  revitem -->|"Aprovar e publicar (1 clique, sem confirmar, J7-03)"| aviso{{"Família: 'Sua lista foi publicada' (J4)"}}
  revitem -. "SEM VOLTA hoje (J7-03): depois de publicar não há link para a lista publicada; desfazer só por /admin/listas/[id]" .-> listapub["/escolas/[inep]/[serie] (J1)"]
  admin -->|"menu"| reiv["/admin/reivindicacoes"]
  escolapedido{{"Escola: pedir para administrar (J5)"}} -.-> reiv
  reiv -->|"Abrir e decidir"| reivitem["/admin/reivindicacoes/[id]"]
  reivitem -->|"Aprovar (com diálogo de confirmação)"| escola{{"Escola: 'A reivindicação foi aprovada' (J5, J7-10)"}}
  escola -->|"link do aviso: /escolas/[inep]/reivindicar, não /escola"| painelescola["/escola (J5)"]
  admin -->|"menu"| pap["/admin/papelarias"]
  cadpap{{"Papelaria: Enviar para análise (J6)"}} -.-> pap
  pap -. "'Recusar' é link ao detalhe (J7-02)" .-> papitem["/admin/papelarias/[id]"]
  pap -->|"Aprovar (1 clique, sem confirmar)"| aprovada["Estado Aprovada: só em 'Todas' (J7-08)"]
  aprovada -. "AUSENTE hoje (J7-06): nenhum aviso à papelaria" .-> painelpap{{"Papelaria: /papelaria 'Publicar papelaria' (J6)"}}
  admin -->|"menu"| den["/admin/denuncias"]
  den -->|"detalhe (sem seed)"| denitem["/admin/denuncias/[id]"]
  denitem -->|"arquivar lista"| listas["/admin/listas/[id] (órfã: só pela denúncia, J7-12)"]
  admin -->|"menu"| cont["/admin/contestacoes"]
  papelariacont{{"Papelaria: Contestar (J6)"}} -.-> cont
  cont -->|"Aceitar/Rejeitar (1 clique, sem motivo, J7-04)"| papelaria{{"Papelaria: 'Contestação rejeitada.' sem motivo, sem aviso (J6)"}}
  admin -->|"menu"| resto["/admin/planos · ia · repasses · inadimplencia · campanhas · parceiros · importacoes · eventos · auditoria"]
  vendas{{"Papelaria: Vendi (J6)"}} -.-> resto
  resto --> parc["/admin/parceiros/[id]"]
  resto --> imp["/admin/importacoes/[id] (sem seed; id inexistente cai no 404 público, J7-16)"]
  resto -. "trilha /admin/eventos mostra ator 'system' em toda decisão (J7-14)" .-> resto
```

## J8 · Parceiro B2B integra

Percorrida no navegador (fichas/J8.md): cadastro público, aprovação no admin, chave, widget (colado numa página de outra origem), webhook, campanha e a aprovação dela no admin. Chamadas reais à API e o extrato de faturamento não foram exercitados.

```mermaid
flowchart LR
  parceiros["/parceiros"] -->|"Falar com o time"| cad["#cadastro"]
  cad -. "SEM VOLTA hoje (J8-10): sem sessão só 'Entrar para enviar'; o formulário exige conta" .-> login["/entrar"]
  cad -->|"Enviar (com sessão)"| espera["/b2b (Aguardando aprovação, sem prazo nem contato)"]
  parceiros --> termos["/parceiros/termos"]
  parceiros --> pdocs["/parceiros/docs"]
  parceiros -->|"Entrar no portal"| b2b["/b2b (sem próximo passo, J8-05)"]
  espera -.->|"admin aprova em sandbox (J7)"| aprov{{"/admin/parceiros/[id]"}}
  aprov -. "AUSENTE hoje (J7-06): nenhum aviso ao parceiro" .-> b2b
  b2b --> api["/b2b/api (chaves)"]
  api -. "AUSENTE hoje (J8-06): sem exemplo copiável da primeira chamada" .-> docs["/b2b/docs"]
  api -. "a 390 px 'Rotacionar' e 'Revogar' ficam fora do cartão (J8-03)" .-> api
  b2b --> widget["/b2b/widget"]
  widget -.->|"script no site do parceiro"| externo{{"Widget em site externo: sem estilo, busca vazia muda (J8-02)"}}
  b2b --> web["/b2b/webhooks (http:// recusado sem dizer por quê, J8-08)"]
  b2b --> camp["/b2b/campanhas"]
  camp -. "SEM VOLTA hoje (J8-01): 'Nova campanha' para todo tipo, mas só marca cria" .-> campnova["/b2b/campanhas/nova"]
  campnova -->|"Criar e enviar para aprovação (marca)"| adminc{{"/admin/campanhas (J7-20)"}}
  adminc -->|"Aprovar (1 clique)"| camp
  b2b --> ins["/b2b/insights"]
  b2b --> fat["/b2b/faturamento"]
  b2b --> conta["/b2b/conta"]
```

## J9 · Sistema e bordas (piloto)

```mermaid
flowchart LR
  qualquer["Qualquer rota"] -->|"URL inexistente"| n404["404 (app/not-found)"]
  qualquer -->|"papel sem acesso"| n403["/403"]
  qualquer -->|"falha de renderização"| erro["error.tsx (Algo deu errado)"]
  qualquer -->|"carregando"| load["loading.tsx (9 rotas)"]
  qualquer -.->|"sem conexão"| offline["sem tela própria (só sw.js de push)"]
  qualquer -.->|"sessão expirada"| entrar["/entrar?next="]
  n404 -->|"Buscar escola"| escolas["/escolas"]
  n404 -->|"Ir para o início"| home["/"]
  n403 -->|"Entrar com outra conta"| entrar
  erro -->|"Tentar de novo"| qualquer
  primeira{{"Primeira visita: aviso de medição"}} -.->|"Aceitar ou Recusar"| qualquer
  email{{"E-mails: link de acesso e confirmação"}} -.-> entrar
  central{{"Central: /conta/notificacoes"}} -.-> qualquer
  home --> legal["/termos · /privacidade · /sobre · /como-funciona"]
  pesq["/pesquisa"] -->|"Começar"| perguntas["12 perguntas"]
  pesq -->|"Como usamos seus dados"| ppriv["/pesquisa/privacidade"]
  ppriv -->|"Voltar para a pesquisa"| pesq
  interno{{"Equipe"}} -.-> res["/pesquisa/resultados"]
  res -.->|"sem senha"| rlogin["/pesquisa/resultados/login"]
```
