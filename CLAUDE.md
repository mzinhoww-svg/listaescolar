# CLAUDE.md · ListaCerta

Leia antes de cada sessão. Em conflito com qualquer outra fonte, pare e aponte ao humano.

## Produto
ListaCerta: plataforma neutra de listas oficiais de material escolar. Não vende. Organiza, compara, gera leads e redireciona. Piloto em Cuiabá/MT; municípios habilitados por dado (`municipalities.is_enabled`).

## Documentos do repositório
- `docs/SPEC.md`: spec do produto (estados, modelo de dados, fluxos, critérios de pronto).
- `docs/PLAN.md`: plano de fatias S00 a S20, com prompt, aceite e teste de cada uma.
- `docs/decisions/`: ADRs. ADR-001 é definitivo. ADRs com status "proposta" não valem até o humano aprovar.
- `docs/brand/`: tokens.json, guia de marca, logos (SVG e PNG) e pranchas da marca. Use estes arquivos no layout; não redesenhe o logo.
- `docs/SPEC-2-cobranca-b2b.md`: regras de cobrança da papelaria, conversão, contestação e portal B2B.
- `docs/design/`: 82 telas em PNG e HTML de referência, com o mapa por fatia em `SCREENS.md`. Toda UI segue essas telas.
- `docs/superpowers/PROGRESS.md`: estado da execução. Ao iniciar ou retomar qualquer sessão, leia este arquivo primeiro.

## Ambiente real (set/2026)
- GitHub: mzinhoww-svg/listaescolar. Vercel: projeto listaescolar. Supabase: projeto ListaEscolar.
- Supabase usa as chaves novas: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no cliente e SUPABASE_SECRET_KEY só no servidor. Não use os nomes legados anon/service_role.
- IA via OpenRouter (OPENROUTER_KEY). O adapter é um só; os modelos vêm de AI_MODEL_CHEAP, AI_MODEL_STRONG e AI_MODEL_VISION. Nunca fixe nome de modelo no código.
- Nomes de variáveis: siga o .env.example. Nunca commite .env.local.

## Decisões definitivas (não reabrir)
- Arquitetura A: Next.js App Router + Supabase (Postgres, Auth, Storage, Edge Functions, Queues) + Vercel.
- Repositório novo, Supabase do zero, projetos `staging` e `production`.
- Marca ListaCerta. Tokens: Tinta #0F1B2D, Papel #F5F2EA, Verde Certo #2FCB86, Verde Fundo #0B6B4A, fonte Plus Jakarta Sans.

## Regras de código
- TypeScript strict, sem `any`. Zod em toda fronteira: forms, Server Actions, Route Handlers, saída de IA, CSV.
- Componente React com até 250 linhas. Passou disso, quebre.
- Server Components por padrão; `"use client"` só com interação.
- Service role só em código de servidor (`server-only`). Nunca no cliente.
- Migrations SQL em `supabase/migrations`, uma por fatia, com chaves `uuid default gen_random_uuid()`, `created_at` e `updated_at`, RLS habilitada em toda tabela.
- IA só via `lib/ai/providers/*` (adapters). Regra de negócio nunca importa um SDK de provedor.
- Toda decisão automatizada grava em `ai_decisions`.
- Pastas: `app/` (rotas), `components/` (UI), `features/<domínio>/` (actions, queries, schemas, services), `lib/` (infra), `supabase/` (migrations, functions, seed).

## Regras de produto
- Nunca inventar preço, estoque, prazo, métrica, parceria, dado de escola ou informação regulatória. Sem fonte, mostrar "indisponível".
- Dados demonstrativos com `is_demo = true` e selo "Demonstração".
- Menores: só apelido e série. Nada de dado de menor para papelaria.
- Cadastro INEP não é verificação.
- Não afirmar conformidade jurídica. Alertas de lista são sinalizações para revisão.

## Testes
- Vitest para domínio, serviços, schemas e máquinas de estado.
- agent-browser (vercel-labs) para E2E no preview da Vercel ao fim de cada fatia.
- Toda fatia termina com: `pnpm typecheck && pnpm lint && pnpm test` verdes e roteiro E2E executado.

## Fluxo de trabalho
Uma fatia por vez, na ordem do `docs/PLAN.md`. Branch `slice/SNN-nome`, PR com checklist do spec (seção 8). Mudança de escopo: registrar em `docs/decisions/` antes de codar.

## Autonomia (regra permanente, vale em todas as sessões)
Todas as decisões são do Claude: produto, UX, arquitetura, banco, bibliotecas, ferramentas, ambiente, infraestrutura, nomes, textos, prioridades, conflitos entre documentos e qualquer ambiguidade do spec. Não fazer perguntas nem oferecer opções ao humano. Decidir pela opção que melhor cumpre o SPEC e o PLAN, registrar em `docs/superpowers/ledger.md` como `Ruling: <decisão> — <motivo> — <custo se estiver errada>` e seguir. Isto prevalece sobre a linha "em conflito, pare e aponte ao humano" no topo deste arquivo.

Únicas exceções (não são decisões, são ações que só o humano pode executar ou que não têm volta). Parar e avisar apenas nestes casos:
- aplicar migration ou apagar dados no Supabase de produção;
- criar ou fornecer credencial que só o humano tem (Pix, afiliados, chaves de produção, contas em serviços pagos);
- qualquer gasto de dinheiro.

Mesmo nesses casos: deixar tudo pronto, registrar em `docs/superpowers/PROGRESS.md` o que falta e continuar as outras fatias em paralelo, sem ficar parado.

### Fluxo de mudança (vale também para docs e para este arquivo)
Toda mudança, inclusive no CLAUDE.md, segue: branch, commit, PR, revisão e só então merge (squash). Nunca push direto na `main`, nunca force push. Sem revisão registrada no PR, não há merge.

## Ambiente (ADR-003)
O projeto Supabase `ListaEscolar` (ref hojbnqkwzsicahzgshne) é o **staging**. Migrations podem ser aplicadas nele. O projeto de **produção** ainda não existe e só o humano o cria (ver PROGRESS.md). Isto substitui `docs/decisions/0001-sem-staging.md`.
