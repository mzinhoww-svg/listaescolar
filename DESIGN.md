# DESIGN.md · ListaCerta

Sistema de design vivo da ListaCerta (S28, Fase 3). Fonte dos valores: `docs/brand/tokens.json`, `app/globals.css` e `docs/brand/GUIA-DE-MARCA.md`. Contexto estratégico em `PRODUCT.md`. Telas de referência em `docs/design` (mapa em `docs/design/SCREENS.md`).

## 1. Identidade (marca fechada)

Conceito: a lista escolar deixa de ser tarefa e vira confirmação. Institucional e próximo, firme para o gestor, simples para o pai; promessa de certeza, nunca de oferta.

Não muda, em nenhuma fatia: logo (`docs/brand/logos`, `components/brand/Logo.tsx`), Tinta `#0F1B2D`, Papel `#F5F2EA`, Verde Certo `#2FCB86`, Verde Fundo `#0B6B4A` e a fonte Plus Jakarta Sans. Esta fatia refina a aplicação, não a identidade. Proibido: recolorir o check do logo, degradê, logo sobre foto sem painel, trocar a fonte, ou paleta paralela.

Regra do verde: aparece só onde algo está resolvido (item conferido, lista publicada, melhor oferta). Estado neutro ou zero nunca é verde.

## 2. Tokens

Os nomes reais são os de `app/globals.css` (utilitários Tailwind `bg-tinta`, `text-texto-2`, `rounded-campo`); não existem tokens com prefixo `lc-`.

### Cor

| Token CSS | Hex | Uso | Contraste principal |
|---|---|---|---|
| `--tinta` | `#0F1B2D` | texto, base escura, botão primário | acima de 14:1 sobre Papel |
| `--papel` | `#F5F2EA` | fundo institucional; texto sobre Tinta | |
| `--branco-tonal` | `#FCFBF8` | superfícies claras, cartões | |
| `--verde-certo` | `#2FCB86` | check, destaque sobre escuro, botão de WhatsApp | 8,2:1 com texto Tinta; 1,9:1 sobre Papel (nunca como texto nem contorno sobre claro) |
| `--verde-fundo` | `#0B6B4A` | links e check sobre claro, foco sobre claro | 5,8:1 sobre Papel; 6,5:1 com texto branco |
| `--texto-2` | `#3A4658` | texto de apoio | 8,5:1 sobre Papel |
| `--texto-3` | `#5A6575` | texto terciário, rótulos | 5,3:1 sobre Papel; 4,8:1 sobre Campo (mínimo aceito) |
| `--linha` | `#E6E2D8` | bordas leves de separação | decorativa (1,2:1); não serve de limite de campo |
| `--campo` | `#ECE8DE` | fundo de campo, chips, selo neutro | |
| `--linha-tracejada` | `#BFB8A8` | vazio tracejado | decorativa |
| `--aviso-fundo` / `--aviso-texto` | `#FDE9CC` / `#7A4A00` | aviso, atenção | 8,1:1 |
| `--erro-fundo` / `--erro-texto` | `#FBDADA` / `#8A1F1F` | erro | AA |
| `--demo-fundo` / `--demo-texto` | `#FFF0B8` / `#5C4700` | selo "Demonstração" | 5,2:1 |

Sem modo escuro no piloto; o Papel é o fundo de todo o produto. Erro, aviso e demonstração usam sempre o par de tokens, nunca hex avulso nem `red-*` do Tailwind.

### Tipografia

Uma família: Plus Jakarta Sans, pesos 500, 600, 700, 800 (carregada em `app/layout.tsx`). Títulos em 800 com tracking de −0,035em; texto em 500 e 600; rótulos em 700 a 800. Wordmark sempre em caixa baixa, "lista" 500 e "certa" 800, espaçamento −5%.

Escala fixa (produto, sem `clamp`): 12 (mínimo de apoio), 13, 14, 15 (corpo), 16, 20, 26 (título de tela), 30, 40+ (hero do site, único lugar fluido). Corpo com no máximo 65 a 75 caracteres de linha. Regra nova da S28: nenhum texto abaixo de 12 px (hoje há 39 usos de 11 px, ver divergências).

### Espaço, raio, sombra

Base de 4 px; passos usuais 4, 8, 12, 16, 24, 32, 48. Gutter lateral de tela mobile 24 px (`px-6`); coluna mobile de 420 px (`components/auth/Screen.tsx`).

Raios: `--radius-card` 24 px, `--radius-botao` 999 px (pílula), `--radius-campo` 14 px. Sombra só em elevação funcional (cartão do hero, menu); sem sombra decorativa.

## 3. Alvos de toque

Mínimo 44 px de altura e largura para tudo que se toca (WCAG 2.5.8 e regra do produto); 48 px em ação primária no celular; primário de tela usa 56 px (`h-14`). Rádios e caixas de seleção pequenos ganham rótulo clicável de 44 px de altura. Espaço de pelo menos 8 px entre alvos.

## 4. Componentes

Cada linha aponta o arquivo real. Componente React até 250 linhas; Server Component por padrão.

| Componente | Especificação | Arquivo |
|---|---|---|
| Botão (todas as variantes) | `Button` e `buttonClass(variant, size)`: primary, outline, text, danger, icon, whatsapp (`loading` desabilita e anuncia); 48 px (`md`) ou 56 px (`lg`); foco em Verde Fundo, 2 px + offset 2 px | `components/ui/Button.tsx` |
| Botão primário de tela | fundo Tinta, texto Papel, pílula, 56 px, peso 800, foco em Verde Fundo | `primaryButton` em `components/auth/Screen.tsx` |
| Botão secundário | contorno Tinta 1,5 px, fundo transparente, 52 px | `outlineButton` em `components/auth/Screen.tsx` |
| Botão terciário | variante `text` do `Button`: texto Verde Fundo com sublinhado sempre visível, mínimo 44 px de altura | `components/ui/Button.tsx`; links de `components/claims/*`, `components/stationeries/StepService.tsx` |
| Botão de WhatsApp | fundo Verde Certo, texto Tinta, 56 px | `components/stationeries/PublicProfileView.tsx` |
| Campo | rótulo visível acima, fundo Campo, borda 1,5 px `texto-3` (5,3:1), altura 52 px, raio 14 px, `autocomplete` e `inputMode` corretos; `Field` + `fieldInputClass` (regra global em `app/globals.css` cobre `input.bg-campo` antigos) | `components/ui/Field.tsx`, `app/entrar/LoginForm.tsx` |
| Confirmação destrutiva | um só padrão: `<dialog>` nativo, botão de risco por último em `erro-texto`, Esc e Cancelar fecham; nunca `window.confirm` | `components/ui/ConfirmDialog.tsx`, `components/claims/ActionForm.tsx` |
| Seleção (chip, opção) | mínimo 44 px, marcada com contorno Tinta e ícone (nunca só cor) | `components/schools/NetworkChips.tsx`, `components/pesquisa/OpcaoUnica.tsx` |
| Tabela responsiva | contêiner `overflow-x-auto` com `tabindex=0` e rótulo; `<caption>` e `scope="col"`; em 390 px vira lista de cartões quando há ação | `components/leads/LeadTable.tsx`, `components/stationeries/CatalogTable.tsx` |
| Cartão | fundo branco ou branco-tonal, raio 24, sem cartão dentro de cartão | `components/cart/StoreCard.tsx` |
| Selo (badge) | pílula, 12 px mínimo, cor por par de token; verde só para resolvido | `components/lists/badges.tsx`, `components/cart/badges.tsx`, `components/leads/StatusBadge.tsx` |
| Aviso | fundo `aviso-fundo`, texto `aviso-texto`, ícone; `role="status"` | `components/pesquisa/Pesquisa.tsx` (padrão), `components/cart/*` |
| Erro | fundo `erro-fundo`, texto `erro-texto`, `role="alert"`, diz o que fazer | `components/claims/*`, `app/escola/page.tsx` |
| Estado vazio | borda tracejada `linha-tracejada`, título curto, uma frase e uma ação | `components/schools/SearchResults.tsx` |
| Skeleton | blocos `campo` com `animate-pulse` e altura reservada; sem spinner de tela cheia; sem `loading.tsx` na raiz nem em página pública indexável (soft-404) | `components/ui/Skeleton.tsx`, `app/papelaria/loading.tsx`, `app/carrinho/[id]/loading.tsx` |
| Casca de tela | coluna 420 px, `main` com `id="conteudo"`, link "Pular para o conteúdo" | `components/auth/Screen.tsx`, `components/site/SkipLink.tsx` |
| Casca de painel | barra escura Tinta com logo e usuário | `components/admin/AdminShell.tsx`, `components/stationeries/PanelShell.tsx`, `components/claims/SchoolPanelShell.tsx` |

## 5. Formulários

1. Rótulo sempre visível e associado (`<label htmlFor>`); placeholder é exemplo, nunca rótulo.
2. `autocomplete` e `inputMode` em todo campo de pessoa, e-mail, telefone, CEP e número.
3. Erro junto do campo, com `aria-invalid`, `aria-describedby` e `role="alert"`; texto em português dizendo como corrigir.
4. Botão de envio com estado de carregamento ("Enviando…") e desabilitado só com motivo explicado.
5. Campo com limite visível: borda de pelo menos 3:1 contra o fundo ou fundo com contorno no foco (divergência D-04).
6. Consentimento antes de coletar, com texto versionado (S17); nada de dado de menor além de apelido e série.

## 6. Feedback

| Estado | Padrão |
|---|---|
| Sucesso | `role="status"`, texto Verde Fundo sobre claro, diz o próximo passo |
| Erro | `role="alert"`, par `erro-*`, ação de tentar de novo |
| Carregando | skeleton com altura reservada; ação em andamento mostra verbo no gerúndio no botão |
| Vazio | frase útil e uma ação; nunca "nada aqui" |
| Sem fonte | a palavra "indisponível", com o motivo curto; nunca zero nem estimativa |

## 7. Movimento

Movimento comunica estado, não decora. Durações: 150 a 250 ms em interações; até 300 ms em barra de progresso; entradas de bloco na landing até 400 ms. Easing de saída exponencial (`ease-out`); sem bounce nem elástico. Anima só `opacity` e `transform` (e `width` de barra de progresso).

`prefers-reduced-motion`: toda animação nova precisa de alternativa. Com `motion-reduce:`, giro vira estático, pulso e entradas somem e o conteúdo aparece direto; o texto "Carregando…" já basta. Conteúdo nunca depende de animação para aparecer. Padrão existente: `app/loading.tsx`, `components/site/Faq.tsx`, `components/pesquisa/pesquisa.module.css`.

## 8. Acessibilidade

WCAG 2.2 AA. Foco visível em todo controle, com contorno de pelo menos 3:1 contra o fundo local (Verde Fundo sobre claro, Verde Certo só sobre escuro). Um `main` por página e um `h1`. Nomes acessíveis em ícones. Tabelas com cabeçalhos. Idioma `pt-BR`. Nada depende só de cor.

## 9. O que a marca proíbe

Trocar logo, paleta ou fonte; degradê; vidro decorativo; sombra pesada; faixa lateral colorida; texto com degradê; prova social, parceria, preço, prazo ou número inventado; linguagem de promoção; verde em estado neutro; dado de menor além de apelido e série.

## 10. Divergências conhecidas (das auditorias da Fase 2)

Detalhe e severidade em `docs/superpowers/evidencias/S28/auditoria-*.md`.

| ID | Divergência | Task que resolve |
|---|---|---|
| D-01 | 39 usos de `text-[11px]` (selos, notas de preço e data, cabeçalhos de tabela) | Task 20 |
| D-02 | Erros com `text-red-700` e hex avulsos (`#fde2e0`, `#8a1c14`) em cerca de 14 arquivos | Task 18 (resolvida; teste `tests/ui/button-field.test.tsx` vigia) |
| D-03 | Alvos de toque de 36 a 43 px (menus, `h-9`, links de rodapé, rádios de 13 a 16 px) | Task 20 |
| D-04 | Campo em fundo Campo sem borda (limite 1,06:1) | Task 18 (resolvida) |
| D-05 | Contorno de foco Verde Certo sobre fundo claro (1,9:1) em `primaryButton` e `SkipLink` | Task 18 (resolvida) |
| D-06 | Sem `main` em `/enviar-lista`, `/pesquisa`, `/papelarias/[slug]`; sem `h1` em 3 rotas de `/conta` | Task 20 |
| D-07 | Rolagem horizontal no celular em `/parceiros/docs`, `/b2b/docs`, `/b2b/widget`, `/papelaria/catalogo`, reivindicação e todo `/admin` | Task 20 e M34 |
| D-08 | Métricas em "número grande + rótulo" e verde em zero (`/papelaria/leads`, `/b2b`) | Task 15 e Task 18 |
| D-09 | Spinners de tela cheia e rotas sem `loading.tsx` | Task 17 (resolvida nas áreas privadas) |
| D-10 | Campo de busca da home espremido no celular | Task 13 (M33) |
| D-11 | Dois padrões de confirmação destrutiva (`window.confirm` e `<dialog>`) | Task 18 (resolvida) |
