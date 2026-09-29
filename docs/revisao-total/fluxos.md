# Mapa de fluxos · S29

Um diagrama por jornada (spec §4). Cada nó é uma rota (`app/**/page.tsx`) ou um estado global; cada aresta é a ação que leva de uma à outra. Linha tracejada e nó em hexágono `{{ }}` marcam **costura entre públicos**: quem age muda (família, escola, papelaria, equipe) ou a ação acontece fora do produto (e-mail, WhatsApp, loja). Rotas com `{x}` recebem dado do banco. As rotas dos passos foram conferidas contra `lib/ux-checks/journeys.ts`; as arestas de J1, J2, J3, J4, J5 e J9 foram percorridas no navegador (fichas em `fichas/`), as demais vêm do código e serão percorridas nas Tasks 7 a 9.

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

```mermaid
flowchart LR
  cad["/cadastrar-papelaria"] -->|"envia cadastro"| aprova{{"/admin/papelarias (J7)"}}
  aprova -.-> painel["/papelaria (checklist)"]
  painel --> areas["/papelaria/areas"]
  painel --> catalogo["/papelaria/catalogo"]
  painel --> creditos["/papelaria/creditos"]
  creditos -->|"abre fatura"| fatura["/papelaria/creditos/faturas/[id]"]
  painel --> leads["/papelaria/leads"]
  familia{{"Cotação enviada pela família (J2)"}} -.-> leads
  leads -->|"abre o pedido"| lead["/papelaria/leads/[code]"]
  lead -->|"Responder com preço"| resposta{{"Família recebe aviso (J2)"}}
  lead -->|"Registrar venda"| venda["Venda registrada"]
  lead -->|"Contestar cobrança"| contest{{"/admin/contestacoes (J7)"}}
  painel --> desempenho["/papelaria/desempenho"]
  painel -->|"ver página pública"| publica["/papelarias/[slug]"]
```

## J7 · Equipe opera (núcleo piloto)

```mermaid
flowchart LR
  admin["/admin (fila de atenção)"] --> revisao["/admin/revisao"]
  revisao --> revitem["/admin/revisao/[id]"]
  revitem -.->|"aprova"| aviso{{"Aviso à família (J4)"}}
  admin --> reiv["/admin/reivindicacoes"]
  reiv --> reivitem["/admin/reivindicacoes/[id]"]
  reivitem -.->|"decide"| escola{{"Escola confirma (J5)"}}
  admin --> pap["/admin/papelarias"]
  pap --> papitem["/admin/papelarias/[id]"]
  admin --> den["/admin/denuncias"]
  den --> denitem["/admin/denuncias/[id]"]
  admin --> cont["/admin/contestacoes"]
  cont -.->|"decide"| papelaria{{"Papelaria (J6)"}}
  admin --> listas["/admin/listas/[id]"]
  admin --> resto["/admin/planos · ia · repasses · inadimplencia · campanhas · parceiros · importacoes · eventos · auditoria"]
  resto --> parc["/admin/parceiros/[id]"]
  resto --> imp["/admin/importacoes/[id]"]
```

## J8 · Parceiro B2B integra

```mermaid
flowchart LR
  parceiros["/parceiros"] --> termos["/parceiros/termos"]
  parceiros --> pdocs["/parceiros/docs"]
  parceiros -->|"Entrar no portal"| b2b["/b2b"]
  b2b --> api["/b2b/api (chaves)"]
  api --> docs["/b2b/docs"]
  b2b --> widget["/b2b/widget"]
  widget -.->|"script no site do parceiro"| externo{{"Widget em site externo"}}
  b2b --> web["/b2b/webhooks"]
  b2b --> camp["/b2b/campanhas"]
  camp --> campnova["/b2b/campanhas/nova"]
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
