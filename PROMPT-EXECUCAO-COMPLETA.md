# ListaCerta · execução completa autônoma (S00 a S27)

## Missão
Construir a ListaCerta inteira, da fatia S00 à S27, seguindo `docs/PLAN.md`, e deixar tudo pronto para produção. Use o Superpowers do começo ao fim e trabalhe com múltiplos agentes. Não me consulte entre fatias.

## Autoridade e fontes
- **Hierarquia:** `docs/SPEC.md` e `docs/SPEC-2-cobranca-b2b.md` mandam; `docs/PLAN.md` define ordem e aceite; `CLAUDE.md` define regras de código; `docs/decisions/` registra decisões (ADR-001 definitivo, ADR-002 rejeitado: escopo completo).
- **Referência visual obrigatória:** as telas em `docs/design/png` e `docs/design/html`, conforme o mapa em `docs/design/SCREENS.md`. Reproduza layout, textos, estados e tokens de `docs/brand/tokens.json`. Números das telas são demonstração; no app, tudo vem do banco.
- **Spec aprovado:** não faça brainstorming interativo nem perguntas de escopo.
- **Decisões:** decida o que o spec não cobrir e registre em `docs/superpowers/ledger.md` no formato `Ruling: <decisão> — <motivo> — <custo se estiver errada>`.

## Permissões
- **Autorizado sem perguntar:**
  - criar branches `slice/SNN-nome` e worktrees;
  - commitar e fazer push dessas branches;
  - abrir PR por fatia;
  - fazer merge do PR em `main` quando o gate estiver verde e a revisão aprovada, com squash, sem force push;
  - aplicar migrations no Supabase local e no projeto de staging.
- **Proibido:**
  - push direto ou force push em `main`;
  - alterar settings de GitHub, Vercel ou Supabase;
  - commitar `.env.local` ou qualquer segredo;
  - movimentar dinheiro real ou usar credencial de pagamento real.
- **Pare e me chame só para:**
  - migration no Supabase de produção (na S20);
  - credencial que só eu tenho (Pix, afiliados, chave de produção);
  - operação irreversível;
  - um impasse em que todo caminho seja um chute.
  - Em todos os outros casos, decida e siga.

## Continuidade entre sessões
- Mantenha `docs/superpowers/PROGRESS.md` com: fatia atual, fatias concluídas com link do PR e SHA do merge, trilhas em andamento, bloqueios e próximo passo.
- Atualize o arquivo a cada fatia concluída e antes de qualquer pausa.
- **Se a sessão reiniciar ou o contexto for compactado:** leia `CLAUDE.md` e `PROGRESS.md` e continue de onde parou, sem refazer o que já está em `main`.

## Método (Superpowers)
Para cada fatia ou trilha:
1. **superpowers:using-git-worktrees:** worktree isolado por fatia.
2. **superpowers:writing-plans:** plano da fatia em `docs/superpowers/plans/`, com tarefas pequenas, arquivos, testes e as telas de referência de cada tarefa.
3. **superpowers:subagent-driven-development:** um subagente implementador por tarefa, com revisão de spec e de qualidade depois de cada uma.
4. **superpowers:test-driven-development:** em toda lógica de domínio, estados, RLS, cobrança e segurança.
5. **superpowers:systematic-debugging:** em qualquer falha de teste ou de build.
6. **superpowers:requesting-code-review:** revisão da branch inteira antes do merge.
7. **superpowers:verification-before-completion:** nada é declarado pronto sem saída de comando fresca.
8. **superpowers:finishing-a-development-branch:** push, PR e merge conforme as permissões acima.

**Paralelismo (superpowers:dispatching-parallel-agents).** Siga a ordem de execução do `PLAN.md`:
1. S00, S01 e S02 em sequência.
2. Depois do merge da S02, três trilhas em paralelo, cada uma em seu worktree e com seu agente: Dados (S03 a S06), Pipeline (S07 a S10) e Comércio (S12 a S14).
3. S11.
4. Duas trilhas em paralelo: Cobrança (S21 a S23) e B2B (S24 a S26).
5. S15, S16 e S27.
6. S17, S18 e S19.
7. S20 por último.

**Regras de paralelismo:**
- Migrations numeradas por trilha: Dados 01xx, Pipeline 02xx, Comércio 03xx, Cobrança 04xx, B2B 05xx.
- Dependências novas são instaladas pelo orquestrador antes de disparar as trilhas.
- Conflito de merge é resolvido pelo orquestrador, com rebase da trilha mais nova.

## Gate de cada fatia
- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` verdes.
- `pnpm db:reset` aplica todas as migrations do zero.
- Testes de RLS para os perfis afetados.
- Roteiro E2E da fatia com agent-browser no preview da Vercel, comparando com as telas de referência (screenshot anexado ao PR).
- Nenhum componente acima de 250 linhas.
- Nenhum segredo no diff: busque `sb_secret`, `sk-` e chaves.
- Checklist da seção 8 do spec preenchido no PR.

## Regras de produto que não podem ser quebradas
- Nunca inventar preço, estoque, métrica, parceria ou dado de escola. Sem fonte, a tela mostra "indisponível" ou vazio.
- Criança só por apelido e série. Nenhum dado de menor ou do responsável vai para a papelaria ou para a API B2B.
- Cadastro INEP não é verificação.
- Alerta Procon é sinalização para revisão, não parecer jurídico. Campanha de marca nunca substitui marca exigida pela escola.
- Cobrança por livro-razão imutável; saldo sempre derivado dele.
- IA só via adapter OpenRouter, modelos vindos de `AI_MODEL_*`, toda decisão gravada em `ai_decisions`.

## S20 · Entrega final
- Suíte agent-browser completa nos fluxos família, escola, admin, papelaria e B2B, rodando no staging.
- `docs/GO-LIVE.md` com checklist, variáveis por ambiente e plano de rollback.
- Script de migration de produção pronto e testado em staging. **Pare aqui e me peça a confirmação** para aplicar em produção e importar o CSV oficial do INEP.

## Relatório final (última mensagem)
- Tabela das 28 fatias com PR, SHA do merge e resultado do gate.
- Links do staging e do preview de produção.
- Todos os Rulings do ledger.
- Pendências que dependem de mim (credenciais, confirmação da migration de produção, dados reais).
- Riscos conhecidos e dívida técnica.

Comece agora pela S00.
