# Auditoria impeccable · Escola

Método: `impeccable` (audit + critique), build local na porta 3002 com Supabase local; agent-browser em 390x844 e 1280x800; sonda de DOM; leitura do código. Nenhum código alterado nesta fase. Severidade P0 a P3; "Resolve" aponta a task do plano `2026-09-28-s28-excelencia.md` ou item de `docs/MELHORIAS.md`. Limite honesto: o banco local não tem reivindicação nem membro de escola aprovado (`seed:demo-claims` cria só pedidos pendente e recusado e nunca aprova), então `/escola` e `/escola/listas/nova` foram vistos como conta `parent` (403 correto, página de erro) e o restante foi auditado no código. O fluxo `/escolas/[inep]/reivindicar` foi sondado e visto. Referência: Escola01 a Escola12.

## Saúde

| Dimensão | Nota | Achado principal |
|---|---|---|
| Acessibilidade | 2 | Rádios de 13 a 16 px no seletor de método; texto de 11 px em selos e cabeçalhos de tabela |
| Desempenho | 3 | Sem achado |
| Responsivo | 2 | `/escolas/[inep]/reivindicar` com rolagem horizontal no celular (416 px) |
| Tema | 3 | Tokens em uso; `text-red-900`/bordas avulsas |
| Anti-padrões | 3 | Sem tiques; eyebrows em caixa alta com tracking largo repetidos |
| **Total** | **13/20** | Aceitável; trabalho relevante |

## Achados

| ID | Sev. | Rota / arquivo | Achado | Resolve |
|---|---|---|---|---|
| E-01 | P1 | `/escolas/[inep]/reivindicar`, `components/claims/ClaimFlow.tsx`, `ClaimStepper.tsx` | Rolagem horizontal no celular: o passo "Análise" do `ClaimStepper` e o cartão de método ultrapassam a coluna (sw 416 para 390). | Task 16 (M13) e Task 20 |
| E-02 | P1 | `MethodPicker.tsx` | Rádios nativos de 13 a 16 px e área de toque sem 44 px; dois dos três métodos aparecem "Indisponível" com fundo acinzentado e texto de baixo contraste; a mãe/gestor vê 2 de 3 opções mortas antes de chegar à única viável. | Task 16 e Task 20 |
| E-03 | P1 | `/escola`, `components/claims/MySchoolsTable.tsx`, `StatusPanel` de reivindicação | Estados `awaiting_verification`, `token_expired`, `insufficient_evidence` sem "o que fazer agora"; espera sem convite a preparar o PDF. | Task 16 (M13) |
| E-04 | P2 | `/escolas/[inep]/reivindicar` | Termo "Reivindicar" versus "Cadastrar minha escola" (landing): duas palavras para um conceito; "INEP" sem explicação. Rótulo "Por que reivindicar" em 11 px. | Task 14 (M14) |
| E-05 | P2 | `MySchoolsTable.tsx` | Cabeçalho de tabela e selos em 11 px; `grid size-9` com texto 11 px. | Task 20 |
| E-06 | P2 | `/escola`, `actions` | Só há "Reivindicar outra escola"; sem atalho para enviar PDF ou revisar lista da escola vinculada. | Task 16 |
| E-07 | P2 | `/escola/*` | Sem `loading.tsx`; erro carregando escolas em bloco isolado com "Tentar de novo" (bom). | Task 17 |
| E-08 | P3 | Divulgação | Momento "lista publicada, compartilhe" (mensagem de WhatsApp pronta) inexistente; `/l/[code]` e QR existem. | Task 9 (M11) e pós-piloto M26 |
| E-09 | P3 | `components/claims/ClaimLayout.tsx` | Eyebrow verde-certo em 11 px caixa alta com tracking 0,15em sobre fundo escuro. | Task 18 |

## Comparação com `docs/design`

Escola01, 02 e 04 mostram passos e estados claros; implementação segue a estrutura, mas o passo de método e o `Stepper` não cabem no 390 (E-01, E-02). Escola03 (minhas escolas) existe como tabela; falta o campo "próximo passo".

## Contagem

P0 0, P1 3, P2 4, P3 2. Total 9.
