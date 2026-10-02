# Auditoria impeccable · Família (mobile primeiro)

Método: `impeccable` (audit + critique), build local de produção na porta 3002, Supabase local com dados de demonstração, agent-browser em 390x844 e 1280x800, sonda de DOM (alvos de toque, texto abaixo de 12 px, rótulos, `main`, `h1`, rolagem horizontal) e leitura do código. Referência: `docs/design` (App01 a App24). Nenhum código foi alterado nesta fase. Severidade: P0 bloqueia tarefa, P1 grande ou violação WCAG AA, P2 menor, P3 acabamento. Tarefa = task do plano `2026-09-28-s28-excelencia.md`; M = item de `docs/MELHORIAS.md`.

Rotas sondadas (mobile): `/`, `/escolas`, `/escolas?q=…` (vazio), `/escolas/[inep]`, `/escolas/[inep]/[serie]`, `/entrar`, `/conta`, `/conta/*`, `/carrinho/novo`, `/cotacao*`, `/enviar-lista`. `/carrinho/[id]` e `/cotacao/[code]` foram lidos no código (o carrinho semeado pertence a outra conta e devolve 404 correto).

## Saúde (audit)

| Dimensão | Nota | Achado principal |
|---|---|---|
| Acessibilidade | 3 | Cores dos tokens passam AA (texto-3 sobre campo 4,83:1); faltam bordas em campos (F-06), landmark `main` ausente em `/enviar-lista` (F-09) e alvos < 44 px |
| Desempenho | 3 | Lighthouse do baseline 93 a 99; sem imagem grande; foto do celular acima de 4 MB falha (F-04) |
| Responsivo | 3 | Sem rolagem horizontal nas rotas da família; busca da home com campo espremido (F-02) |
| Tema | 3 | Tokens usados; 2 mensagens de erro com `text-red-700` e 6 hex avulsos fora dos tokens (F-11) |
| Anti-padrões | 3 | Sem gradiente, vidro ou faixa lateral; eyebrow "VOLTA ÀS AULAS" e cartões repetidos são leves (F-12) |
| **Total** | **15/20** | Bom; endereçar as dimensões fracas |

## Veredito de anti-padrões

Não parece gerado por IA: marca própria, verde só onde resolve, tipografia forte. Tiques leves: eyebrow em caixa alta no hero, cartões de mesma forma na lista de itens. Não bloqueiam.

## Achados

| ID | Sev. | Rota / arquivo | Achado | Resolve |
|---|---|---|---|---|
| F-01 | P1 | `/entrar`, `app/entrar/page.tsx`, `LoginForm.tsx` | Tela não diz por que pede login nem o que fazer depois do envio ("abra o e-mail neste aparelho", reenvio com espera, trocar e-mail). Título fala de aluno, não do que a mãe acabou de pedir. | Task 10 (M03) |
| F-02 | P1 | `/` mobile, `components/site/Hero.tsx` | O botão "Buscar a escola do meu filho" ocupa quase toda a barra; o campo fica com cerca de 50 px e o placeholder aparece cortado ("Nome d…"). O campo principal do produto é quase inutilizável no celular. Menu do topo também fica cortado sem indício de rolagem. | Task 8 e Task 13 (M10, M06); item novo M33 abaixo |
| F-03 | P1 | `/`, `/escolas/*` | Hero e busca não dizem que só Cuiabá e Várzea Grande estão habilitadas; busca sem resultado só explica a grafia, sem saída (enviar lista, me avise). | Task 13 (M06) |
| F-04 | P1 | `/enviar-lista`, `features/submissions/constants.ts` | Teto de 4 MB com texto que promete "reduzidas no navegador", mas nada reduz. Foto de celular estoura. HEIC no Chrome não decodifica. | Task 12 (M04) |
| F-05 | P1 | `/carrinho/[id]/page.tsx` | Título "Montamos N opções" contradiz quatro cartões com três "indisponível"; sem preço, a cotação por papelaria não é o caminho principal. | Task 11 (M05) |
| F-06 | P2 | `LoginForm`, `SubmitForm`, formulários da família | Campos usam fundo `campo` (#ECE8DE) sem borda sobre Papel: contraste do limite do campo cerca de 1,06:1, abaixo dos 3:1 de WCAG 1.4.11. O foco é visível (`ring-2`). | Task 18 (M15) e Task 20 (M09) |
| F-07 | P2 | `/enviar-lista` | Dois avisos coloridos (âmbar e verde) antes da ação principal; o âmbar repete o texto do consentimento; verde é usado para informação neutra, contra a regra "verde só onde algo está resolvido". Botão "Buscar" desabilitado em cinza com baixo contraste. | Task 14 e Task 18 |
| F-08 | P2 | `/conta`, `app/conta/page.tsx` | Mostra "Papel parent" (nome interno em inglês). Vazios são frases soltas ("Nenhum aluno cadastrado ainda") sem convite à ação; "Adicionar" é link pequeno. | Task 9 (M11) e Task 14 (M14) |
| F-09 | P2 | `/enviar-lista`, `/pesquisa`, `/papelarias/[slug]` | Sem landmark `main` (WCAG 1.3.1/2.4.1). | Task 20 (M09) |
| F-10 | P2 | `/conta/carrinhos`, `/conta/listas-salvas`, `/conta/alunos/novo` | Sem `h1`. | Task 20 |
| F-11 | P2 | `app/entrar`, `GoogleButton`, `app/cotacao/*` | Erro com `text-red-700` e hex `#fde2e0`/`#8a1c14` avulsos em vez dos tokens `erro-fundo`/`erro-texto`; inconsistência de vocabulário. | Task 18 (M15) |
| F-12 | P3 | `Hero.tsx`, `HeroListCard.tsx` | Eyebrow em caixa alta; cartão do hero promete "Mais barato · preço com origem e data" mesmo quando preço é "indisponível". | Task 8 e Task 11 |
| F-13 | P2 | `/conta/notificacoes` | Legenda "Sua lista foi lida" encosta na borda do cartão; caixas de seleção de 20 px; 19 de 20 alvos abaixo de 44 px; rótulos "indisponível neste ambiente" sem explicação. | Task 20 (M09) |
| F-14 | P2 | 39 ocorrências de `text-[11px]` no repositório (`components/cart/badges.tsx`, `components/lists/badges.tsx`, `StoreCard`) | Texto de 11 px (selos, notas de preço e data) abaixo do mínimo prático de 12 px em celular 4G. | Task 20 (M09) |
| F-15 | P3 | `/entrar`, `/cadastrar-papelaria` | Links "Termos" e "Política de Privacidade" com altura 15 px (alvo de toque). | Task 20 |
| F-16 | P3 | Rotas com `loading.tsx` | Só 7 rotas têm carregamento; as da família usam o spinner global `app/loading.tsx`. | Task 17 (M07) |
| F-17 | P2 | `/escolas/[inep]/[serie]` | Ação principal "Montar carrinho" só depois da tabela inteira; em lista longa a mãe rola muito. Aviso de login só depois do clique. | Task 11 (M05) e Task 9 |
| F-18 | P3 | `/escolas/*` no desktop | Coluna de 420 px com cabeçalho escuro de largura total: alinhamento desconexo em telas grandes (referência App10/App14 é mobile). | Backlog pós-piloto |
| F-19 | P2 | `primaryButton` e `outlineButton` em `components/auth/Screen.tsx`, `components/site/SkipLink.tsx` | Contorno de foco Verde Certo (#2FCB86) sobre Papel tem 1,9:1, abaixo dos 3:1 exigidos para indicador de foco; o `outlineButton` já usa Verde Fundo (correto). | Task 18 (M15) e Task 20 |

## Comparação com `docs/design`

O App03-Início mostra a home logada (Olá, aluno, lista publicada, navegação inferior); a implementação entrega a landing também para logados e a conta é um hub de links. Divergência conhecida de escopo (S15), sem regressão; a navegação inferior não existe. Registrado como F-08 e Task 9.

## Contagem

P0 0, P1 5, P2 10, P3 4. Total 19.
