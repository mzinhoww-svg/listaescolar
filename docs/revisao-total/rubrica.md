# Rubrica de revisão de tela (S29)

Base: regras priorizadas da skill `ui-ux-pro-max` (acessibilidade e toque críticos; desempenho e layout altos; tipografia, animação, formulários e navegação médios), traduzidas para a ListaCerta e alinhadas ao `DESIGN.md`. Responda sim ou não a cada pergunta, em 390 e 1280 px. Cada "não" vira uma linha na coluna "regras violadas" da ficha, com o ID `R-NN` e severidade P0 a P3.

Severidade sugerida: Acessibilidade e Toque, P0 ou P1; Desempenho e Layout, P1 ou P2; demais, P2 ou P3.

## Acessibilidade (crítico)

- R-01: Todo texto tem contraste de pelo menos 4,5:1 com o fundo (3:1 se grande)?
- R-02: Todo controle tem foco visível de pelo menos 3:1 (Verde Fundo sobre claro)?
- R-03: A tela é operável só por teclado, na ordem visual, sem armadilha?
- R-04: Há um `main`, um `h1` e níveis de título em ordem?
- R-05: Ícones e botões só de ícone têm nome acessível (`aria-label`)?
- R-06: Nenhuma informação depende só de cor (há texto ou ícone junto)?
- R-07: Imagens informativas têm `alt`; decorativas têm `alt=""`?
- R-08: Mudanças de estado (sucesso, erro, carregando) são anunciadas (`role="status"`, `role="alert"`, `aria-busy`)?
- R-09: O idioma é `pt-BR` e o zoom de 200% não quebra a tela?

## Toque e interação (crítico)

- R-10: Todo alvo de toque tem pelo menos 44 x 44 px?
- R-11: Há pelo menos 8 px entre alvos vizinhos?
- R-12: Todo controle dá retorno imediato (hover, pressionado, carregando) em até 120 ms?
- R-13: Toque duplo em ação de envio é ignorado enquanto carrega?
- R-14: Ação destrutiva pede confirmação com `ConfirmDialog`, e Esc cancela?
- R-15: Há uma única ação principal por região, e as demais são secundárias ou terciárias?
- R-16: Cada rótulo de botão é verbo + objeto (sem "OK", "Enviar" solto, "Clique aqui")?
- R-17: Botão desabilitado mostra o motivo ao lado?

## Desempenho

- R-18: Nenhum salto de layout ao carregar (altura reservada, skeleton)?
- R-19: Imagens têm largura e altura e carregam sob demanda fora da primeira dobra?
- R-20: Não há spinner de tela cheia nem tela em branco durante o carregamento?
- R-21: A tela funciona em 4G, sem dependência nova pesada (animação, fonte extra)?

## Layout e responsividade

- R-22: Não há rolagem horizontal em 390 px (tabelas viram cartões ou rolam em contêiner rotulado)?
- R-23: O conteúdo cabe em 320 px sem cortar texto ou botão?
- R-24: A hierarquia tem um elemento dominante por seção?
- R-25: O espaçamento segue a escala de 4 px e o gutter mobile de 24 px?
- R-26: Cartões não estão dentro de cartões, e não há sombra decorativa?
- R-27: A ação principal fica visível sem rolar no celular, ou há barra fixa que não cobre conteúdo?

## Tipografia e cor

- R-28: Nenhum texto abaixo de 12 px e o corpo tem 15 ou 16 px?
- R-29: Só Plus Jakarta Sans, nos pesos 500 a 800?
- R-30: Linhas de leitura têm no máximo 75 caracteres?
- R-31: Cores vêm de tokens (`erro-*`, `aviso-*`, `demo-*`), sem hex avulso nem `red-*`?
- R-32: Verde aparece só em algo resolvido (nunca em zero ou estado neutro) e Verde Certo não é botão principal nem texto sobre claro?

## Animação

- R-33: Todo movimento tem função (feedback, estado, orientação, marco)?
- R-34: Durações usam `--mov-rapido`, `--mov-base` ou `--mov-entrada`, nenhuma acima de 400 ms?
- R-35: Só `opacity` e `transform` animam, sem loop decorativo, parallax ou bounce?
- R-36: Com `prefers-reduced-motion` o conteúdo aparece direto e nada depende de animação?

## Formulários

- R-37: Todo campo tem rótulo visível associado (`label htmlFor`), e placeholder é só exemplo?
- R-38: `autocomplete` e `inputMode` corretos em pessoa, e-mail, telefone, CEP e número?
- R-39: O erro aparece junto do campo (`aria-invalid`, `aria-describedby`), em português e diz como corrigir?
- R-40: O limite do campo tem pelo menos 3:1 contra o fundo?
- R-41: O que a pessoa digitou é preservado após erro ou volta?
- R-42: Campos obrigatórios e formatos esperados são avisados antes do envio?
- R-43: Há consentimento antes de coletar dado, e nada de dado de menor além de apelido e série?

## Navegação

- R-44: A pessoa sabe onde está e para onde vai depois (título, passo, próximo passo)?
- R-45: Há volta sem perder o que fez (link ou botão de voltar, rascunho)?
- R-46: Cada estado tem texto e ação: vazio, carregando, erro, sucesso, sem permissão, demonstração?
- R-47: Beco sem saída não existe: erro e vazio sempre oferecem um caminho?
- R-48: O vocabulário é o da marca, sem jargão nem frase duplicada?
- R-49: Dado sem fonte mostra "indisponível" (nunca zero, estimativa ou número inventado) e dado demonstrativo tem o selo "Demonstração"?
- R-50: Links e botões diferem: link navega, botão age?
