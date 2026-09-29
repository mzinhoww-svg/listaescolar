# S29 · Revisão total de UX e UI · Spec

Data: 29/09/2026 · Estado: **aguardando revisão do humano** · Origem: pedido direto do humano ("revisão total do projeto, todas as telas, fluxos, botões, movimentos, para que faça sentido e melhore todo o processo"), com `/impeccable`, `/ui-ux-pro-max` e `/tripled-ui`. Decisão de escopo em `docs/decisions/ADR-008-revisao-total-ux.md`.

## 1. Por que existe

A S28 auditou e corrigiu **área por área** (família, papelaria, escola, admin, B2B, site) e implementou o top 15. Três coisas ficaram sem dono:

1. **As passagens entre públicos.** Nenhuma revisão percorreu uma história inteira que atravessa papéis: a família pede cotação → a papelaria recebe o lead → responde → a família acompanha → a papelaria registra a venda ou contesta. Os defeitos mais caros moram nessas costuras (quem espera o quê, que aviso chega, onde a pessoa volta).
2. **Coerência de sistema nas 81 rotas.** O `DESIGN.md` e os componentes `components/ui/*` nasceram na S28, mas só as telas tocadas pelo top 15 migraram. Botões, confirmações, feedback e movimento ainda variam entre áreas.
3. **`/ui-ux-pro-max` não foi usada.** A S28 usou `/impeccable`, `/design-intelligence` e `/tripled-ui`.

## 2. O que o humano pediu × o que é suposição

| Pediu | Suposição do orquestrador (Ruling) |
|---|---|
| Revisão de todas as telas, fluxos, botões e movimentos | "Todas" = as 81 rotas de `app/**/page.tsx` + estados globais (403, 404, erro, carregando), e-mails e notificações |
| Que tudo faça sentido e melhore o processo | Medido por jornadas ponta a ponta, não por nota de ferramenta (a S28 já tem Lighthouse ≥ 90 e axe 0) |
| Usar `/impeccable`, `/ui-ux-pro-max`, `/tripled-ui` | `/design-intelligence` continua dona do `DESIGN.md` (fonte única), as três pedidas entram como lentes de revisão e execução (seção 5) |
| — | Marca fechada (ADR-006): logo, Tinta, Papel, Verde Certo, Verde Fundo, Plus Jakarta Sans. Refinar aplicação, não identidade |
| — | Roda depois do merge dos PRs #55 (S19) e #56 (S28), a partir da `main` |

## 3. Critérios de sucesso (aceite da fatia)

1. **Cobertura:** 81/81 rotas com ficha preenchida e revisada (seção 6), mais os estados globais.
2. **Jornadas:** as 9 jornadas da seção 4 percorridas ponta a ponta no build de produção, a 390 × 844 e a 1280 × 800, com captura por passo e **0 becos sem saída** (toda tela tem caminho adiante e caminho de volta explícitos).
3. **Ação principal:** no máximo **1 ação principal por região** de tela (verificado por script sobre o DOM renderizado).
4. **Botões:** todo elemento clicável usa uma variante do sistema (seção 7.1); rótulo verbo + objeto; alvo ≥ 44 px; estado desabilitado sempre explicado.
5. **Movimento:** toda animação usa os tokens de movimento (seção 7.3), tem motivo registrado e some com `prefers-reduced-motion` (teste).
6. **Texto:** vocabulário único (`docs/superpowers/evidencias/S28/vocabulario.md`) aplicado a todas as rotas; nenhum termo interno visível (enum, "lead" para família, "INEP" sem explicação).
7. **Sem regressão:** Lighthouse mobile ≥ 90 (desempenho e acessibilidade) e axe sem violação séria ou crítica nas páginas do aceite da S28, mais as áreas logadas.
8. **Regras de produto** intactas: nada de preço, estoque, prazo, métrica ou parceria inventados; menor só apelido e série; consentimento de medição sem viés.
9. **Revisão final** com Opus por grupo de jornadas, sem achado bloqueante aberto.

**Fora do aceite (medido no piloto, não aqui):** taxa de conclusão real dos funis (PostHog) e teste com pessoas reais. O spec prevê um roteiro de teste de corredor com 5 pais para o humano rodar (seção 9), mas não depende dele.

## 4. As 9 jornadas

Cada jornada lista as rotas em ordem. As marcadas **(piloto)** bloqueiam o go-live; as demais entram na mesma fatia, mas podem sair com Ruling de adiamento.

| ID | Jornada | Rotas (ordem) | Costuras com outro público |
|---|---|---|---|
| J1 **(piloto)** | Família acha a lista | `/` → `/escolas` → `/escolas/[inep]` → `/escolas/[inep]/[serie]` → compartilhar / QR `/l/[code]` | Escola publicou a lista (J5) |
| J2 **(piloto)** | Família compra | lista → `/carrinho/novo` → `/carrinho/[id]` → `/ir-para/...` ou `/carrinho/[id]/checkout` ou `/cotacao/nova` → `/cotacao/[code]` → `/conta/compras` | Lead chega à papelaria (J6); resposta volta à família |
| J3 **(piloto)** | Família entra e cuida da conta | `/entrar` (link mágico e Google) → `/conta` → alunos → listas salvas → carrinhos → notificações → privacidade/exclusão | Retorno ao ponto de origem depois do login |
| J4 **(piloto)** | Família envia a lista da escola | `/enviar-lista` → `/enviar-lista/[id]` (processando) → `/enviar-lista/[id]/revisar` → aviso de publicada | Revisão humana no admin (J7) |
| J5 **(piloto)** | Escola assume e publica | `/escolas/[inep]/reivindicar` → `/confirmar` → `/escola` → `/escola/listas/nova` → divulgação | Verificação no admin (J7); família vê a lista (J1) |
| J6 **(piloto)** | Papelaria vende | `/cadastrar-papelaria` → `/papelaria` (checklist) → áreas → catálogo → créditos/plano/fatura → leads → lead → venda/contestação → desempenho → `/papelarias/[slug]` | Recebe da família (J2); contestação no admin (J7) |
| J7 (núcleo **piloto**) | Equipe opera | `/admin` (fila de atenção) → revisão de listas → reivindicações → papelarias → denúncias/contestações → planos, IA, repasses, inadimplência, campanhas, parceiros, importações, eventos, auditoria | Destrava J4, J5, J6. Núcleo piloto = fila, revisão, reivindicações, papelarias, contestações |
| J8 | Parceiro B2B integra | `/parceiros` → termos/docs → `/b2b` → API/chaves → docs → widget → webhooks → campanhas → insights → faturamento → conta | Widget aparece em site externo |
| J9 **(piloto)** | Sistema e bordas | 403, 404, `error`, carregando, sem conexão, sessão expirada, aviso de consentimento, e-mails (link de acesso, confirmação), notificações da central, páginas legais, `/pesquisa` | Todas |

## 5. Papel de cada skill (lentes)

| Skill | Quando | Entrega |
|---|---|---|
| `/ui-ux-pro-max` | Fase 1 (critérios) e ficha de cada tela | Rubrica de regras priorizadas (acessibilidade, toque, desempenho, layout, tipografia, animação, formulários, navegação) aplicada tela a tela. Vira a coluna "regras violadas" da ficha |
| `/impeccable` | Fases 2 e 4 | `critique` e `audit` por jornada (não por área); depois `clarify`, `distill`, `harden`, `polish`, `animate` nas correções |
| `/tripled-ui` | Fase 4, momentos-chave | Microinterações e blocos só onde o movimento tem função: feedback de ação, transição de estado, orientação, celebração pontual (lista pronta, cotação enviada, primeira venda). Sempre com tokens do `DESIGN.md` |
| `/design-intelligence` | Fase 1 | Atualiza o `DESIGN.md` com os sistemas de botões, feedback e movimento (seção 7), que viram lei para as fases seguintes |

## 6. Ficha por tela (unidade de revisão)

Uma linha por rota em `docs/revisao-total/fichas/<jornada>.md`:

- **Propósito** em uma frase, do ponto de vista de quem usa.
- **Público** e de onde a pessoa chega.
- **Ação principal** (uma) e secundárias.
- **Próximo passo e volta:** para onde vai depois, como volta sem perder o que fez.
- **Estados:** vazio, carregando, erro, sucesso, sem permissão, demonstração. Cada um com texto e ação.
- **Botões:** variante, rótulo, alvo, foco, desabilitado explicado.
- **Movimento:** o que se move, token, motivo, comportamento em reduced-motion.
- **Texto:** termos fora do vocabulário, jargão, frases duplicadas.
- **Regras violadas** (`/ui-ux-pro-max`) e **achados** (`/impeccable`), com severidade P0 a P3.
- **Captura** 390 e 1280.

## 7. Sistemas (entram no `DESIGN.md` antes das correções)

### 7.1 Botões e ações
- Variantes: **principal** (Tinta, uma por região), **secundária** (contorno), **terciária** (texto/link), **destrutiva** (sempre via `ConfirmDialog`), **ícone** (com `aria-label`).
- Rótulo: verbo + objeto ("Montar carrinho", "Pedir cotação"). Nada de "OK", "Enviar" solto, "Clique aqui".
- Carregamento: o botão mantém a largura e anuncia o estado (`aria-busy`), sem spinner de tela cheia.
- Desabilitado: sempre com o motivo visível ao lado.
- Verde Certo não é cor de botão principal (regra de marca da S28).

### 7.2 Feedback
- Sucesso: mensagem em linha próxima da ação + `aria-live="polite"`; toast só para ação que muda de tela.
- Erro: preso ao campo (`aria-invalid`, `aria-describedby`), acionável, sem código técnico.
- Vazio: padrão do `DESIGN.md` §6 com uma ação que tira a pessoa do vazio.

### 7.3 Movimento
- Tokens: `--mov-rapido` 120 ms (feedback de toque), `--mov-base` 200 ms (transição de estado), `--mov-entrada` 320 ms (painel ou folha entrando); easing `cubic-bezier(0.2, 0, 0, 1)` para entrada e `cubic-bezier(0.4, 0, 1, 1)` para saída.
- Permitido: feedback de ação, transição de estado, orientação espacial (de onde veio o painel), celebração pontual de marco.
- Proibido: loop decorativo, parallax, animação que atrase a ação, movimento em texto de leitura, qualquer coisa acima de 400 ms.
- `prefers-reduced-motion`: troca movimento por mudança instantânea de opacidade ou nada; teste automatizado.
- Orçamento: nenhuma dependência nova de animação sem Ruling (piloto em 4G).

## 8. Fases

| Fase | O que faz | Saída |
|---|---|---|
| 0 · Base | Depois do merge de #55 e #56: branch `slice/S29-revisao-total` a partir da `main`, dados de demonstração de todas as áreas semeados localmente (incluindo membro de escola aprovado, papelaria com lead, parceiro B2B) | Ambiente onde as 9 jornadas rodam de ponta a ponta |
| 1 · Critérios e sistemas | `/ui-ux-pro-max` gera a rubrica; `/design-intelligence` grava seção 7 no `DESIGN.md`; script `scripts/s29-checks.mjs` estende o `s28-medir.mjs` com: ações principais por região, becos sem saída, botões fora do sistema, animações fora dos tokens | `DESIGN.md` atualizado, rubrica, script com teste |
| 2 · Inventário e fichas | Percorrer as 81 rotas por jornada com agent-browser, preencher as fichas com `/ui-ux-pro-max` + `/impeccable` (`critique`/`audit`) | `docs/revisao-total/fichas/*.md`, mapa de fluxos em Mermaid `docs/revisao-total/fluxos.md` |
| 3 · Backlog | Consolidar achados, deduplicar com `MELHORIAS.md` e `DEBT.md` (D-161 é absorvida), priorizar P0→P3 por jornada | `docs/revisao-total/backlog.md` |
| 4 · Correções por jornada | Ordem J9 → J1 → J2 → J3 → J4 → J6 → J5 → J7 → J8 (bordas primeiro, porque todas as jornadas passam por elas). Por jornada: sistema aplicado, textos, estados, botões, movimento com `/tripled-ui` onde tem função. TDD onde houver lógica | Commits por jornada, fichas marcadas como resolvidas |
| 5 · Verificação | Jornadas de novo com captura antes × depois, `s29-checks` com 0 falhas, Lighthouse e axe sem regressão, E2E da fatia, revisão final Opus por grupo (J1–J4, J5–J7, J8–J9) | `docs/superpowers/e2e/S29.md`, comparações, PR |

## 9. Teste com pessoas (ação do humano, fora do aceite)

Roteiro curto em `docs/revisao-total/teste-de-corredor.md`: 5 mães ou pais de Cuiabá, no próprio celular, 3 tarefas (achar a lista da série do filho, montar o carrinho ou pedir cotação, enviar a foto de uma lista). Anotar onde travam. Resultados viram itens do backlog pós-piloto.

## 10. Riscos e decisões

- **Tamanho:** 81 rotas é grande para uma rodada. Mitigação: fichas em lote por jornada, commits por jornada, Ruling de adiamento permitido só fora das jornadas piloto.
- **Conflito com o go-live:** a S29 entra entre a S28 e a S20 só para as jornadas piloto; J8 e o restante de J7 podem terminar em paralelo com a S20. Ruling registrado no ADR-008.
- **Retrabalho da S28:** a ficha começa pelo achado da auditoria da S28 da mesma rota; não se reaudita o que já foi resolvido.
- **Link de acesso no WhatsApp (D-163):** continua dependente do humano; J3 registra a experiência atual e a mitigação, sem prometer correção.
- **Métrica de "faz sentido":** subjetiva por natureza; ancorada em critérios verificáveis (seção 3) e na revisão Opus.
