# ADR-006 · Excelência de produto antes do go-live

Data: 27/09/2026 · Status: aceita (decisão do humano, Aurimar Nogueira, em mensagem de sessão) · Não altera ADR-001 a ADR-005.

## Contexto

As fatias S00 a S27 entregam o produto funcional, seguro e testado, cada uma contra as telas de `docs/design`. Nenhuma delas olha o produto inteiro: funis de ponta a ponta (família, escola, papelaria e B2B), atrito e abandono, coerência do sistema visual entre áreas feitas por trilhas paralelas, acessibilidade medida (WCAG AA, axe), desempenho em celular de pai em 4G (Core Web Vitals, Lighthouse) e o custo real de IA por lista. O piloto em Cuiabá é a primeira impressão da marca junto a famílias, escolas e papelarias; entrar em produção com esse conjunto sem medição é o risco que esta decisão cobre.

## Decisão

- Nova fatia **S28 · Excelência de produto e design** no `docs/PLAN.md`, executada **depois da S19 e antes da S20**. A S20 continua sendo a última fatia.
- O **gate de go-live da S20 passa a exigir a S28 mesclada na `main`**, além do DEBT.md sem item alto aberto (ou com Ruling).
- Skills na ordem: `superpowers:brainstorming` (em modo autônomo: o orquestrador responde às perguntas da skill com SPEC, PLAN, `docs/design`, a pesquisa com mães do ADR-005 e os dados do staging, e registra o spec como Ruling, sem esperar aprovação humana), `/impeccable`, `/design-intelligence` e `/tripled-ui`.
- A marca continua fechada: logo, paleta (Tinta, Papel, Verde Certo, Verde Fundo) e Plus Jakarta Sans não mudam; a S28 só refina a aplicação.
- Aceite mensurável: `docs/MELHORIAS.md` e `DESIGN.md` mesclados; top 15 implementado ou com Ruling de adiamento; Lighthouse mobile ≥ 90 (performance e acessibilidade) e axe sem violações sérias/críticas nas páginas principais; E2E com screenshots de antes e depois no PR; custo de IA por lista medido e abaixo de R$ 0,50; revisão final com Opus em UX e acessibilidade (revisão de segurança só se tocar RLS ou dados).

## Custo

- **Prazo:** uma fatia a mais no caminho crítico antes do go-live (estimativa: 1 a 2 dias de execução autônoma, com revisões).
- **Uso de modelo:** maior que uma fatia comum (auditoria de todas as áreas e revisão Opus de UX), dentro da política de uso vigente (Sonnet nos implementadores, Opus só nas revisões).
- **Risco de regressão:** mudanças transversais de UI em telas já testadas; mitigado pelo E2E de antes e depois e pelo gate completo por task.
- **Risco se não fizer:** go-live com funis sem medição, acessibilidade e desempenho não comprovados e custo de IA desconhecido, num piloto que depende de confiança de pais e escolas.
