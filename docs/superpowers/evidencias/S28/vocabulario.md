# Vocabulário do produto (S28 · M14)

Um termo por conceito, para a família e a escola. Nas áreas de painel (papelaria, B2B, cobrança, admin) "lead" continua sendo o termo da casa. O teste `tests/site/vocabulary.test.ts` varre os arquivos de texto de `features/` (fora das pastas de painel) e falha se um termo banido voltar.

| Conceito | Termo | Não usar |
|---|---|---|
| Lista publicada e revisada pela escola | lista oficial | lista certa, lista final |
| Lista que a família montou ou copiou | cópia sua | lista candidata |
| Lista enviada e ainda não publicada | lista em análise | candidata |
| Código do Censo Escolar | código INEP, sempre com "(o número da escola no Censo Escolar)" na primeira menção | INEP solto |
| Escola pedindo a gestão da página | pedir para administrar | reivindicar, reivindicação (nas telas da escola e da família; a rota `/reivindicar` e o painel admin mantêm o nome interno) |
| Pedido de preço à papelaria | pedido de cotação, cotação | lead (para a família) |
| Carrinho | carrinho, "opções de compra" | cesta |
| Sem fonte de preço | indisponível | zero, estimativa |

## Telas lidas nesta passada (15)

`/` (hero, seções, faixa "Onde comprar"), `/como-funciona`, `/entrar` e link enviado, `/escolas` (busca e vazio), `/escolas/[inep]`, `/escolas/[inep]/[serie]`, `/carrinho/[id]`, `/cotacao/[code]`, `/cotacao/nova`, `/enviar-lista`, `/conta`, `/escolas/[inep]/reivindicar` (agora "Pedir para administrar"), `/escola`, `/conta/privacidade`, `/l/[code]`.

## Mudanças

- Telas e mensagens da escola: "Reivindicar escola" virou "Pedir para administrar a escola"; "Sua reivindicação" virou "Seu pedido"; estados e erros seguem o gênero de "pedido".
- Texto da home e da busca vazia explica o código INEP.
- Não mudou: o texto jurídico de `features/site/legal.ts` (revisão própria, com teste que fixa as categorias) e o painel admin de reivindicações.
