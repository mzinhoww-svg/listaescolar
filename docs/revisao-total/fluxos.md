# Mapa de fluxos · S29

Um diagrama por jornada (spec §4). Cada nó é uma rota (`app/**/page.tsx`) ou um estado global; cada aresta é a ação que leva de uma à outra. Linha tracejada e nó em hexágono `{{ }}` marcam **costura entre públicos**: quem age muda (família, escola, papelaria, equipe) ou a ação acontece fora do produto (e-mail, WhatsApp, loja). Rotas com `{x}` recebem dado do banco. As rotas dos passos foram conferidas contra `lib/ux-checks/journeys.ts`; as arestas de J1, J2 e J9 foram percorridas no navegador (fichas em `fichas/`), as demais vêm do código e serão percorridas nas Tasks 6 a 9.

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
  lista -->|"Pedir cotação"| cotacao["/cotacao/nova (J2)"]
  publicou{{"Escola publicou a lista (J5)"}} -.-> lista
  lista -.->|"exige login"| entrar["/entrar (J3)"]
```

## J2 · Família compra (piloto)

```mermaid
flowchart LR
  lista["/escolas/[inep]/[serie] (J1)"] -->|"Montar carrinho"| novo["/carrinho/novo?lista="]
  novo -.->|"sem sessão"| entrar["/entrar (J3)"]
  entrar -.->|"volta ao ponto de origem"| novo
  novo -->|"Comparar opções"| cart["/carrinho/[id]"]
  cart -->|"Ir para a loja"| irpara{{"/ir-para/[id]/[loja] (site da loja)"}}
  cart -->|"Pagar / checkout"| checkout["/carrinho/[id]/checkout"]
  cart -->|"Pedir cotação"| nova["/cotacao/nova"]
  lista -->|"Pedir cotação"| nova
  cotacaoidx["/cotacao"] -->|"Nova cotação"| nova
  nova -->|"escolhe papelaria e envia"| lead{{"Lead chega à papelaria (J6)"}}
  lead -.->|"papelaria responde"| cot["/cotacao/[code]"]
  nova -->|"pedido enviado"| cot
  cot -->|"Continuar no WhatsApp"| wa{{"WhatsApp da papelaria"}}
  cot -->|"Minhas compras"| compras["/conta/compras"]
  cart -->|"Minhas compras"| compras
  compras -->|"abre uma compra"| cot
  compras -->|"abre um carrinho"| cart
```

## J3 · Família entra e cuida da conta (piloto)

```mermaid
flowchart LR
  qualquer["Qualquer rota protegida"] -.->|"sem sessão, ?next="| entrar["/entrar"]
  entrar -->|"E-mail: link de acesso"| email{{"E-mail com link de acesso"}}
  entrar -->|"Continuar com Google"| google{{"Google"}}
  email -.->|"abre o link neste aparelho"| retorno["Rota de origem (next)"]
  google -.-> retorno
  retorno --> conta["/conta"]
  conta -->|"Adicionar aluno"| novoaluno["/conta/alunos/novo"]
  conta -->|"Editar"| editar["/conta/alunos/[id]/editar"]
  conta --> salvas["/conta/listas-salvas"]
  conta --> carrinhos["/conta/carrinhos"]
  conta --> notif["/conta/notificacoes"]
  conta --> priv["/conta/privacidade"]
  priv -->|"Excluir conta (ConfirmDialog)"| exclusao{{"Exclusão da conta"}}
  notif -.->|"aviso de lista pronta / cotação"| destino["Rota do aviso"]
```

## J4 · Família envia a lista da escola (piloto)

```mermaid
flowchart LR
  conta["/conta ou lista sem publicação"] -->|"Enviar a lista"| enviar["/enviar-lista"]
  enviar -->|"escolhe escola, série, arquivo, aceita consentimento"| status["/enviar-lista/[id] (processando)"]
  status -->|"leitura terminou"| revisar["/enviar-lista/[id]/revisar"]
  status -->|"falhou"| enviar
  status -.->|"cai em revisão humana"| admin{{"/admin/revisao (J7)"}}
  admin -.->|"aprova e publica"| aviso{{"Aviso: lista publicada (central e push)"}}
  revisar -->|"Salvar meus itens"| salvo["Cópia privada salva"]
  revisar -->|"Montar carrinho"| carrinho["/carrinho/novo (J2)"]
  aviso -.-> lista["/escolas/[inep]/[serie] (J1)"]
```

## J5 · Escola assume e publica (piloto)

```mermaid
flowchart LR
  escola["/escolas/[inep] (J1)"] -->|"Pedir para administrar"| reiv["/escolas/[inep]/reivindicar"]
  reiv -->|"envia evidência e aceite"| adminclaim{{"/admin/reivindicacoes (J7)"}}
  adminclaim -.->|"e-mail de confirmação"| confirmar["/escolas/[inep]/reivindicar/confirmar"]
  confirmar -->|"confirma"| painel["/escola"]
  painel -->|"Nova lista"| nova["/escola/listas/nova"]
  nova -->|"envia arquivo"| revisaoadm{{"/admin/revisao (J7)"}}
  revisaoadm -.->|"publica"| divulg["/escola (divulgação: link curto, QR)"]
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
