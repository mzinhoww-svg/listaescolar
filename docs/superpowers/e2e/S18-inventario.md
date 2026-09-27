# S18 · Inventário de rotas e arquivos >250 linhas

Levantamento feito nesta sessão (worktree T3, branch `slice/S18-estados-a11y`), sobre `4c06b2a` + os commits desta
fatia. Duas fontes: `pnpm check:sizes` (script `scripts/check-file-sizes.ts`, novo) para tamanho de arquivo, e uma
varredura de `app/**/page.tsx` para `loading.tsx`/`error.tsx` PRÓPRIOS (o Next.js App Router aninha os limites de
Suspense/Error Boundary: uma rota sem arquivo próprio herda o do ancestral mais próximo — este inventário lista só
"próprio", não a cobertura efetiva por herança, que está descrita na seção "Cobertura real" abaixo).

## Arquivos >250 linhas

Ver `pnpm check:sizes` para a lista viva. No início da fatia: os 10 arquivos de D-057 (refatorados na Task 2) mais
7 nascidos depois (S21–S26, fora do escopo desta fatia por Ruling — DEBT.md D-158).

## Rotas: `loading.tsx`/`error.tsx` próprios (81 `page.tsx`)

Antes desta fatia: 6/81 com `loading.tsx` próprio, 4/81 com `error.tsx` próprio.

| Rota | `loading.tsx` próprio | `error.tsx` próprio |
|---|---|---|
| app/(site)/como-funciona/page.tsx | não | não |
| app/(site)/page.tsx | não | não |
| app/(site)/privacidade/page.tsx | não | não |
| app/(site)/sobre/page.tsx | não | não |
| app/(site)/termos/page.tsx | não | não |
| app/403/page.tsx | não | não |
| app/admin/auditoria/page.tsx | não | não |
| app/admin/campanhas/page.tsx | não | não |
| app/admin/contestacoes/page.tsx | não | não |
| app/admin/denuncias/[id]/page.tsx | não | não |
| app/admin/denuncias/page.tsx | não | não |
| app/admin/eventos/page.tsx | não | não |
| app/admin/ia/page.tsx | não | não |
| app/admin/importacoes/(lista)/page.tsx | sim | não |
| app/admin/importacoes/[batchId]/page.tsx | não | não |
| app/admin/inadimplencia/page.tsx | não | não |
| app/admin/listas/[id]/page.tsx | não | não |
| app/admin/page.tsx | não | não |
| app/admin/papelarias/[id]/page.tsx | não | não |
| app/admin/papelarias/page.tsx | não | não |
| app/admin/parceiros/[id]/page.tsx | não | não |
| app/admin/parceiros/page.tsx | não | não |
| app/admin/planos/page.tsx | não | não |
| app/admin/reivindicacoes/[id]/page.tsx | não | não |
| app/admin/reivindicacoes/page.tsx | não | não |
| app/admin/repasses/page.tsx | não | não |
| app/admin/revisao/[id]/page.tsx | não | não |
| app/admin/revisao/page.tsx | não | não |
| app/b2b/api/page.tsx | não | não |
| app/b2b/campanhas/nova/page.tsx | não | não |
| app/b2b/campanhas/page.tsx | não | não |
| app/b2b/conta/page.tsx | não | não |
| app/b2b/docs/page.tsx | não | não |
| app/b2b/faturamento/page.tsx | não | não |
| app/b2b/insights/page.tsx | não | não |
| app/b2b/page.tsx | sim | não |
| app/b2b/webhooks/page.tsx | não | não |
| app/b2b/widget/page.tsx | não | não |
| app/cadastrar-papelaria/page.tsx | não | não |
| app/carrinho/[id]/checkout/page.tsx | não | não |
| app/carrinho/[id]/page.tsx | não | não |
| app/carrinho/novo/page.tsx | não | não |
| app/conta/alunos/[id]/editar/page.tsx | não | não |
| app/conta/alunos/novo/page.tsx | não | não |
| app/conta/carrinhos/page.tsx | não | não |
| app/conta/compras/page.tsx | não | não |
| app/conta/listas-salvas/page.tsx | não | não |
| app/conta/notificacoes/page.tsx | sim | não |
| app/conta/page.tsx | não | não |
| app/conta/privacidade/page.tsx | não | não |
| app/cotacao/[code]/page.tsx | não | não |
| app/cotacao/nova/page.tsx | não | não |
| app/cotacao/page.tsx | não | não |
| app/entrar/page.tsx | não | não |
| app/enviar-lista/[submissionId]/page.tsx | não | não |
| app/enviar-lista/[submissionId]/revisar/page.tsx | não | não |
| app/enviar-lista/page.tsx | não | não |
| app/escola/listas/nova/page.tsx | não | não |
| app/escola/page.tsx | não | não |
| app/escolas/[inep]/[serie]/page.tsx | não | sim |
| app/escolas/[inep]/page.tsx | não | sim |
| app/escolas/[inep]/reivindicar/confirmar/page.tsx | não | não |
| app/escolas/[inep]/reivindicar/page.tsx | não | sim |
| app/escolas/page.tsx | não | sim |
| app/ir-para/[cartId]/[retailer]/page.tsx | não | não |
| app/papelaria/areas/page.tsx | não | não |
| app/papelaria/catalogo/page.tsx | sim | não |
| app/papelaria/creditos/faturas/[id]/page.tsx | não | não |
| app/papelaria/creditos/page.tsx | sim | não |
| app/papelaria/desempenho/page.tsx | não | não |
| app/papelaria/leads/(lista)/page.tsx | sim | não |
| app/papelaria/leads/[code]/page.tsx | não | não |
| app/papelaria/page.tsx | não | não |
| app/papelarias/[slug]/page.tsx | não | não |
| app/parceiros/docs/page.tsx | não | não |
| app/parceiros/page.tsx | não | não |
| app/parceiros/termos/page.tsx | não | não |
| app/pesquisa/page.tsx | não | não |
| app/pesquisa/privacidade/page.tsx | não | não |
| app/pesquisa/resultados/login/page.tsx | não | não |
| app/pesquisa/resultados/page.tsx | não | não |

## Cobertura real (por herança, depois desta fatia)

- **Erro:** `app/error.tsx` (raiz) já existia ANTES desta fatia e cobre toda rota sem `error.tsx` próprio — inclui
  botão "Tentar de novo" (`reset()`), então **erro e retry já eram cobertos globalmente**. As 4 rotas com
  `error.tsx` próprio (`/escolas` e sub-rotas) têm mensagem mais específica; mantidas como estão.
- **Carregamento:** ANTES desta fatia não havia `app/loading.tsx` (raiz) — 75 das 81 rotas navegavam sem nenhum
  indicador visual durante a busca de dados no servidor (só voltavam a ficar interativas quando a página inteira
  terminava de renderizar). Corrigido nesta fatia com `app/loading.tsx` (raiz, `role="status"`,
  `aria-live="polite"`, animação desligada com `prefers-reduced-motion`) — agora **toda rota tem loading por
  herança**, os 6 loadings específicos preexistentes continuam válidos (mais adequados ao layout local).
- **Vazio:** não é um limite de arquivo do Next (não tem convenção própria); verificado por amostragem nas listas
  principais (fila de reivindicações, papelarias, leads, campanhas, importações, denúncias) — todas já mostravam
  texto de vazio (`Notice`/parágrafo dedicado) antes desta fatia; nenhuma lacuna nova encontrada na amostragem.
  Cobertura por amostragem, não exaustiva — mesma ressalva já registrada para D-156 (selo "Demonstração") na S17.
- **Foco visível / skip-link:** ver `docs/superpowers/ledger.md` (seção S18) — as 5 cascas autenticadas
  (`PanelShell`, `AdminShell`, `PortalShell`, `SchoolShell`, `SchoolPanelShell`) e os botões compartilhados de
  `components/auth/Screen.tsx` (usados por ~20 telas) ganharam skip-link/`#conteudo`/`focus-visible` explícito.

## Metodologia e limite

Este inventário é um retrato do início da Task 3, não um teste automatizado contínuo (não há convenção de arquivo
"vazio.tsx" no Next para verificar por script). `pnpm check:sizes` (tamanho) é reexecutável e vira guarda de
regressão para D-057; o restante (loading/error/vazio) é auditoria pontual, documentada aqui.
