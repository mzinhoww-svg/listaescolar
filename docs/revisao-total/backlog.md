# Backlog da revisão total (S29)

Consolidação dos achados de `docs/revisao-total/fichas/J1.md` a `J9.md`, de `docs/revisao-total/checks.md` e `checks-antes.md`, de `docs/MELHORIAS.md` e de `docs/superpowers/DEBT.md` (D-161 é absorvida pela S29). Método e rubrica: `docs/revisao-total/rubrica.md`; spec: `docs/superpowers/specs/2026-09-29-s29-revisao-total-ux-design.md` (seções 3, 4 e 10). Documento só de leitura para as Tasks 10 a 18: cada task corrige os itens `UX-NNN` da sua tabela e marca o item como resolvido aqui e na ficha.

## Como ler

- **Severidade** (a do backlog prevalece sobre a das fichas): P0 bloqueia a jornada; P1 confunde ou atrasa a tarefa, ou viola WCAG AA; P2 inconsistência de sistema; P3 acabamento.
- **Regra de alvo de toque (Ruling do controlador):** alvo abaixo de 24 px = P1 (WCAG 2.5.8 AA); de 24 a 43 px = P2. Aplicada a todas as fichas: J2-07 e J3-07 sobem a P1; J5-05 e J7-05 já eram P1; J3-13 (título-link 196 x 24 e botões de 44 px) e J7-12 (28 px) ficam P2; J5-12 (rádio de 16 px dentro de rótulo de mais de 44 px) fica P2; links dentro de frase são isentos.
- **Destino:** "Obrigatório" = P0 e P1 das jornadas piloto (J1 a J6 e J9) e do núcleo da J7 (J7-01 a J7-05 e J7-14), mais os testes do Review Focus do plano; "Fazer" = P2 e P3 (entram na task, salvo Ruling); "Adiar" = Ruling de adiamento proposto com o motivo (a task confirma no `docs/superpowers/ledger.md`).
- **Task de correção** (ordem do plano): 10 = J9, 11 = J1, 12 = J2, 13 = J3, 14 = J4, 15 = J6, 16 = J5, 17 = J7, 18 = J8. Item que cruza jornadas vai para a primeira task, na ordem do plano, que é dona do código; o item par da outra jornada cita o `UX-NNN` irmão. A coluna "Jornada" é a da ficha de origem.
- **Rastreio:** o anexo A leva cada ID de ficha ao(s) `UX-NNN`, item de "Aguardando humano" (`H-NN`) ou de "Lacunas" (`L-*`). Itens `RF-*` vêm do Review Focus do plano (Tasks 11 a 14), sem ID de ficha. Itens `D-161*` vêm da dívida D-161.
- Nenhum CNPJ, e-mail pessoal ou dado de pessoa aparece aqui.

## Resumo

### Itens do backlog (consolidados) por jornada e severidade


| Jornada | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| J1 | 0 | 2 | 5 | 5 | 12 |
| J2 | 0 | 4 | 7 | 3 | 14 |
| J3 | 0 | 2 | 12 | 4 | 18 |
| J4 | 0 | 2 | 6 | 5 | 13 |
| J5 | 0 | 4 | 7 | 3 | 14 |
| J6 | 0 | 6 | 10 | 2 | 18 |
| J7 | 0 | 6 | 11 | 4 | 21 |
| J8 | 0 | 3 | 7 | 4 | 14 |
| J9 | 0 | 0 | 7 | 5 | 12 |
| **Total** | **0** | **29** | **72** | **35** | **136** |


Os itens somam 136 porque achados com a mesma causa foram fundidos (por exemplo J5-02 e J5-03, J1-04 e J4-01) e alguns achados geraram um item por lado da costura (J6-01, J6-02). "Aguardando humano" e "Lacunas" não entram nas contagens.

### Achados das fichas após a normalização de severidade


| Jornada | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| J1 | 0 | 2 | 5 | 7 | 14 |
| J2 | 0 | 3 | 7 | 4 | 14 |
| J3 | 0 | 2 | 14 | 5 | 21 |
| J4 | 0 | 2 | 7 | 7 | 16 |
| J5 | 0 | 5 | 7 | 3 | 15 |
| J6 | 0 | 5 | 9 | 2 | 16 |
| J7 | 0 | 6 | 11 | 3 | 20 |
| J8 | 0 | 3 | 7 | 4 | 14 |
| J9 | 0 | 1 | 8 | 7 | 16 |
| **Total** | **0** | **29** | **75** | **42** | **146** |


Total de 146 achados nas fichas (J1: 14, J2: 14, J3: 21, J4: 16, J5: 15, J6: 16, J7: 20, J8: 14, J9: 16). Mudanças de severidade: J2-07 P2 para P1 e J3-07 P3 para P1 (regra de alvo), J6-14 P2 para P1 (a nota entra na média pública), J7-14 P2 para P1 (ator "system" na trilha), J7-11 P3 para P2 e J7-16 P3 para P2 (Ruling do controlador). J9-01 e J9-08 não têm item de código próprio e estão só em "Aguardando humano"; J1-07 e J9-16 estão só em "Lacunas". Os 29 itens "Obrigatórios" são os P1 das jornadas piloto e do núcleo da J7 mais os três testes do Review Focus que não são P1 (RF-J1, RF-J2b e o teste de redirecionamento de J3 dentro do item de J9-12).

### Itens por task de correção


| Task | Jornada | Itens | P0 | P1 | P2 | P3 | Obrigatórios | Com Ruling de adiamento proposto |
|---|---|---|---|---|---|---|---|---|
| 10 | J9 · Sistema e bordas (e seed/checker) | 11 | 0 | 0 | 6 | 5 | 0 | 2 |
| 11 | J1 · Família acha a lista | 13 | 0 | 3 | 5 | 5 | 4 | 1 |
| 12 | J2 · Família compra | 16 | 0 | 6 | 7 | 3 | 7 | 0 |
| 13 | J3 · Família entra e cuida da conta | 19 | 0 | 2 | 13 | 4 | 3 | 0 |
| 14 | J4 · Família envia a lista da escola | 14 | 0 | 2 | 7 | 5 | 2 | 0 |
| 15 | J6 · Papelaria vende | 15 | 0 | 3 | 10 | 2 | 3 | 0 |
| 16 | J5 · Escola assume e publica | 14 | 0 | 4 | 7 | 3 | 4 | 0 |
| 17 | J7 · Equipe opera | 20 | 0 | 6 | 10 | 4 | 6 | 3 |
| 18 | J8 · Parceiro B2B integra | 14 | 0 | 3 | 7 | 4 | 0 | 3 |
| **Total** | | **136** | **0** | **29** | **72** | **35** | **29** | **9** |


## Rulings aplicados nesta consolidação

1. Severidade de alvo de toque: menos de 24 px = P1, de 24 a 43 px = P2 (ver "Como ler").
2. J7-14 (decisões da equipe com ator "system" na trilha) = P1, "verificar no código". Verificado: `audit_row_change` (`supabase/migrations/0001_base_schema.sql`) grava `auth.uid()` e as Server Actions do admin usam `createAdminClient()` (chave secreta, sem sessão); é falha de rastreabilidade, não só de UX. Ver o item de J7-14 na Task 17.
3. J6-14: a nota 5 pré-marcada entra na média pública (`components/stationeries/PublicProfileView.tsx`, `avg`), então P1. J7-11: o servidor já valida o motivo (`app/admin/reivindicacoes/actions.ts`), o defeito é de formulário e texto, P2. J7-16: 404 público sem caminho para a equipe, P2.
4. J5-02 e J5-03 têm a mesma causa (casca da escola sem navegação e envio que cai na tela da família): um único item na Task 16.
5. Itens só do humano vão para "Aguardando humano" (J9-01, o texto do e-mail no painel do Supabase de J3-02, estados que dependem de `OPENROUTER_KEY`); a parte de J3-02 dentro do app continua item de código.
6. Lacunas de seed e de checker de todas as fichas e de `checks.md` estão numa seção só, "Lacunas de seed e checker (Task 10)".
7. O CNPJ escrito à mão em `fichas/J7.md` e o e-mail pessoal de `fichas/J9.md` foram trocados por placeholder; nada disso foi copiado para este backlog.
8. Referências cruzadas incluídas: J2-01 e J2-02 com J6-02 e J6-14 (nas fichas e aqui: UX de `/conta/compras` e de "Comprei aqui" citam a nota e a resposta da papelaria). Rótulos de correção do checker que diziam "Task 4" passaram a "Task 10".

## Itens por task de correção


### Task 10 · J9 · Sistema e bordas (e seed/checker)

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-001 | P2 | J9 | J9-02 | `/como-funciona`, `/sobre`, `/termos`, `/privacidade`, `/pesquisa/privacidade` | `app/(site)/como-funciona/page.tsx`<br>`app/(site)/sobre/page.tsx`<br>`app/(site)/termos/page.tsx`<br>`app/(site)/privacidade/page.tsx`<br>`components/site/LegalPage.tsx`<br>`app/pesquisa/privacidade/page.tsx` | Fechar cada página com uma ação adiante: "Buscar a escola" em `/como-funciona` e "Voltar ao início" nas páginas legais. | `node scripts/s29-checks.mjs --jornada J9` sem "sem ação adiante" nas 5 rotas; teste de página em `tests/site/pages.test.tsx`. | **Resolvido (Task 10)** |
| UX-002 | P3 | J9 | J9-03 | `/pesquisa`, `/pesquisa/resultados`, `/pesquisa/resultados/login` | `app/pesquisa/layout.tsx`<br>`app/pesquisa/page.tsx`<br>`components/pesquisa/Cabecalho.tsx` | Dar caminho de volta ao site nas telas da pesquisa e marcar a área de resultados como interna (`noindex`, link "Voltar ao site"). | `s29-checks --jornada J9` sem "sem caminho de volta" nas 3 rotas; teste em `tests/pesquisa/`. | **Resolvido (Task 10)** |
| UX-003 | P3 | J9 | J9-04, J9-05 | `/403`, 404 global | `app/403/page.tsx`<br>`app/not-found.tsx` | Trocar "ERRO 403" por "Sem acesso a esta área" com orientação de quem deveria entrar, tirar o zero verde do 404 e registrar Ruling de que `/403` responde 200 por ser destino de redirect (ou devolver 403). | Teste de componente em `tests/site/not-found.test.tsx` (texto, sem `verde-certo`); `s29-checks` sem o achado "HTTP 200 (esperado 403)" ou com a exceção documentada. | **Resolvido (Task 10)** |
| UX-004 | P2 | J9 | J9-06 | todas as rotas sem `loading.tsx` | `app/loading.tsx` (novo)<br>`components/ui/Skeleton.tsx` | Criar `app/loading.tsx` com `Skeleton` de altura reservada (sem spinner de tela cheia) para as rotas sem carregando próprio. **Feito de outra forma (Ruling da Task 10, revisto na correção 1):** `PageLoading` só em `cadastrar-papelaria`; raiz e árvores com guard/`notFound()` ficam sem `loading.tsx`, por D-043 (soft-404 provado no E2E). | Teste em `tests/a11y/skeleton.test.tsx` (`role="status"`, `aria-busy`, sem `animate-spin`); captura a 390 com rede lenta. | **Resolvido (Task 10)** |
| UX-005 | P2 | J9 | J9-07 | erro no layout raiz e em qualquer rota | `app/error.tsx`<br>`app/global-error.tsx` (novo) | Criar `global-error.tsx` em português com a marca e reescrever "Algo deu errado" dizendo se o que a pessoa fez foi salvo e como falar com a equipe. | Teste de componente novo em `tests/site/` para `error.tsx` e `global-error.tsx` (texto, botão "Tentar de novo", link ao início). | **Resolvido (Task 10)** |
| UX-006 | P2 | J9 | J9-11 | todas (estado sem conexão) | `public/sw.js`<br>`app/layout.tsx`<br>`components/ui/OfflineNotice.tsx` (novo) | Mostrar aviso "Sem conexão" (eventos `offline` e `online`, `role="status"`) sem depender do service worker. | Teste de componente disparando `offline` e `online` em `tests/a11y/`. | **Resolvido (Task 10)** |
| UX-007 | P2 | J9 | J9-13, J3-02 | e-mails de acesso e de confirmação | `supabase/templates/magic_link.html`<br>`supabase/templates/confirmation.html`<br>`supabase/config.toml` | Pôr logo, o aviso "abra neste aparelho" e o prazo em minutos (mesmo valor de `otp_expiry` da configuração) nos modelos versionados no repositório; o texto de produção no painel do Supabase é do humano (seção "Aguardando humano", H-03). | Teste Vitest novo em `tests/auth/` que lê os dois modelos e exige logo, "neste aparelho" e o prazo derivado de `config.toml`. | **Resolvido (Task 10)** |
| UX-008 | P2 | J9 | J9-14, J7-10 | central de notificações; aviso de pedido de administração aprovado | `features/notifications/catalog.ts`<br>`features/notifications/copy.ts` | Trocar "reivindicação" por "pedido para administrar" nos títulos e corpos, tirar o código `LC-…` do corpo e apontar o aviso de pedido aprovado para `/escola` (hoje abre `/escolas/[inep]/reivindicar`). | Teste em `tests/notifications/copy.test.ts` (nenhum texto com "reivindica"; link do evento `claim_updated` aprovado = `/escola`). | **Resolvido (Task 10)** |
| UX-009 | P3 | J9 | J9-09 | `/pesquisa` | `components/pesquisa/pesquisa.module.css` | Trocar o loop decorativo `pesquisa-pulso` (1,4 s) por estado estático ou por animação única com `--mov-base`, respeitando `prefers-reduced-motion`. | `s29-checks` seção de movimento sem `pesquisa-pulso` na lista de isenções. | **Adiado** (Ruling da Task 10 confirmado no ledger; Ruling proposto: decorativo, já isento por lista nomeada, sem efeito no funil) |
| UX-010 | P3 | J9 | J9-10 | `/como-funciona` (1280) | `components/site/StepsSection.tsx`<br>`components/site/AboutSteps.tsx` | Reservar altura de título de duas linhas nos três passos para alinhar número e cartão. | Captura depois a 1280 e teste de classes em `tests/site/landing-refine.test.tsx`. | **Adiado** (Ruling da Task 10 confirmado no ledger; Ruling proposto: acabamento a 1280 px, fora do piloto mobile) |
| UX-011 | P3 | J9 | J9-15 | barra de consentimento de medição (todas) | `components/analytics/ConsentNotice.tsx` | Subir o texto para 14 px, tirar a sombra decorativa e impedir que a barra cubra ações fixas de rodapé (ex.: "Começar" de `/pesquisa`). | Teste em `tests/analytics/consent-notice.test.tsx` (classes) e captura com `NEXT_PUBLIC_POSTHOG_KEY` definida. | **Resolvido (Task 10)** |

### Task 11 · J1 · Família acha a lista

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-012 | P1 | J1 | J1-04, J4-01, J1-01, J3-03 | `/`, `/escolas/[inep]`, `/escolas/[inep]/[serie]` (não publicada), `/conta` | `features/site/copy.ts`<br>`components/lists/UnpublishedState.tsx`<br>`app/escolas/[inep]/page.tsx`<br>`components/schools/ProfileNotices.tsx`<br>`app/conta/page.tsx`<br>`components/schools/SearchResults.tsx` | Levar a "Enviar a lista da escola" (`/enviar-lista`) da página da escola, da série sem lista, do FAQ "Minha escola não aparece" e do hub da conta, com escola e série já escolhidas quando o formulário aceitar. | Teste de componente em `tests/lists/` e `tests/schools/` (link presente nos quatro pontos); `s29-checks --jornada J1`; E2E: da série sem lista chega ao formulário. | **Resolvido (Task 11)** |
| UX-013 | P1 | J1 | J1-02 | `/`, `/escolas/[inep]/[serie]` | `app/escolas/[inep]/[serie]/page.tsx`<br>`components/lists/ListHeader.tsx`<br>`components/site/HeroListCard.tsx`<br>`components/cart/OptionCard.tsx` | Oferecer "Pedir preço à papelaria do bairro" como ação secundária na lista (e transformar o texto do cartão da home em link), abrindo o fluxo de cotação sem passar por opções de loja sem preço; rota final combinada com a Task 12. | Teste de componente da lista (`tests/lists/`) com o novo controle; `s29-checks --jornada J1`; E2E lista para cotação. | **Resolvido (Task 11)** |
| UX-014 | P2 | J1 | J1-03, J2-10 | `/escolas/[inep]/[serie]`, `/carrinho/novo` | `app/escolas/[inep]/[serie]/page.tsx`<br>`components/lists/ListHeader.tsx`<br>`components/lists/UnpublishedState.tsx`<br>`app/carrinho/novo/page.tsx` | Avisar antes do clique que "Montar carrinho" e "Me avise" pedem entrada (uma linha), e manter a ação principal à vista com barra fixa que não cobre conteúdo (D-161 a). | Teste de componente (aviso só sem sessão; `tests/lists/`); captura a 390 de lista longa com a barra fixa. | **Resolvido (Task 11)** |
| UX-015 | P2 | J1 | J1-05 | `/`, `/escolas` | `features/site/copy.ts`<br>`components/site/Hero.tsx`<br>`components/schools/SchoolCard.tsx`<br>`app/escolas/SearchForm.tsx` | Explicar "código INEP (o número da escola no Censo Escolar)" na primeira menção de cada tela e usar "pedido de cotação" no lugar de "orçamento". | Teste de vocabulário em `tests/site/copy-claims.test.tsx` (INEP só com explicação na primeira menção). | **Resolvido (Task 11)** |
| UX-016 | P2 | J1 | J1-06 | cabeçalho do site (390 px) | `components/site/SiteHeader.tsx`<br>`components/site/Hero.tsx` | Fazer o menu do topo quebrar em linhas ou virar botão "Menu" e afastar os chips de rede da borda direita a 390 px. | Teste de componente do cabeçalho (`tests/site/pages.test.tsx`) e sonda de corte de texto a 390 no `s29-checks`. | **Resolvido (Task 11)** |
| UX-017 | P2 | J1 | J1-11 | `/escolas/[inep]` | `app/escolas/[inep]/GradeYearPicker.tsx`<br>`app/escolas/[inep]/PublishedShortcuts.tsx`<br>`app/escolas/[inep]/page.tsx` | Deixar uma só forma de escolher a série (chips das listas publicadas) e levar direto à lista, sem passo extra "Ver lista". | Teste de componente (`tests/schools/`): um clique abre a lista; `s29-checks --jornada J1`. | **Resolvido (Task 11)** |
| UX-018 | P1 | J6 | J6-01 | `/`, rodapé, `/cadastrar-papelaria` (porta de entrada) | `components/site/SiteFooter.tsx`<br>`components/site/SiteHeader.tsx`<br>`features/site/copy.ts`<br>`components/site/Section.tsx` | Pôr "Sou papelaria" (para `/cadastrar-papelaria`) na home e no rodapé, ao lado de "Sou escola"; o cabeçalho e a volta da própria rota ficam no item de cadastro da Task 15. | Teste de componente em `tests/site/pages.test.tsx` (link no rodapé e na seção); `s29-checks --jornada J1`. | **Resolvido (Task 11)** |
| UX-019 | P3 | J1 | J1-08, J1-09 | `/` | `components/site/Section.tsx`<br>`components/site/HeroListCard.tsx`<br>`components/site/StepsSection.tsx` | Tirar as legendas em caixa alta espaçada, trocar as caixas verdes do cartão de exemplo por neutras (nada resolvido) e alinhar o cartão a 1280 px (D-161 e). | Teste de classes em `tests/site/landing-refine.test.tsx` (sem `verde-certo` em estado neutro); captura a 390 e 1280. | **Resolvido (Task 11)** |
| UX-020 | P3 | J1 | J1-12 | `/escolas/[inep]/[serie]` | `components/lists/ItemsTable.tsx` | Agrupar os itens em lista contínua por categoria (sem cartão branco por linha) e tirar a caixa alta de "PAPELARIA". | Teste de componente `tests/lists/`; captura a 390. | **Resolvido (Task 11)** |
| UX-021 | P3 | J1 | J1-13 | `/escolas/[inep]` | `components/schools/StatusBadges.tsx`<br>`components/schools/ProfileNotices.tsx`<br>`components/schools/ReportListForm.tsx`<br>`app/escolas/[inep]/page.tsx` | Trocar "Com admin" e "vínculo do representante verificado" por texto da marca e levar "Denunciar" para junto da lista. | Teste de texto em `tests/schools/`. | **Resolvido (Task 11)** |
| UX-022 | P3 | J1 | J1-14 | `/escolas/[inep]/[serie]`, `/l/[code]/qr` | `components/share/CopyLinkButton.tsx`<br>`components/share/ShareListCard.tsx`<br>`app/l/[code]/qr/route.ts` | Usar `Button`/`buttonClass` no "Copiar link", renomear "Baixar QR (SVG)" para "Baixar QR da lista" e dar título ao QR aberto no navegador. | Teste `tests/site/list-share.test.tsx` (rótulo, estados); `s29-checks --jornada J1` sem "botão fora do sistema". | **Resolvido (Task 11)** |
| UX-023 | P3 | J1 | J1-10, J3-20 | `/escolas/*`, `/conta/*` (1280) | `components/site/SiteHeader.tsx`<br>`app/conta/layout.tsx` | Usar melhor a largura no desktop (coluna de 372 a 420 px com cabeçalho escuro de largura total). | Captura a 1280 antes e depois. | **Adiado (Task 11, Ruling confirmado)** |
| UX-024 | P2 | J1 | RF-J1 | `/escolas/[inep]/[serie]`, `/escolas/[inep]`, `/escolas` (390) | `components/lists/ListHeader.tsx`<br>`components/schools/ProfileHeader.tsx`<br>`components/schools/SchoolCard.tsx` | Garantir que nome de escola com 90 caracteres quebre linha sem rolagem horizontal a 390 px. | Checagem do `s29-checks` (rolagem horizontal) com o seed contendo escola de nome longo (ver Lacunas de seed); teste de classes `break-words`/`min-w-0`. | **Resolvido (Task 11)** |

### Task 12 · J2 · Família compra

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-025 | P1 | J2 | J2-01 | `/conta/compras`, `/cotacao/[code]`, `/conta` | `app/conta/compras/page.tsx`<br>`app/conta/page.tsx`<br>`app/cotacao/[code]/page.tsx`<br>`features/notifications/catalog.ts`<br>`features/conversion/actions.ts` | Ligar `/conta/compras` ao app (link "Minhas compras" no hub, botão "Informar a compra" em `/cotacao/[code]` e destino do aviso "sua cotação chegou") e dar-lhe cabeçalho com título e volta. Costura com J6-02 e J6-14. | Teste de componente do hub e da página (`tests/leads/pages.test.tsx`); `s29-checks --jornada J2` sem "sem caminho de volta" em `/conta/compras`; E2E cotação para compras. | **Resolvido (Task 12)** |
| UX-026 | P1 | J2 | J2-02 | `/conta/compras` | `app/conta/compras/PurchaseCard.tsx`<br>`components/ui/ConfirmDialog.tsx`<br>`features/conversion/messages.ts` | Explicar o efeito de "Comprei aqui" (registra venda que pode gerar cobrança à papelaria), pedir confirmação com `ConfirmDialog` e oferecer desfazer/corrigir. Costura com J6-14. | Teste de componente em `tests/conversion/` (diálogo antes do envio; Esc cancela). | **Resolvido (Task 12)** |
| UX-027 | P1 | J6 | J6-14 | `/conta/compras`, `/papelarias/[slug]` | `app/conta/compras/PurchaseCard.tsx`<br>`components/stationeries/PublicProfileView.tsx`<br>`features/conversion/schemas.ts` | Reclassificado P1: a nota vem pré-marcada em 5 (`defaultChecked`) e entra na média pública da papelaria (`PublicProfileView.tsx`, `avg`), então tirar o padrão, exigir escolha explícita e só perguntar "Você comprou?" depois de um tempo mínimo definido em Ruling. | Teste de componente em `tests/conversion/`: nenhum `radio` marcado ao abrir; envio sem nota é recusado com mensagem; pergunta ausente antes do tempo mínimo. | **Resolvido (Task 12)** |
| UX-028 | P1 | J6 | J6-02 | `/cotacao/[code]` (lado da família) | `app/cotacao/[code]/page.tsx`<br>`components/leads/Timeline.tsx`<br>`features/leads/messages.ts` | Quando a papelaria respondeu sem valor, dizer "A papelaria respondeu sem informar valor" (não "Confira o valor abaixo"), esconder "Cancelar pedido" e a prévia da mensagem e mostrar como falar com ela. Par do item de resposta da Task 15. | Teste de página em `tests/leads/pages.test.tsx` (resposta sem valor); `s29-checks --jornada J2`. | **Resolvido (Task 12)** |
| UX-029 | P1 | J2 | RF-J2a | `/cotacao/nova` | `app/cotacao/nova/ConsentForm.tsx`<br>`features/leads/actions.ts`<br>`components/cart/SubmitButton.tsx` | Ignorar o segundo toque em "Pedir cotação" (botão desabilitado ao enviar) e tornar a criação idempotente no servidor. | Teste da action com duas chamadas concorrentes resultando em um único registro (`tests/leads/actions.test.ts`) e teste de componente do botão (R-13). | **Resolvido (Task 12)** |
| UX-030 | P2 | J2 | RF-J2b | `/cotacao/nova` para `/carrinho/[id]` (histórico) | `app/carrinho/[id]/page.tsx`<br>`components/cart/OptionCard.tsx`<br>`app/cotacao/nova/page.tsx` | Manter a opção escolhida ao voltar pelo histórico, lendo-a da URL ou do servidor, não de estado React. | Teste de componente com o estado vindo da URL/servidor em `tests/cart/components.test.tsx`. | **Resolvido (Task 12)** |
| UX-031 | P2 | J2 | J2-03 | `/cotacao/nova`, `/cotacao/[code]` | `app/cotacao/nova/ConsentForm.tsx`<br>`components/leads/StationeryCard.tsx`<br>`app/cotacao/[code]/page.tsx` | Trocar o Verde Certo de botão principal e chip selecionado por Tinta (`buttonClass`) e dar motivo escrito ao lado do botão desabilitado. | `s29-checks --jornada J2` sem "botão fora do sistema"; teste de classes em `tests/leads/components.test.tsx`. | **Resolvido (Task 12)** |
| UX-032 | P2 | J2 | J2-04 | `/cotacao/[code]` | `app/cotacao/[code]/page.tsx`<br>`components/ui/ConfirmDialog.tsx` | Pedir confirmação com `ConfirmDialog` em "Cancelar pedido" e rotular "Cancelar este pedido de cotação". | Teste de componente (diálogo, Esc) em `tests/leads/`. | **Resolvido (Task 12)** |
| UX-033 | P2 | J2 | J2-05 | `/carrinho/[id]` | `components/cart/OptionCard.tsx`<br>`app/carrinho/[id]/page.tsx`<br>`components/cart/CartStates.tsx` | Destacar uma opção dominante (cotação local quando não há preço), rebaixar as demais a secundárias e mostrar "prazo e estoque indisponíveis" uma vez, não em cada cartão. | Teste `tests/cart/no-price-copy.test.tsx` e de componentes (`tests/cart/components.test.tsx`). | **Resolvido (Task 12)** |
| UX-034 | P2 | J2 | J2-13 | `/carrinho/[id]`, `/cotacao/nova` | `components/cart/OptionCard.tsx`<br>`app/cotacao/nova/page.tsx`<br>`components/cart/format.ts` | Rotular a cotação local parcial como "parcial: 2 de 4 itens com preço" em corpo normal, sem selo de "mais barata" nem peso igual ao dos totais completos. | Teste em `tests/cart/options-edge.test.ts` e de componente (texto de parcial). | **Resolvido (Task 12)** |
| UX-035 | P2 | J2 | J2-06 | `/cotacao/nova`, `/cotacao/[code]` | `features/leads/message.ts`<br>`app/cotacao/nova/ConsentForm.tsx`<br>`app/cotacao/[code]/page.tsx` | Chamar o endereço `/papelaria/leads/<code>` de "código do pedido" (não "link da lista") ou trocar por link público da lista, para a família não enviar URL interna. | Teste em `tests/leads/message.test.ts` (texto da mensagem e do consentimento). | **Resolvido (Task 12)** |
| UX-036 | P1 | J2 | J2-07 | `/ir-para/[cartId]/[retailer]`, `/carrinho/[id]/checkout` | `app/ir-para/[cartId]/[retailer]/page.tsx`<br>`app/carrinho/[id]/checkout/page.tsx`<br>`components/cart/StoreCard.tsx` | Dar alvo mínimo de 44 px a "Voltar ao carrinho" (342 x 23) e a "Buscar" (41 x 16), com 8 px de espaço entre alvos (abaixo de 24 px = P1, WCAG 2.5.8). | `s29-checks --jornada J2` sem "alvo < 44 px"; teste `tests/cart/store-card.test.tsx`. | **Resolvido (Task 12)** |
| UX-037 | P2 | J2 | J2-09 | `/carrinho/novo` (sem lista), `/cotacao/nova` (sem carrinho) | `app/carrinho/novo/page.tsx`<br>`app/cotacao/nova/page.tsx`<br>`components/cart/CartStates.tsx` | Levar os vazios a "Buscar escola" e "Meus carrinhos" em vez de só "Ir para o início". | `s29-checks --jornada J2` sem "sem caminho de volta" nas duas rotas; teste `tests/cart/components.test.tsx`. | **Resolvido (Task 12)** |
| UX-038 | P3 | J2 | J2-08, J2-14 | `/ir-para/…`, `/carrinho/[id]/checkout` | `app/ir-para/[cartId]/[retailer]/page.tsx`<br>`app/carrinho/[id]/checkout/page.tsx` | Fazer "Voltar ao carrinho" voltar ao carrinho, tirar o título duplicado "Comprar por loja", unir "Buscar" e "Abrir busca de …" e dar aparência ativa a "Já comprei em …". | Teste de textos em `tests/cart/`; captura a 390. | **Resolvido (Task 12)** |
| UX-039 | P3 | J2 | J2-11 | `/cotacao`, `/cotacao/[code]` | `app/cotacao/page.tsx`<br>`app/cotacao/[code]/page.tsx`<br>`components/leads/StatusBadge.tsx` | Voltar a `/conta` em `/cotacao`, deixar um só retorno em `/cotacao/[code]` e trocar o Verde Certo do status "Novo" por neutro. | Teste de componente `tests/leads/components.test.tsx`. | **Resolvido (Task 12)** |
| UX-040 | P3 | J2 | J2-12 | `/carrinho/novo` | `app/carrinho/novo/page.tsx`<br>`components/cart/CartIntro.tsx` | Tirar o passo intermediário que repete os itens ou fundir título e botão na mesma ação ("Comparar opções"). | Teste `tests/cart/create-cart-action.test.ts` e de componente. | **Resolvido (Task 12)** |

### Task 13 · J3 · Família entra e cuida da conta

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-041 | P2 | J3 | J3-01 | `/entrar` | `app/entrar/page.tsx`<br>`components/auth/Screen.tsx`<br>`app/entrar/LoginIntro.tsx` | Pôr logo clicável e "Voltar" em `/entrar` (e "voltar à lista" quando o `next` aponta para uma lista, D-161 f). | `s29-checks --jornada J3` sem "sem caminho de volta" em `/entrar`; teste `tests/auth/LoginForm.test.tsx`. | Fazer |
| UX-042 | P1 | J3 | J3-02 | `/entrar` (tela "link enviado") | `app/entrar/LinkSent.tsx`<br>`app/entrar/LoginForm.tsx`<br>`app/entrar/LoginIntro.tsx` | Mostrar antes do envio (14 px ou mais) "abra o e-mail neste aparelho; se abrir dentro do WhatsApp, abra no navegador" e repetir na tela "link enviado". O texto do e-mail no painel é do humano (H-03); D-163 (código de 6 dígitos) segue aberta. | Teste em `tests/auth/link-sent-m16.test.tsx` (orientação antes e depois do envio). | Obrigatório |
| UX-043 | P2 | J9 | J9-12, RF-J3 | `/entrar?next=`, qualquer rota protegida com sessão expirada | `app/entrar/page.tsx`<br>`features/auth/redirect.ts`<br>`features/auth/guard.ts`<br>`app/entrar/LoginIntro.tsx` | Dizer "sua sessão terminou" e para onde a pessoa volta; ação protegida com sessão expirada redireciona para `/entrar?next=<rota atual>` e, após entrar, volta à mesma rota. | Teste de `features/auth/redirect.ts` em `tests/auth/redirect.test.ts` e de guarda em `tests/auth/guard.test.ts` (Review Focus da Task 13). | Obrigatório (Review Focus do plano) |
| UX-044 | P2 | J3 | J3-06 | `/auth/confirm` | `app/auth/confirm/route.ts`<br>`features/auth/redirect.ts` | Preservar o `next` no redirecionamento de link vencido para `/entrar?erro=codigo&next=…` e explicar como pedir outro link. | Teste da rota em `tests/auth/routes.test.ts`. | Fazer |
| UX-045 | P2 | J3 | J3-04 | `/entrar` (Google) | `components/auth/GoogleButton.tsx`<br>`app/auth/callback/route.ts` | Tratar Google indisponível ou falha do provedor com mensagem no produto e volta a `/entrar`, sem JSON cru. | Teste do botão e do callback em `tests/auth/`. | Fazer |
| UX-046 | P2 | J3 | J3-05 | `/entrar` (reenvio) | `app/entrar/LinkSent.tsx` | Tirar a contagem de dentro de `aria-live` (anunciar só "você pode reenviar") e trocar `opacity-60` por estilo desabilitado com contraste 4,5:1. | Teste `tests/auth/link-sent-m16.test.tsx` (região viva não contém o número; estado desabilitado). | Fazer |
| UX-047 | P1 | J3 | J3-07 | `/entrar` | `components/auth/PrivacyNote.tsx` | Dar alvo mínimo de 44 px a "Termos" e "Política de Privacidade" (hoje 15 px, abaixo de 24 px = P1) e mover a nota do Google para junto do botão do Google. | `s29-checks --jornada J3` sem "alvo < 44 px" em `/entrar`; teste de componente. | Obrigatório |
| UX-048 | P2 | J3 | J3-03, J3-08, J3-09 | `/conta`, `/conta/carrinhos` | `app/conta/page.tsx`<br>`components/cart/CartsSection.tsx`<br>`components/students/StudentsSection.tsx` | Reorganizar o hub com uma ação principal, atalhos "Enviar a lista", "Minhas compras" e "Meus envios" e carrinho nomeado com escola, série e data (não "Mais barato"). | Teste do hub em `tests/a11y/conta.test.tsx`; `s29-checks --jornada J3`. | Fazer |
| UX-049 | P2 | J3 | J3-10 | `/conta`, `/conta/notificacoes`, `/conta/privacidade` | `app/conta/layout.tsx`<br>`app/conta/notificacoes/page.tsx`<br>`app/conta/privacidade/page.tsx`<br>`components/notifications/NotificationBell.tsx` | Dar "Voltar" e título às duas subrotas sem volta e fazer o sino levar à central (não a si mesmo). | `s29-checks --jornada J3` sem "sem caminho de volta" nas 3 rotas. | Fazer |
| UX-050 | P2 | J3 | J3-11 | `/conta/notificacoes` | `components/notifications/PreferencesForm.tsx`<br>`features/notifications/catalog.ts` | Explicar as 18 caixas desabilitadas ("canal ainda não disponível") uma vez por canal e tirar do menu da família os eventos de papelaria e escola. | Teste em `tests/notifications/central/`. | Fazer |
| UX-051 | P3 | J3 | J3-12 | `/conta/notificacoes` | `app/conta/notificacoes/page.tsx`<br>`components/notifications/PreferencesForm.tsx` | Afastar a legenda de cada grupo da borda do cartão e agrupar em lista única em vez de 9 cartões iguais. | Captura a 390. | Fazer |
| UX-052 | P2 | J3 | J3-13 | `/conta/listas-salvas`, `/conta/privacidade`, `/conta/carrinhos` | `app/conta/listas-salvas/page.tsx`<br>`components/privacy/ConsentsList.tsx`<br>`components/saved-lists/SavedListsSection.tsx`<br>`components/cart/CartsSection.tsx` | Trocar "Remover" e "Revogar" por `Button` com `ConfirmDialog` e rótulo verbo + objeto, dar 44 px ao título-link (196 x 24) e dar ação aos vazios. | `s29-checks --jornada J3` sem "botão fora do sistema" e "alvo < 44 px"; teste `tests/saved-lists/` e `tests/privacy/`. | Fazer |
| UX-053 | P2 | J3 | J3-14 | `/conta/alunos/novo`, `/conta/alunos/[id]/editar`, "Salvar lista" | `app/conta/alunos/actions.ts`<br>`components/lists/SaveListButton.tsx`<br>`app/conta/alunos/novo/page.tsx` | Confirmar "Aluno salvo" com `InlineStatus` na conta e dizer em "Lista salva" para qual aluno e onde achá-la. | Teste `tests/students/` e `tests/saved-lists/`. | Fazer |
| UX-054 | P2 | J3 | J3-15 | `/conta` | `components/students/StudentsSection.tsx` | Dar ao cartão do aluno as ações "Ver a lista do 5º ano" e "Enviar a lista", além de editar. | Teste `tests/students/` (links por aluno). | Fazer |
| UX-055 | P2 | J3 | J3-16 | `/conta/alunos/novo` | `components/students/StudentForm.tsx`<br>`components/ui/Field.tsx` | Usar `noValidate` e `Field` com erro em português junto do campo (`aria-invalid`, `aria-describedby`), avisar a regra "sem sobrenome" antes do envio e neutralizar a dica verde. | Teste de componente em `tests/students/` (mensagem, foco, ARIA). | Fazer |
| UX-056 | P2 | J3 | J3-21 | `/conta` | `app/conta/page.tsx` | Trocar `focus-visible:outline-verde-certo` por `outline-verde-fundo` no botão principal (e varrer o código por outros usos). | Teste Vitest que varre `app/` e `components/` e falha em `outline-verde-certo` sobre fundo claro (`tests/a11y/layout-rules.test.ts`). | Fazer |
| UX-057 | P3 | J3 | J3-17 | `/conta/privacidade` | `components/privacy/DeleteAccountForm.tsx`<br>`components/privacy/ConsentsList.tsx`<br>`app/conta/privacidade/page.tsx` | Encurtar o parágrafo de exclusão, trocar "estudantes", "JSON" e "/privacidade" por texto da marca e preservar a palavra digitada após erro. | Teste `tests/privacy/`. | Fazer |
| UX-058 | P3 | J3 | J3-18 | `/conta/alunos/novo`, `/enviar-lista` | `components/submissions/series-options.ts`<br>`components/students/GradeSelect.tsx`<br>`components/submissions/SeriesFields.tsx` | Usar um só vocabulário de séries nos dois formulários e nomear "Ensino Médio" em "1ª a 3ª série". | Teste unitário das listas de séries (`tests/submissions/`, `tests/students/`). | Fazer |
| UX-059 | P3 | J3 | J3-19 | `/conta` (Listas salvas) | `components/saved-lists/SavedListsSection.tsx` | Manter o vazio em uma frase contínua (o link com `min-h-11` não pode inflar a linha). | Captura a 390. | Fazer |

### Task 14 · J4 · Família envia a lista da escola

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-060 | P1 | J4 | J4-02 | `/enviar-lista/[id]`, `/conta` | `app/conta/envios/page.tsx` (novo)<br>`features/submissions/supabase-store.ts`<br>`app/conta/page.tsx`<br>`app/enviar-lista/[submissionId]/page.tsx` | Criar "Meus envios" (`/conta/envios`) com estado de cada envio e link ao resultado, e ligá-lo ao hub e à tela de andamento. | Teste da consulta (`tests/db/` ou `tests/submissions/`) e da página; `s29-checks --jornada J4` inclui a nova rota. | Obrigatório |
| UX-061 | P1 | J4 | RF-J4 | `/enviar-lista` | `app/enviar-lista/SubmitForm.tsx`<br>`components/submissions/prepareUpload.ts`<br>`components/submissions/StatusNotice.tsx` | Falha de rede no envio mostra erro acionável e "Tentar de novo" que reenvia sem pedir a série de novo. | Teste do componente de envio com `fetch` rejeitado em `tests/submissions/` (Review Focus da Task 14). | Obrigatório (Review Focus do plano) |
| UX-062 | P2 | J4 | J4-03, J4-05, J4-12 | `/enviar-lista/[id]` (estados finais) | `components/submissions/StatusNotice.tsx`<br>`components/submissions/ReviewSummary.tsx`<br>`components/submissions/ProcessingScreen.tsx` | Nos estados finais dizer se o envio valeu e se reenviar duplica, oferecer "Ir para minha conta" e "Revisar meus itens" quando houver cópia privada. | Teste `tests/submissions/` por estado; `s29-checks --jornada J4`. | Fazer |
| UX-063 | P2 | J4 | J4-06, J4-15 | `/enviar-lista` | `app/enviar-lista/SubmitForm.tsx`<br>`components/submissions/AsyncOptions.tsx`<br>`components/submissions/ConsentField.tsx` | Deixar uma só ação principal, dizer o aviso de revisão uma vez, neutralizar a faixa verde "A IA lê a lista", trocar hex avulsos por tokens e dar ao `h1` o tamanho das outras telas (D-161 g). | `s29-checks --jornada J4` sem "mais de uma ação principal"; teste `tests/submissions/`. | Fazer |
| UX-064 | P2 | J4 | J4-07 | `/enviar-lista` | `app/enviar-lista/SubmitForm.tsx`<br>`components/ui/Field.tsx`<br>`components/submissions/SeriesFields.tsx` | Validar tudo de uma vez e mostrar cada erro junto do campo (`aria-invalid`, `aria-describedby`), com foco no primeiro. | Teste de componente com formulário vazio em `tests/submissions/`. | Fazer |
| UX-065 | P2 | J4 | J4-10 | `/enviar-lista/[id]/revisar` | `components/review/ParentItemRow.tsx`<br>`components/review/ParentCopyEditor.tsx`<br>`app/enviar-lista/[submissionId]/revisar/page.tsx` | Dar rótulo visível e unidade a nome e quantidade, mostrar o alerta de leitura incerta na revisão da família e foco visível do sistema. | Teste `tests/review/parent-page.test.tsx` (rótulos, alerta). | Fazer |
| UX-066 | P2 | J4 | J4-14 | `/enviar-lista/[id]` (assíncrono), `/conta/notificacoes` | `components/submissions/AsyncOptions.tsx`<br>`components/notifications/PushOptIn.tsx` | Não prometer aviso onde o canal está indisponível: dizer "volte aqui para ver o resultado" e ligar a `/conta/envios`; canais reais dependem de credencial (H-07). | Teste de texto em `tests/submissions/`; verificação no staging (fora da fatia). | Fazer |
| UX-067 | P2 | J4 | J4-16 | `/enviar-lista` | `components/submissions/ConsentField.tsx`<br>`features/submissions/copy.ts` | Dizer no consentimento que a foto é lida por serviço de IA e revisada pela equipe e pedir para não mostrar dado do aluno; prazo de guarda fica "indisponível" até o humano definir (H-05). | Teste de texto em `tests/submissions/`; sinalização para revisão jurídica, sem afirmar conformidade. | Fazer |
| UX-068 | P2 | J7 | J7-10 | `/enviar-lista/[id]` (lista publicada) | `components/submissions/ReviewSummary.tsx`<br>`app/enviar-lista/[submissionId]/page.tsx` | No estado "Lista publicada" levar à lista publicada (`/escolas/[inep]/[serie]`) e tirar a tautologia "Sua lista foi publicada / A lista já está publicada". | Teste de componente em `tests/submissions/`. | Fazer |
| UX-069 | P3 | J4 | J4-04 | `/enviar-lista` | `app/enviar-lista/page.tsx`<br>`app/enviar-lista/SubmitForm.tsx` | Voltar à conta ou à escola de origem e guardar escola, série e foto escolhidas como rascunho. | Teste de componente (rascunho preservado). | Fazer |
| UX-070 | P3 | J4 | J4-08 | `/enviar-lista` | `components/submissions/SchoolPicker.tsx` | Buscar a escola ao digitar (sem botão desabilitado sem motivo), explicar INEP e usar rótulo visível "Nome ou código INEP da escola". | Teste `tests/submissions/`. | Fazer |
| UX-071 | P3 | J4 | J4-09 | `/enviar-lista` | `features/submissions/copy.ts`<br>`components/submissions/prepareUpload.ts` | Trocar siglas por "foto ou PDF" e dizer "Reduzimos a foto para caber" quando a redução ocorre. | Teste `tests/submissions/` de mensagens. | Fazer |
| UX-072 | P3 | J4 | J4-11 | `/enviar-lista/[id]/revisar` | `components/review/ParentItemRow.tsx` | Aplicar foco do sistema e permitir desfazer a remoção de item. | Teste de componente. | Fazer |
| UX-073 | P3 | J4 | J4-13 | `/enviar-lista` (sobreposição "Enviando sua lista") | `app/enviar-lista/SubmitForm.tsx`<br>`components/submissions/ProcessingScreen.tsx` | Renderizar a sobreposição sem segundo `main` nem segundo `h1`. | Teste de landmarks em `tests/a11y/layout-rules.test.ts`. | Fazer |

### Task 15 · J6 · Papelaria vende

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-074 | P1 | J6 | J6-02 | `/papelaria/leads/[code]` | `app/papelaria/leads/[code]/StatusForm.tsx`<br>`app/papelaria/leads/[code]/page.tsx`<br>`app/papelaria/actions.ts`<br>`features/conversion/actions.ts` | Fazer "Orçamento enviado" pedir o valor (ou "responder sem valor" com `ConfirmDialog`), permitir corrigir o valor e ter campo de mensagem. Par do item da Task 12. | Teste da action e do formulário em `tests/leads/actions.test.ts` e `tests/leads/components.test.tsx`. | Obrigatório |
| UX-075 | P1 | J6 | J6-03 | `/papelaria/leads/[code]` (390) | `components/leads/ItemsTable.tsx`<br>`app/papelaria/leads/[code]/page.tsx` | Trocar a tabela por cartões a 390 px (ou região rotulada que rola) para eliminar a rolagem horizontal da página (425 px). | `s29-checks --jornada J6` sem "rolagem horizontal" com o pedido de 4 itens (ver Lacunas); teste de classes. | Obrigatório |
| UX-076 | P1 | J6 | J6-04 | `/papelaria/leads/[code]`, `/papelaria` | `app/papelaria/leads/[code]/StatusForm.tsx`<br>`components/stationeries/StatusPanel.tsx`<br>`components/ui/ConfirmDialog.tsx` | Pedir `ConfirmDialog` (com o efeito escrito) em "Vendi", "Não fechou", "Orçamento enviado" e "Pausar", com desfazer onde couber. | Teste de componente em `tests/leads/components.test.tsx` e `tests/stationeries/` (diálogo por ação, Esc cancela). | Obrigatório |
| UX-077 | P2 | J6 | J6-01 | `/cadastrar-papelaria` | `app/cadastrar-papelaria/page.tsx`<br>`components/stationeries/RegistrationForm.tsx`<br>`components/stationeries/StatusPanel.tsx` | Dar cabeçalho com logo, "Voltar" e explicação do login antes do formulário (a porta de entrada é o item da Task 11). | `s29-checks --jornada J6` sem "sem caminho de volta" em `/cadastrar-papelaria`. | Fazer |
| UX-078 | P2 | J6 | J6-05 | `/papelaria/leads/[code]` | `app/papelaria/leads/[code]/StatusForm.tsx`<br>`app/papelaria/leads/[code]/DisputeForm.tsx`<br>`components/leads/LeadNextStep.tsx` | Mostrar só a próxima ação de cada estado como principal, dar rótulo visível aos campos e trocar "conversão" e "sinais" por texto do dono da papelaria. | Teste `tests/leads/components.test.tsx` e `tests/leads/messages.test.ts`. | Fazer |
| UX-079 | P2 | J6 | J6-06 | `/papelaria/leads/[code]` | `components/leads/ItemsTable.tsx`<br>`components/leads/format.ts` | Rotular a coluna como "Total no seu catálogo" e mostrar o preço unitário ("2 x R$ 12,90"). | Teste `tests/leads/components.test.tsx`. | Fazer |
| UX-080 | P2 | J6 | J6-07, D-161b, D-161c | `/papelaria` | `components/stationeries/StatusPanel.tsx`<br>`components/stationeries/ActivationChecklist.tsx`<br>`components/leads/KpiRow.tsx`<br>`app/papelaria/page.tsx` | Mostrar pedidos esperando resposta com link, dizer "Ativa" uma vez, ordenar `KpiRow` na ordem de leitura (sem `order-last`) e ajustar o texto do checklist. | Teste `tests/stationeries/` e `tests/leads/pages.test.tsx`. | Fazer |
| UX-081 | P2 | J6 | J6-08 | `/papelaria/creditos`, `/papelaria/leads/[code]` | `components/billing/TermsCheckbox.tsx`<br>`components/billing/StatementTable.tsx`<br>`app/papelaria/leads/[code]/DisputeForm.tsx`<br>`features/conversion/messages.ts` | Alinhar o aceite ao prazo real de 72 h (constante do código) em vez de "ainda não tem prazo", corrigir "1 itens" e dar espaço às colunas do extrato a 390 px. | Teste `tests/billing/` (texto do aceite) e de componente do extrato. | Fazer |
| UX-082 | P2 | J6 | J6-09 | `/papelaria/leads`, `/papelaria/desempenho` | `components/leads/LeadTable.tsx`<br>`components/leads/LeadCards.tsx`<br>`components/payouts/PerformanceSummaryView.tsx`<br>`app/papelaria/desempenho/page.tsx` | Trocar "enviado indisponível" e "1 itens", explicar "Lista aberta" e mostrar dado sem fonte como "indisponível" (nunca "R$ 0,00"). | Teste `tests/leads/components.test.tsx`, `tests/payouts/`. | Fazer |
| UX-083 | P2 | J6 | J6-10, J8-04 | casca da papelaria (390) | `components/stationeries/PanelShell.tsx`<br>`components/stationeries/NavLinks.tsx` | Reduzir o cabeçalho de 282 px para menos de 20% da tela, dar indício de rolagem ao menu (ou usar botão "Menu") e usar `Button` em "Sair". Mesmo padrão do portal B2B (item da Task 18). | Teste `tests/a11y/shells.test.tsx`; captura a 390. | Fazer |
| UX-084 | P2 | J6 | J6-11 | `/cadastrar-papelaria` | `components/stationeries/RegistrationForm.tsx`<br>`components/stationeries/fields.tsx`<br>`app/cadastrar-papelaria/actions.ts` | Limpar erros herdados do passo anterior, focar o primeiro campo com erro e dizer como corrigir o CNPJ. | Teste de componente do formulário em `tests/stationeries/`. | Fazer |
| UX-085 | P2 | J6 | J6-12 | `/cadastrar-papelaria` (Em análise) | `components/stationeries/StatusPanel.tsx`<br>`app/cadastrar-papelaria/page.tsx` | Dar ao estado "Em análise" logo, link à conta e à home, canal com a equipe e aviso de onde vem a decisão. | `s29-checks --jornada J6`; teste `tests/stationeries/`. | Fazer |
| UX-086 | P2 | J6 | J6-13 | `/papelarias/[slug]` | `app/papelarias/[slug]/page.tsx`<br>`components/stationeries/PublicProfileView.tsx` | Dar cabeçalho, logo e "Voltar", impedir que a barra do WhatsApp cubra "Avaliações" e alinhar "Pedir lista pelo WhatsApp" ao fluxo de "Pedir cotação" com código do pedido e consentimento. | Teste `tests/stationeries/`; `s29-checks --jornada J6`. | Fazer |
| UX-087 | P3 | J6 | J6-15 | `/cadastrar-papelaria`, `/papelaria`, `/papelaria/desempenho` | `features/leads/messages.ts`<br>`components/stationeries/RegistrationSteps.tsx`<br>`components/payouts/PerformanceSummaryView.tsx` | Trocar "pai" por "família", tirar "(S22)" e "ticket médio" e dar mensagens específicas depois de cada ação. | Teste de vocabulário em `tests/leads/messages.test.ts`. | Fazer |
| UX-088 | P3 | J6 | J6-16 | `/papelaria/catalogo`, `/papelaria/areas` | `components/stationeries/ImportForm.tsx`<br>`components/stationeries/ItemForm.tsx`<br>`app/cadastrar-papelaria/Stepper.tsx` | Usar campo de arquivo do sistema, dar exemplo a "Item", uma ação principal por formulário e token no lugar de `bg-[#d9d4c6]`. | `s29-checks --jornada J6` sem hex avulso; teste `tests/stationeries/`. | Fazer |

### Task 16 · J5 · Escola assume e publica

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-089 | P1 | J5 | J5-01 | `/escola` | `components/claims/my-school-rows.ts`<br>`components/claims/MySchoolCards.tsx`<br>`components/claims/MySchoolsTable.tsx`<br>`components/claims/SchoolPanelNav.tsx` | Ligar o cartão da escola e o item "Listas" do menu a `/escola/listas/nova` para enviar as demais séries. | Teste `tests/claims/pages.test.tsx` (link por série); E2E escola envia segunda série. | Obrigatório |
| UX-090 | P1 | J5 | J5-02, J5-03 | `/escola/listas/nova`, `/enviar-lista/[id]` | `components/submissions/SchoolShell.tsx`<br>`components/claims/SchoolPanelShell.tsx`<br>`app/escola/listas/nova/page.tsx`<br>`app/escola/listas/nova/SchoolUploadForm.tsx`<br>`app/enviar-lista/[submissionId]/page.tsx` | Usar `SchoolPanelShell` (menu, logo, volta) em `/escola/listas/nova` e levar o envio da escola a uma tela de andamento dentro do painel da escola, dizendo que a equipe revisa antes de publicar (costura com J7). | Teste `tests/claims/pages.test.tsx` e `tests/submissions/`; `s29-checks --jornada J5` sem "sem caminho de volta" a 390. | Obrigatório |
| UX-091 | P1 | J5 | J5-04 | `/escolas/[inep]/reivindicar` (todas as etapas) | `components/claims/ClaimStepper.tsx`<br>`components/claims/ClaimLayout.tsx`<br>`components/claims/ClaimFlow.tsx` | Conter a lista de etapas e o cartão na coluna de 390 px (416 e 437 px hoje) sem rolagem horizontal. | `s29-checks --jornada J5` sem "rolagem horizontal" (com o seed de escola sem administrador, ver Lacunas). | Obrigatório |
| UX-092 | P1 | J5 | J5-05 | `/escolas/[inep]/reivindicar`, `/confirmar` | `components/claims/ClaimLayout.tsx`<br>`app/escolas/[inep]/reivindicar/confirmar/page.tsx` | Dar 44 px a "Cancelar" (62 x 21), "Ver status do pedido" (294 x 21) e à logo (142 x 32), com 8 px entre alvos. | `s29-checks --jornada J5` sem "alvo < 44 px". | Obrigatório |
| UX-093 | P2 | J5 | J5-06 | `/escola`, `/escola/listas/nova` | `components/submissions/SchoolShell.tsx`<br>`components/claims/SchoolPanelShell.tsx`<br>`components/claims/SchoolPanelNav.tsx` | Tirar itens de menu sem destino ("Papelarias parceiras" sugere parceria inexistente; "Administradores" não existe) e fazer "Visão geral" e "Minhas escolas" apontarem para destinos diferentes ou virarem um. | Teste `tests/a11y/shells.test.tsx` (todo item do menu é link com destino). | Fazer |
| UX-094 | P2 | J5 | J5-07 | `/escola/listas/nova` | `components/submissions/SchoolShell.tsx` | Derivar o progresso do que foi feito (sem passo concluído com formulário vazio) ou removê-lo. | Teste de componente por estado. | Fazer |
| UX-095 | P2 | J5 | J5-08 | `/escolas/[inep]/reivindicar` (escola com administrador) | `app/escolas/[inep]/reivindicar/page.tsx`<br>`components/claims/ClaimLayout.tsx` | Oferecer caminho quando a escola já tem administrador (falar com a equipe, avisar que saiu) e tirar a frase da coluna Tinta que contradiz o aviso. | Teste `tests/claims/pages.test.tsx`; `s29-checks --jornada J5` sem "sem ação adiante". | Fazer |
| UX-096 | P2 | J5 | J5-09 | `/escolas/[inep]/reivindicar`, `/escola`, `/confirmar` | `components/claims/ClaimFlow.tsx`<br>`components/claims/ClaimTimeline.tsx`<br>`app/escola/page.tsx`<br>`app/escolas/[inep]/reivindicar/confirmar/page.tsx` | Mostrar o pedido em análise em `/escola` (ou na conta), tirar "Cancelar" depois do envio (ou fazê-lo cancelar) e dar botão de novo link em "Link inválido". | Teste `tests/claims/claim-flow.test.tsx`. | Fazer |
| UX-097 | P2 | J5 | J5-10 | `/escolas/[inep]/reivindicar` | `components/claims/CreateClaimForm.tsx`<br>`components/claims/EvidenceUploader.tsx`<br>`components/ui/Field.tsx` | Usar `noValidate` e `Field` com erro em português, um só controle de arquivo e exemplo em "Seu nome". | Teste `tests/claims/claim-ui.test.tsx`. | Fazer |
| UX-098 | P2 | J5 | J5-11 | `/escola`, `/escolas/[inep]` | `app/escola/page.tsx`<br>`components/share/ShareListCard.tsx`<br>`components/claims/MySchoolCards.tsx` | Trocar "Compartilhe a página" por ação real (link curto `/l/[code]`, QR, mensagem de WhatsApp) e levar "Ver a lista publicada" direto à lista. | Teste `tests/claims/pages.test.tsx` e `tests/site/list-share.test.tsx`. | Fazer |
| UX-099 | P2 | J5 | J5-12 | `/escolas/[inep]/reivindicar` | `components/claims/MethodPicker.tsx` | Pôr "Documentos" primeiro e as opções indisponíveis depois, mais baixas, com rádio de 24 px ou mais e contorno visível. | Teste `tests/claims/claim-ui.test.tsx`. | Fazer |
| UX-100 | P3 | J5 | J5-13 | `/escola`, `/escolas/[inep]/reivindicar` | `components/claims/ClaimLayout.tsx`<br>`components/claims/SchoolSummaryCard.tsx`<br>`components/claims/ClaimFlow.tsx` | Explicar INEP, tirar "(texto claim-v1)", trocar "lista publicada" por "lista oficial" e sublinhar "Ver status do pedido". | Teste de vocabulário em `tests/claims/`. | Fazer |
| UX-101 | P3 | J5 | J5-14 | `/escolas/[inep]/reivindicar` | `components/claims/ClaimFlow.tsx`<br>`components/claims/ClaimStepper.tsx`<br>`components/claims/ClaimTimeline.tsx` | Dizer "Pedido iniciado" uma vez e renomear as etapas (Pedido, Envio de arquivos, Análise) sem "Pedido" concluído enquanto o título pede para concluir. | Teste `tests/claims/claim-flow.test.tsx`. | Fazer |
| UX-102 | P3 | J5 | J5-15 | `/escola/listas/nova`, `/escola` | `app/escola/listas/nova/SchoolUploadForm.tsx`<br>`app/escola/page.tsx` | Usar `Button` em "escolha no computador", dizer "foto ou PDF" no celular, trocar `border-[#c9c3b3]` por token, "leitura automática" no lugar de "A IA está lendo" e uma ação principal em `/escola`. | `s29-checks --jornada J5` sem "botão fora do sistema". | Fazer |

### Task 17 · J7 · Equipe opera

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-103 | P1 | J7 | J7-01 | `/admin/papelarias`, `/admin/revisao`, `/admin/parceiros` (390) | `components/stationeries/AdminTable.tsx`<br>`components/review/ReviewQueueTable.tsx`<br>`app/admin/parceiros/page.tsx` | Manter a coluna de ação visível a 390 px (cartões por linha ou coluna fixa) com região rotulada quando houver rolagem. | Sonda nova de ação escondida em `lib/ux-checks/` (ver Lacunas) e `s29-checks --jornada J7`. | Obrigatório |
| UX-104 | P1 | J7 | J7-02 | `/admin/papelarias` | `app/admin/papelarias/page.tsx`<br>`app/admin/papelarias/actions.ts`<br>`components/ui/ConfirmDialog.tsx` | Trocar o link "Recusar" por ação real com motivo, pedir `ConfirmDialog` em "Aprovar" e tornar o nome da papelaria link ao detalhe. | Teste `tests/stationeries/` (diálogo, rótulo = efeito). | Obrigatório |
| UX-105 | P1 | J7 | J7-03 | `/admin/revisao`, `/admin/revisao/[id]` | `app/admin/revisao/[id]/page.tsx`<br>`components/review/DecisionPanel.tsx`<br>`app/admin/revisao/actions.ts` | Pedir `ConfirmDialog` em "Aprovar e publicar" e "Recusar", levar à lista publicada depois e dar caminho de desfazer (arquivar) a partir da revisão. | Teste `tests/review/components/` e `tests/review/actions.test.ts`. | Obrigatório |
| UX-106 | P1 | J7 | J7-04 | `/admin/contestacoes` | `app/admin/contestacoes/page.tsx`<br>`features/conversion/actions.ts`<br>`app/papelaria/leads/[code]/page.tsx` | Pedir confirmação e motivo (`resolution_reason`) em "Aceitar" e "Rejeitar", mostrar papelaria, detalhe e link ao pedido e registrar a decisão na linha do tempo da papelaria. | Teste `tests/conversion/service.test.ts` e de componente. | Obrigatório |
| UX-107 | P1 | J7 | J7-05 | `/admin/reivindicacoes/[id]`, `/admin/papelarias/[id]`, `/admin/parceiros`, `/admin/parceiros/[id]` | `app/admin/reivindicacoes/[id]/page.tsx`<br>`app/admin/papelarias/[id]/page.tsx`<br>`app/admin/parceiros/page.tsx`<br>`app/admin/parceiros/[id]/page.tsx` | Dar 44 px a "Voltar à fila" (75 x 21), "Abrir (link de 60 s)" (123 x 21), "Gerir" (34 x 18) e "Voltar à lista" (83 x 21), inclusive dentro de tabela (abaixo de 24 px = P1). | Sonda estendida (âncoras `inline` em tabela) no `s29-checks --jornada J7` sem "alvo < 44 px". | Obrigatório |
| UX-108 | P1 | J7 | J7-14 | `/admin/eventos` (trilha de auditoria) | `supabase/migrations/0001_base_schema.sql`<br>`app/admin/papelarias/actions.ts`<br>`lib/supabase/admin.ts`<br>`app/admin/eventos/page.tsx` | Verificado no código: `audit_row_change` grava `auth.uid()` e `createAdminClient()` (chave secreta) não tem sessão, então decisões da equipe saem com ator "system"; propagar o ator (`set_config` na RPC ou coluna lida no gatilho) e paginar, formatar antes/depois e trocar placeholders "UPDATE"/"school_lists". Pode ser defeito de rastreabilidade, não só de UX. | Teste `tests/db/` novo: decisão de admin grava o `actor_id` do admin em `audit_log`; `tests/admin/eventos-page.test.tsx`. | Obrigatório |
| UX-109 | P2 | J7 | J7-06 | decisão de papelaria, contestação e parceiro | `app/admin/papelarias/actions.ts`<br>`features/conversion/actions.ts`<br>`app/admin/parceiros/actions.ts`<br>`features/notifications/catalog.ts` | Emitir notificação ao decidir papelaria, contestação e parceiro (novos tipos no catálogo, títulos genéricos). | Teste `tests/notifications/dispatcher.test.ts` por decisão. | Fazer |
| UX-110 | P2 | J7 | J7-07 | `/admin` | `app/admin/page.tsx`<br>`components/admin/CountCard.tsx` | Criar a "fila de atenção" (reivindicações, listas em revisão, contestações abertas) com link para cada fila. | Teste `tests/admin/` da página; `s29-checks --jornada J7` sem "sem caminho de volta" em `/admin`. | Fazer |
| UX-111 | P2 | J7 | J7-08 | `/admin/papelarias` | `app/admin/papelarias/page.tsx`<br>`components/stationeries/AdminTable.tsx` | Dar aba (ou contagem) ao estado "Aprovada" e incluí-lo no contador de ativas. | Teste `tests/stationeries/`. | Fazer |
| UX-112 | P2 | J7 | J7-09 | `/admin/revisao/[id]` | `components/review/ReviewItemsEditor.tsx`<br>`components/review/ReviewItemRow.tsx`<br>`components/review/ReviewDocument.tsx` | Mostrar a tabela sem corte (cartões a 390), texto de apoio quando o PDF não carrega e "Ano letivo" somente leitura depois de publicar. | Teste `tests/review/components/`. | Fazer |
| UX-113 | P2 | J7 | J7-11 | `/admin/reivindicacoes/[id]` | `components/claims/DecisionForm.tsx`<br>`app/admin/reivindicacoes/actions.ts` | Reclassificado P2 (o servidor já valida): usar `noValidate` e `Field` com erro do produto em vez da bolha nativa em inglês e aproximar a decisão da evidência no celular. | Teste `tests/claims/action-form.test.tsx` (mensagem em português, foco no motivo). | Fazer |
| UX-114 | P2 | J7 | J7-12 | `/admin/listas/[id]`, `/admin/denuncias` | `app/admin/listas/[id]/page.tsx`<br>`app/admin/denuncias/page.tsx`<br>`app/admin/denuncias/[id]/page.tsx` | Dar volta, itens e link à lista pública a `/admin/listas/[id]` e alcançá-la também pelas listas, não só pela denúncia. | Teste `tests/admin/`; `s29-checks --jornada J7` com seed de denúncia (ver Lacunas). | Fazer |
| UX-115 | P2 | J7 | J7-16 | `/admin/importacoes/[batchId]` inexistente | `app/admin/importacoes/[batchId]/page.tsx`<br>`app/admin/not-found.tsx` (novo) | Reclassificado P2 (beco sem saída para a equipe): criar `not-found` do admin com volta à fila em vez do 404 público de famílias. | Teste de componente do `not-found` em `tests/admin/`. | Fazer |
| UX-116 | P2 | J7 | J7-15 | `/admin/repasses` | `app/admin/repasses/page.tsx`<br>`components/payouts/CommissionSettingsForm.tsx`<br>`components/payouts/PayoutKpiRow.tsx` | Tirar o verde de "R$ 0,00 já pago", trocar placeholders "10,00", "7", "20" por rótulo de exemplo e deixar uma ação principal. | Teste `tests/payouts/`. | Fazer |
| UX-117 | P2 | J7 | J7-18 | `/admin/planos` | `app/admin/planos/PlanForm.tsx`<br>`app/admin/planos/TierFields.tsx`<br>`app/admin/planos/PackageFields.tsx` | Pedir confirmação com resumo do efeito ao publicar preço, esconder faixas vazias e rotular colunas sem caixa alta. | Teste `tests/billing/`. | Fazer |
| UX-118 | P2 | J7 | J7-20, J8-09 | `/admin/campanhas` | `app/admin/campanhas/PendingCampaignRow.tsx`<br>`app/admin/campanhas/page.tsx`<br>`features/campaigns/admin-actions.ts` | Pedir confirmação em "Aprovar" campanha, mostrar parceiro e criativo, tirar o Verde Certo do botão e listar aprovadas com "Pausar". | Teste `tests/campaigns/`. | Fazer |
| UX-119 | P3 | J7 | J7-13 | `/admin/reivindicacoes`, contestações | `app/admin/reivindicacoes/page.tsx`<br>`app/admin/contestacoes/page.tsx` | Legendar "Sem canal de token" e "46/500" e trocar "Prazo do pai/papelaria" por "Prazo da família". | Teste de texto em `tests/admin/`. | Fazer |
| UX-120 | P3 | J7 | J7-17 | `/admin/importacoes` | `app/admin/importacoes/(lista)/page.tsx`<br>`components/admin/CountCard.tsx` | Alinhar os cartões às demais telas do admin (sem creme nem caixa alta espaçada). | Captura a 1280. | Adiar (Ruling proposto: tela interna de uso raro, fora do núcleo do piloto) |
| UX-121 | P3 | J7 | J7-19 | `/admin/ia`, `/admin/inadimplencia`, `/admin/campanhas` | `app/admin/ia/page.tsx`<br>`app/admin/inadimplencia/page.tsx`<br>`app/admin/campanhas/page.tsx` | Trocar vocabulário do processo ("ruling", "ledger", "falha aberta", ids técnicos) por texto da equipe. | Teste de texto em `tests/admin/`. | Adiar (Ruling proposto: telas internas, sem efeito no piloto) |
| UX-122 | P3 | J7 | D-161d | todas do admin (menu) | `components/admin/AdminNav.tsx`<br>`components/admin/AdminShell.tsx` | Agrupar o menu do admin por área em vez de lista única (M34). | Teste `tests/a11y/shells.test.tsx`. | Adiar (Ruling proposto: pós-piloto, D-161 d, menu já recolhe a 390 px) |

### Task 18 · J8 · Parceiro B2B integra

| ID | Sev. | Jornada | Fichas | Rota(s) | Arquivo(s) provável(is) | Correção | Prova | Destino |
|---|---|---|---|---|---|---|---|---|
| UX-123 | P1 | J8 | J8-01 | `/b2b/campanhas`, `/b2b/campanhas/nova` | `app/b2b/campanhas/page.tsx`<br>`app/b2b/campanhas/nova/page.tsx`<br>`components/b2b/PortalShell.tsx`<br>`features/campaigns/messages.ts` | Esconder "Campanhas" e "Nova campanha" de parceiro que não é do tipo marca e explicar o tipo em vez de "Você não tem acesso". | Teste `tests/campaigns/` e `tests/b2b/portal-pages.test.tsx` (varejista). | Fazer (P1 fora do piloto; adiar só com Ruling) |
| UX-124 | P1 | J8 | J8-02 | `/b2b/widget`, `public/widget.js` | `public/widget.js`<br>`app/b2b/widget/page.tsx`<br>`app/b2b/widget/WidgetConfigForm.tsx` | Fazer o widget carregar estilo próprio (inline no script ou `<link>` no código de incorporação) e dizer algo na busca sem resultado ou com erro de rede. | Teste do widget em `tests/widget/` e captura em página de outra origem. | Fazer (P1 fora do piloto; adiar só com Ruling) |
| UX-125 | P1 | J8 | J8-03 | `/b2b/api`, `/b2b/campanhas` (390) | `app/b2b/api/KeyTable.tsx`<br>`app/b2b/campanhas/CampaignsTable.tsx` | Manter "Rotacionar", "Revogar", "Pausar" e "Concluir" à vista a 390 px (cartões por linha). | Sonda de ação escondida (ver Lacunas) e `tests/b2b/components.test.tsx`. | Fazer (P1 fora do piloto; adiar só com Ruling) |
| UX-126 | P2 | J8 | J8-04 | `/b2b/*` (390) | `components/b2b/PortalShell.tsx` | Reduzir o cabeçalho de 37% da tela e mostrar todo o menu (botão "Menu" ou indício de rolagem). Mesmo padrão do item da Task 15. | Teste `tests/a11y/shells.test.tsx`. | Fazer |
| UX-127 | P2 | J8 | J8-05 | `/b2b`, `/b2b/faturamento` | `app/b2b/page.tsx`<br>`app/b2b/faturamento/page.tsx`<br>`components/b2b/KpiCard.tsx`<br>`components/b2b/StatusBadge.tsx` | Dar próximo passo ("Criar a chave"), texto de "indisponível" em corpo normal, "1 lista" no singular e verde só em estado resolvido. | Teste `tests/b2b/portal-pages.test.tsx`. | Fazer |
| UX-128 | P2 | J8 | J8-06 | `/b2b/api`, `/b2b/docs`, `/parceiros/docs` | `app/b2b/api/page.tsx`<br>`app/b2b/docs/page.tsx`<br>`app/parceiros/docs/page.tsx`<br>`components/b2b/CodeSample.tsx` | Dar exemplo `curl` copiável com a chave do ambiente (`lc_test_` vs `lc_live_`) e preencher a coluna "Descrição". | Teste `tests/b2b/components.test.tsx`. | Fazer |
| UX-129 | P2 | J8 | J8-07 | `/b2b/widget` | `app/b2b/widget/WidgetConfigForm.tsx`<br>`app/b2b/widget/page.tsx` | Rotular o campo de cor, dizer por que "Salvar" está desabilitado, desativar "Copiar código" com o widget desligado e trocar colchetes e emoji da pré-visualização. | Teste `tests/b2b/components.test.tsx`. | Fazer |
| UX-130 | P2 | J8 | J8-08 | `/b2b/webhooks` | `app/b2b/webhooks/EndpointForm.tsx`<br>`app/b2b/webhooks/EndpointsSection.tsx` | Dizer "a URL precisa começar com https://" junto do campo, tirar o Verde Certo dos chips e dar motivo a "Criar endpoint" desabilitado. | Teste `tests/b2b/components.test.tsx`. | Fazer |
| UX-131 | P2 | J8 | J8-09 | `/b2b/campanhas/nova`, `/parceiros` | `app/b2b/campanhas/nova/NovaCampanhaForm.tsx`<br>`app/parceiros/page.tsx` | Remover ou reescrever como sinalização as afirmações sem fonte ("Lei 12.886", "Checagem automática Procon", "As listas escolares do Brasil", "Sem custo para a escola"); a fonte e a aprovação são do humano (H-06). | Teste `tests/site/copy-claims.test.tsx` estendido a `/parceiros` e ao formulário. | Fazer |
| UX-132 | P2 | J8 | J8-10 | `/parceiros` (`#cadastro`), `/b2b?ok=cadastro` | `app/parceiros/page.tsx`<br>`app/parceiros/ApplyForm.tsx`<br>`app/b2b/page.tsx`<br>`app/parceiros/actions.ts` | Explicar que o formulário pede entrada, dar prazo e contato na tela "Aguardando aprovação", trocar "Plano sem plano" e deixar um só primário em `/parceiros` (checker: `main=2`). | `s29-checks --jornada J8` sem "mais de uma ação principal"; teste `tests/b2b/parceiros-pages.test.tsx`. | Fazer |
| UX-133 | P3 | J8 | J8-11 | `/b2b/insights` | `app/b2b/insights/InsightsExplorer.tsx` | Trocar "Total exibido: 0" por "indisponível" quando não há dado e explicar "k mínimo". | Teste `tests/b2b/components.test.tsx`. | Adiar (Ruling proposto: B2B fora do piloto de famílias) |
| UX-134 | P3 | J8 | J8-12 | `/parceiros`, `/b2b`, `/b2b/conta` | `app/parceiros/page.tsx`<br>`app/b2b/conta/page.tsx`<br>`app/b2b/page.tsx` | Trocar "pai", "1 listas", "Plano sem plano" e "b2b-api-terms-v1" e mascarar o CNPJ. | Teste de texto em `tests/b2b/`. | Adiar (Ruling proposto: B2B fora do piloto de famílias) |
| UX-135 | P3 | J8 | J8-13 | `/parceiros`, `/parceiros/termos`, `/parceiros/docs`, `/b2b/conta` | `app/parceiros/termos/page.tsx`<br>`app/parceiros/docs/page.tsx`<br>`app/b2b/conta/page.tsx` | Deixar a faixa de navegação sem corte a 390 px, dar próximo passo aos termos e à documentação e canal na conta. | `s29-checks --jornada J8` sem "sem ação adiante". | Adiar (Ruling proposto: B2B fora do piloto de famílias) |
| UX-136 | P3 | J8 | J8-14 | `/b2b/*` | `app/b2b/loading.tsx`<br>`app/b2b/insights/InsightsExplorer.tsx`<br>`app/b2b/campanhas/CampaignsTable.tsx`<br>`app/b2b/faturamento/page.tsx`<br>`components/b2b/StatusBadge.tsx` | Trocar o spinner de tela cheia por `Skeleton` (com `motion-reduce`) e os hex `#EFEBE2`, `#FDEBD3`, `#6B3A00` por tokens. | `s29-checks --jornada J8` sem hex avulso; teste `tests/a11y/skeleton.test.tsx`. | Fazer |

## Aguardando humano

Ações que só o humano executa (dado, credencial, texto jurídico ou painel externo). Não são itens `UX-NNN`; cada task deixa pronto o lado do app e registra o que falta em `docs/superpowers/PROGRESS.md`, seção "Aguardando humano".

| ID | Sev. | Fichas | O que só o humano faz | Lado do app (o que já existe ou a task faz) |
|---|---|---|---|---|
| H-01 | P1 | J9-01 | Fornecer data da última atualização, razão social, CNPJ, e-mail do encarregado de dados e e-mail de contato para `/termos`, `/privacidade` e `/sobre`. | `features/site/legal.ts` mostra `[a definir: …]` com colchetes em produção; a Task 10 pode, por Ruling, exibir "Em revisão" sem colchetes até os dados chegarem (mitigação de código, não substitui o dado). |
| H-02 | P2 | J9-08 | Criar e informar um e-mail institucional para pedidos de exclusão de dados em `/pesquisa/privacidade` (hoje é o e-mail pessoal do fundador). | Trocar o endereço no texto quando o dado chegar. |
| H-03 | P1 | J3-02, J9-13 | Colar no painel do Supabase o texto do e-mail de acesso e de confirmação (marca, "abra neste aparelho", prazo em minutos igual ao configurado no painel) e decidir o código de 6 dígitos (D-163, M16, exige template hospedado). | Os modelos versionados em `supabase/templates/` e a orientação na tela são itens de código (UX de e-mail na Task 10, `LinkSent` na Task 13). |
| H-04 | P2 | J4-03, J4-14 (estado assíncrono), J7 (revisão sem itens lidos) | Fornecer `OPENROUTER_KEY` e `AI_MODEL_*` no ambiente onde o estado deve ser validado. | Os estados "Leitura automática indisponível" e a fila de revisão sem itens lidos são item de código; a validação com a IA real só ocorre no staging com a chave. |
| H-05 | P2 | J4-16 | Definir por quanto tempo o arquivo enviado fica guardado e revisar juridicamente o texto de consentimento (sinalização, sem afirmar conformidade). | O item de consentimento da Task 14 diz o que já é fato (leitura por IA, revisão da equipe, não mostrar dado do aluno) e mostra o prazo como "indisponível". |
| H-06 | P2 | J8-09 | Dar a fonte ou aprovar as afirmações regulatórias e comerciais de `/b2b/campanhas/nova` e `/parceiros` ("Lei 12.886", "Checagem automática Procon", "Sem custo para a escola", "As listas escolares do Brasil"). | O item da Task 18 remove ou reescreve como sinalização até a fonte existir. |
| H-07 | P2 | J3-04, J3-11, J4-14 | Fornecer as credenciais que só o humano tem: Google OAuth (D-042), e-mail transacional e Web Push (VAPID) para ativar os canais de aviso. | Os estados de erro e de "canal indisponível" das telas são itens de código (Tasks 13 e 14). |

## Lacunas de seed e checker (Task 10)

Não contam nas tabelas de itens. A Task 10 as trata junto das correções da J9 (checker em `lib/ux-checks/` e `scripts/s29-checks.mjs`; seed em `scripts/s29-seed-jornadas.sql`).

### Seed e ambiente local

**[Resolvida na Task 10]** - **L-S1 · Rotas de detalhe sem seed.** `journeys.ts` usa `semSeed` e o checker pula: `/admin/revisao/[id]`, `/admin/listas/[id]`, `/admin/reivindicacoes/[id]`, `/admin/papelarias/[id]`, `/admin/denuncias/[id]`, `/admin/importacoes/[batchId]`, `/admin/parceiros/[id]`, `/conta/alunos/[id]/editar` (aluno) e `/papelaria/creditos/faturas/[id]` (fatura). Semear um registro de cada.
**[Parcial na Task 10: escola sem administrador com contato, pedidos em cada estado e escola sem lista; falta membro não verificado]** - **L-S2 · Estados de J5.** Escola sem administrador (para o pedido de administração), pedidos (`claims`) em cada estado (pendente, em análise, recusado, `token_expired`, com mais evidências), contato do INEP na escola (métodos e-mail e WhatsApp), membro `school_member` não verificado e escola sem lista.
**[Parcial na Task 10: fatura, papelarias em análise/aprovada/pausada, leads vendido e contestado, plano com créditos; faltam papelaria sem plano publicado e valor por item]** - **L-S3 · Estados de J6.** Fatura, cadastro de papelaria em análise, papelaria em cada estado (aprovada, pausada, sem plano publicado com `billing_unavailable`), pedido respondido com valor por item, vendido e contestado, plano de demonstração real de créditos em vez de "10000 leads grátis".
**[Parcial na Task 10: denúncia, lote, campanha e parceiro pendentes; faltam contestação aceita e PDF em `processing_async`]** - **L-S4 · Estados de J7.** Envio que cai em revisão humana pelo caminho real (o processamento assíncrono não roda local, então o PDF fica em `processing_async`), denúncia, lote de importação, contestação aceita, campanha pendente, parceiro pendente.
**[Parcial na Task 10: parceiro de marca (marca@), campanhas, parceiro recusado e suspenso; faltam chave de produção, entrega de webhook, extrato e lista publicada não demonstrativa]** - **L-S5 · Estados de J8.** Parceiro do tipo "marca" (o de demonstração é "varejista" e não cria campanha), lista publicada não demonstrativa visível ao parceiro (widget e API voltam vazios), chave de produção, entrega de webhook, extrato de faturamento, parceiro recusado e suspenso, campanha em cada estado.
**[Resolvida na Task 10: escola 99029003, 90 caracteres]** - **L-S6 · Escola de nome longo.** Uma escola com nome de 90 caracteres para o teste `RF-J1` (rolagem a 390 px).
**[Resolvida na Task 10: valores inertes no `.env.local` e documentação no seed e no `.env.example`]** - **L-S7 · Ambiente local sem chaves.** O `.env.local` da trilha não tem `OPENROUTER_KEY`, `AI_MODEL_*` nem os segredos B2B: `getServerEnv()` falha e o portal responde "Emissão de chaves indisponível". Documentar as variáveis de teste no `.env.example` (sem valores) e dar valores de teste locais ao checker.
**[Resolvida na Task 10: `db:reset` e seed do zero; `tests/db/s29-seed.test.ts` cobre os estados e a idempotência]** - **L-S8 · Reaplicar o seed.** O banco local foi alterado à mão nas Tasks 7 e 8 (escola 99029007 criada, pedido de administração aprovado, `Papelaria Nova T7` aprovada, contestação do `LC-S29D1` rejeitada, envio `…29e3` publicado com um item, parceiro "Editora T8" em `sandbox`, campanha "Volta às aulas T8" ativa, tipo do parceiro de demonstração alterado e devolvido, aluno "Maria", pedidos `LC-D0C7` e `LC-S29D1`). Reaplicar o seed do zero, incorporar os estados acima e conferir que `tests/db/s29-seed.test.ts` cobre cada um e que o seed é idempotente.

### Checker

**[Resolvida na Task 10]** - **L-C1 · Falso positivo `/escolas`.** "Sem caminho de volta" em `/escolas`, embora exista "Voltar ao início" (J1-07): a regra de rotas de entrada só conta o logo do cabeçalho (`lib/ux-checks/dead-ends.ts`); passar a contar link "Voltar".
**[Resolvida na Task 10]** - **L-C2 · Falsos positivos de botão.** "Botão fora do sistema" em "Sair" (12 px de texto em alvo de 44 px) e em "Rotacionar", "Revelar", "Revogar" (links de texto de 13 px em alvo de 44 px): medir o alvo, não o tamanho do texto (`lib/ux-checks/off-system.ts`). O "sem caminho de volta" das rotas de painel (menu lateral) também é aceito e deve ser dispensado por casca com navegação.
**[Parcial na Task 10: sondas de tabela larga e de ação irreversível com teste; sem alerta para rótulo que não faz o que diz, ator "system", texto cortado e widget em outra origem]** - **L-C3 · Pontos cegos.** O checker não vê: ação escondida por tabela larga a 390 px (J7-01, J8-03), rótulo que não faz o que diz (J7-02), ação irreversível sem confirmação (J6-04, J7-03, J7-04), ator "system" na trilha (J7-14; coberto por teste de banco), texto e menu cortados sem indício de rolagem (J1-06, J6-10, J8-04), e não monta o widget em outra origem (J8-02). Adicionar sondas para as três primeiras e ao menos alerta para as demais.
**[Resolvida na Task 10: âncoras em tabela na sonda padrão, P1/P2]** - **L-C4 · Alvos dentro de tabela.** A sonda pula âncoras `inline`, e "Gerir" (34 x 18) só apareceu na sonda estendida; incluí-las na sonda padrão e reportar com a regra da S29 (abaixo de 24 px = P1, de 24 a 43 px = P2).
**[Parcial na Task 10: reivindicar com escola livre, confirmar com token sintático, carrinho e cotação com parâmetro, lead com cotação; faltam menu aberto de `/escola/listas/nova` e a costura J2 para J6]** - **L-C5 · Rotas medidas no estado errado.** `/escolas/{inep}/reivindicar` roda contra escola com administrador (nunca vê o formulário); `/reivindicar/confirmar` roda sem token (só vê "Link inválido"); `/escola/listas/nova` só com menu fechado; `/carrinho/novo` e `/cotacao/nova` sem parâmetro; `/papelaria/leads/{leadCode}` usa o primeiro `LC-S29%` (sem itens de catálogo) e a sonda não cobre os 425 px junto do filtro do funil; a costura J2 para J6 não tem checagem própria; "main=2" em `/parceiros` é real (J8-10).
**[Resolvida na Task 10]** - **L-C6 · Movimento fora dos tokens (J9-16).** O CSS publicado traz `--default-transition-duration: .15s` (Tailwind, 150 ms) e `.duration-500` (500 ms) sem uso no código-fonte; sobrescrever o padrão do Tailwind com `var(--mov-base)` e remover `duration-500`, ou registrar as exceções no checker.
**[Resolvida na Task 10: `mercadolivre`]** - **L-C7 · Escolha do varejista.** `s29-checks.mjs` escolhe o primeiro varejista ativo por ordem de `slug` (`retailers where is_active order by slug limit 1`, hoje "amazon") para `/ir-para/{cartId}/{retailer}`; fixar o slug do varejista que a opção do carrinho semeado usa.
**[Resolvida na Task 10]** - **L-C8 · `/revisar` usa o envio mais recente (J4-10).** `s29-checks.mjs` escolhe o envio mais recente (sem cópia privada, 404 esperado) em vez do semeado (`…29e3`, que devolve 200); escolher o envio semeado.

## Itens absorvidos de DEBT e de MELHORIAS

### D-161 (absorvida pela S29)

| Parte de D-161 | Item S29 |
|---|---|
| (a) barra de ação fixa na página da lista | UX-014 (Task 11) |
| (b) `KpiRow` com `order-last` | UX-080 (Task 15) |
| (c) textos do checklist da papelaria | UX-080 (Task 15) |
| (d) grupos do menu do admin (M34) | UX-122 (Task 17, com Ruling de adiamento proposto) |
| (e) alinhamento do cartão da landing a 1280 px | UX-019 (Task 11) |
| (f) "voltar à lista" no login | UX-041 (Task 13) |
| (g) frases duplicadas em `/enviar-lista` | UX-063 (Task 14) |

### Itens pós-piloto de `docs/MELHORIAS.md` que a S29 cobre

| Melhoria | Cobertura | Item S29 |
|---|---|---|
| M22 · Quickstart B2B com exemplo copiável | total | UX-128 (Task 18) |
| M35 · Fila de atenção no admin e tabela de eventos legível | total | UX-110, UX-108 (Task 17) |
| M26 · Kit de divulgação da escola | parcial (link curto, QR e mensagem de WhatsApp; o cartaz A4 continua pós-piloto) | UX-098 (Task 16) |
| M30 · Ajuda contextual (INEP, marca, item coletivo) | parcial (só INEP) | UX-015 (Task 11) |
| M23 · Widget B2B com pré-visualização | parcial (rótulos e pré-visualização; o "ao vivo" continua pós-piloto) | UX-129, UX-124 (Task 18) |
| M34 · Admin com menu agrupado | adiada com Ruling proposto | UX-122 (Task 17) |

Não absorvidos: M16 (depende do template hospedado, H-03), M17, M18, M19, M20, M21, M24, M25, M27, M28, M29, M31, M32.

## Anexo A · Rastreio dos achados das fichas

Cada ID de ficha aparece uma vez por linha; `RF-*` e `D-161*` não têm ID de ficha e estão nas tabelas das tasks.

| Ficha | Sev. ficha | Sev. backlog | Destino |
|---|---|---|---|

| J1-01 | P2 | P2 | UX-012 |
| J1-02 | P1 | P1 | UX-013 |
| J1-03 | P2 | P2 | UX-014 |
| J1-04 | P1 | P1 | UX-012 |
| J1-05 | P2 | P2 | UX-015 |
| J1-06 | P2 | P2 | UX-016 |
| J1-07 | P3 | P3 | L-C1 |
| J1-08 | P3 | P3 | UX-019 |
| J1-09 | P3 | P3 | UX-019 |
| J1-10 | P3 | P3 | UX-023 |
| J1-11 | P2 | P2 | UX-017 |
| J1-12 | P3 | P3 | UX-020 |
| J1-13 | P3 | P3 | UX-021 |
| J1-14 | P3 | P3 | UX-022 |
| J2-01 | P1 | P1 | UX-025 |
| J2-02 | P1 | P1 | UX-026 |
| J2-03 | P2 | P2 | UX-031 |
| J2-04 | P2 | P2 | UX-032 |
| J2-05 | P2 | P2 | UX-033 |
| J2-06 | P2 | P2 | UX-035 |
| J2-07 | P2 | P1 | UX-036 |
| J2-08 | P3 | P3 | UX-038 |
| J2-09 | P2 | P2 | UX-037 |
| J2-10 | P2 | P2 | UX-014 |
| J2-11 | P3 | P3 | UX-039 |
| J2-12 | P3 | P3 | UX-040 |
| J2-13 | P2 | P2 | UX-034 |
| J2-14 | P3 | P3 | UX-038 |
| J3-01 | P2 | P2 | UX-041 |
| J3-02 | P1 | P1 | UX-007, UX-042, H-03 |
| J3-03 | P2 | P2 | UX-012, UX-048 |
| J3-04 | P2 | P2 | UX-045, H-07 |
| J3-05 | P2 | P2 | UX-046 |
| J3-06 | P2 | P2 | UX-044 |
| J3-07 | P3 | P1 | UX-047 |
| J3-08 | P2 | P2 | UX-048 |
| J3-09 | P2 | P2 | UX-048 |
| J3-10 | P2 | P2 | UX-049 |
| J3-11 | P2 | P2 | UX-050, H-07 |
| J3-12 | P3 | P3 | UX-051 |
| J3-13 | P2 | P2 | UX-052 |
| J3-14 | P2 | P2 | UX-053 |
| J3-15 | P2 | P2 | UX-054 |
| J3-16 | P2 | P2 | UX-055 |
| J3-17 | P3 | P3 | UX-057 |
| J3-18 | P3 | P3 | UX-058 |
| J3-19 | P3 | P3 | UX-059 |
| J3-20 | P3 | P3 | UX-023 |
| J3-21 | P2 | P2 | UX-056 |
| J4-01 | P1 | P1 | UX-012 |
| J4-02 | P1 | P1 | UX-060 |
| J4-03 | P2 | P2 | UX-062, H-04 |
| J4-04 | P3 | P3 | UX-069 |
| J4-05 | P2 | P2 | UX-062 |
| J4-06 | P2 | P2 | UX-063 |
| J4-07 | P2 | P2 | UX-064 |
| J4-08 | P3 | P3 | UX-070 |
| J4-09 | P3 | P3 | UX-071 |
| J4-10 | P2 | P2 | UX-065, L-C8 |
| J4-11 | P3 | P3 | UX-072 |
| J4-12 | P3 | P3 | UX-062 |
| J4-13 | P3 | P3 | UX-073 |
| J4-14 | P2 | P2 | UX-066, H-04 |
| J4-15 | P3 | P3 | UX-063 |
| J4-16 | P2 | P2 | UX-067, H-05 |
| J5-01 | P1 | P1 | UX-089 |
| J5-02 | P1 | P1 | UX-090 |
| J5-03 | P1 | P1 | UX-090 |
| J5-04 | P1 | P1 | UX-091 |
| J5-05 | P1 | P1 | UX-092 |
| J5-06 | P2 | P2 | UX-093 |
| J5-07 | P2 | P2 | UX-094 |
| J5-08 | P2 | P2 | UX-095 |
| J5-09 | P2 | P2 | UX-096 |
| J5-10 | P2 | P2 | UX-097 |
| J5-11 | P2 | P2 | UX-098 |
| J5-12 | P2 | P2 | UX-099 |
| J5-13 | P3 | P3 | UX-100 |
| J5-14 | P3 | P3 | UX-101 |
| J5-15 | P3 | P3 | UX-102 |
| J6-01 | P1 | P1 | UX-018, UX-077 |
| J6-02 | P1 | P1 | UX-028, UX-074 |
| J6-03 | P1 | P1 | UX-075 |
| J6-04 | P1 | P1 | UX-076 |
| J6-05 | P2 | P2 | UX-078 |
| J6-06 | P2 | P2 | UX-079 |
| J6-07 | P2 | P2 | UX-080 |
| J6-08 | P2 | P2 | UX-081 |
| J6-09 | P2 | P2 | UX-082 |
| J6-10 | P2 | P2 | UX-083 |
| J6-11 | P2 | P2 | UX-084 |
| J6-12 | P2 | P2 | UX-085 |
| J6-13 | P2 | P2 | UX-086 |
| J6-14 | P2 | P1 | UX-027 |
| J6-15 | P3 | P3 | UX-087 |
| J6-16 | P3 | P3 | UX-088 |
| J7-01 | P1 | P1 | UX-103 |
| J7-02 | P1 | P1 | UX-104 |
| J7-03 | P1 | P1 | UX-105 |
| J7-04 | P1 | P1 | UX-106 |
| J7-05 | P1 | P1 | UX-107 |
| J7-06 | P2 | P2 | UX-109 |
| J7-07 | P2 | P2 | UX-110 |
| J7-08 | P2 | P2 | UX-111 |
| J7-09 | P2 | P2 | UX-112 |
| J7-10 | P2 | P2 | UX-008, UX-068 |
| J7-11 | P3 | P2 | UX-113 |
| J7-12 | P2 | P2 | UX-114 |
| J7-13 | P3 | P3 | UX-119 |
| J7-14 | P2 | P1 | UX-108 |
| J7-15 | P2 | P2 | UX-116 |
| J7-16 | P3 | P2 | UX-115 |
| J7-17 | P3 | P3 | UX-120 |
| J7-18 | P2 | P2 | UX-117 |
| J7-19 | P3 | P3 | UX-121 |
| J7-20 | P2 | P2 | UX-118 |
| J8-01 | P1 | P1 | UX-123 |
| J8-02 | P1 | P1 | UX-124 |
| J8-03 | P1 | P1 | UX-125 |
| J8-04 | P2 | P2 | UX-083, UX-126 |
| J8-05 | P2 | P2 | UX-127 |
| J8-06 | P2 | P2 | UX-128 |
| J8-07 | P2 | P2 | UX-129 |
| J8-08 | P2 | P2 | UX-130 |
| J8-09 | P2 | P2 | UX-118, UX-131, H-06 |
| J8-10 | P2 | P2 | UX-132 |
| J8-11 | P3 | P3 | UX-133 |
| J8-12 | P3 | P3 | UX-134 |
| J8-13 | P3 | P3 | UX-135 |
| J8-14 | P3 | P3 | UX-136 |
| J9-01 | P1 | P1 | H-01 |
| J9-02 | P2 | P2 | UX-001 |
| J9-03 | P3 | P3 | UX-002 |
| J9-04 | P3 | P3 | UX-003 |
| J9-05 | P3 | P3 | UX-003 |
| J9-06 | P2 | P2 | UX-004 |
| J9-07 | P2 | P2 | UX-005 |
| J9-08 | P2 | P2 | H-02 |
| J9-09 | P3 | P3 | UX-009 |
| J9-10 | P3 | P3 | UX-010 |
| J9-11 | P2 | P2 | UX-006 |
| J9-12 | P2 | P2 | UX-043 |
| J9-13 | P2 | P2 | UX-007, H-03 |
| J9-14 | P2 | P2 | UX-008 |
| J9-15 | P3 | P3 | UX-011 |
| J9-16 | P3 | P3 | L-C6 |
