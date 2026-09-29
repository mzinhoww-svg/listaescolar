# S29 · Revisão total de UX e UI · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revisar as 81 rotas da ListaCerta por 9 jornadas ponta a ponta e corrigir telas, fluxos, botões e movimento, para que cada tela tenha uma ação principal clara e cada fluxo leve adiante sem beco sem saída.

**Architecture:** Primeiro uma camada fina de sistema (tokens de movimento, variantes de botão, feedback, rubrica e um script de checagem sobre o HTML renderizado). Depois fichas por tela, organizadas por jornada, com `/ui-ux-pro-max` e `/impeccable`. Por fim, correções jornada a jornada, com `/tripled-ui` só onde o movimento tem função, e verificação ponta a ponta.

**Tech Stack:** Next.js 16 App Router, Tailwind (tokens em `app/globals.css`), Supabase local (`scripts/supa.mjs`, trilha por `.track`), Vitest + jsdom, agent-browser, Lighthouse 12, axe.

**Spec:** `docs/superpowers/specs/2026-09-29-s29-revisao-total-ux-design.md` (ADR-008).

## Global Constraints

- Pré-condição: PRs #55 (S19) e #56 (S28) mesclados na `main`; branch `slice/S29-revisao-total` a partir da `main`.
- Marca fechada: logo, Tinta #0F1B2D, Papel #F5F2EA, Verde Certo #2FCB86, Verde Fundo #0B6B4A, Plus Jakarta Sans. Verde Certo não é botão principal.
- Uma ação principal por região de tela; rótulo verbo + objeto; alvo ≥ 44 px; desabilitado com motivo visível.
- Movimento só pelos tokens `--mov-rapido` 120 ms, `--mov-base` 200 ms, `--mov-entrada` 320 ms; nada acima de 400 ms; nada de loop decorativo nem parallax; `prefers-reduced-motion` remove o movimento.
- Nenhuma dependência nova de animação sem Ruling no ledger.
- TypeScript strict sem `any`; componente ≤ 250 linhas; Server Components por padrão.
- Nunca inventar preço, estoque, prazo, métrica ou parceria; menor só apelido e série.
- Vocabulário de `docs/superpowers/evidencias/S28/vocabulario.md` em toda tela.
- Sem regressão: Lighthouse mobile ≥ 90 (desempenho e acessibilidade) e axe sem violação séria ou crítica.
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `git checkout CLAUDE.md` antes de cada commit; push depois de cada commit.
- agent-browser: sessão nomeada `s29-*`, fechar só a própria (nunca `close --all`); encerrar só servidores abertos pela task; no máximo 2 imagens por leitura.

## Review Focus

1. **Botão Voltar do navegador no meio do carrinho ou da cotação:** a pessoa volta e encontra o que tinha escolhido, não um formulário vazio nem um erro. Teste na Task 12 (J2).
2. **Sessão expira no meio de uma ação** (montar carrinho, responder lead): a pessoa entra de novo e volta ao mesmo passo com a ação ainda possível. Teste na Task 13 (J3).
3. **Toque duplo em ação que cria algo** ("Pedir cotação", "Montar carrinho", "Publicar lista"): cria uma vez só e o botão anuncia o carregamento. Teste na Task 2 (variante com `loading`) e verificação na Task 12.
4. **Nome muito longo** de escola, papelaria ou item (80+ caracteres) a 390 px: quebra linha sem rolagem horizontal nem botão empurrado para fora. Checagem na Task 4 (fixture) e na Task 11 (J1).
5. **Rede lenta ou queda durante o envio da foto da lista:** a pessoa vê o progresso, recebe erro acionável e pode tentar de novo sem perder o que escolheu. Teste na Task 14 (J4).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `app/globals.css` | Tokens de movimento e guarda global de `prefers-reduced-motion` |
| `components/ui/Button.tsx` | Variantes `primary`, `outline`, `text`, `danger`, `icon`, `whatsapp`; prop `loading` |
| `components/ui/InlineStatus.tsx` (novo) | Feedback em linha com `aria-live` |
| `lib/ux-checks/*.ts` (novo) | Funções puras de checagem sobre HTML: ação principal por região, beco sem saída, botão fora do sistema, animação fora dos tokens, rolagem por texto longo |
| `scripts/s29-checks.mjs` (novo) | Roda as checagens nas rotas de cada jornada com sessões logadas e grava `docs/revisao-total/checks.md` |
| `scripts/s29-seed-jornadas.sql` (novo) | Dados locais para todas as jornadas rodarem ponta a ponta |
| `docs/revisao-total/rubrica.md` (novo) | Rubrica `/ui-ux-pro-max` aplicada à ListaCerta |
| `docs/revisao-total/fichas/J*.md` (novo) | Uma ficha por rota, por jornada |
| `docs/revisao-total/fluxos.md` (novo) | Mapa das 9 jornadas em Mermaid |
| `docs/revisao-total/backlog.md` (novo) | Achados consolidados e priorizados |
| `DESIGN.md` | Seções de botões, feedback e movimento (spec §7) |

---

### Task 0: Base e dados das jornadas

**Files:**
- Create: `scripts/s29-seed-jornadas.sql`
- Create: `tests/db/s29-seed.test.ts`

**Interfaces:**
- Produces: contas locais `familia@listacerta.test`, `escola@listacerta.test` (membro aprovado), `papelaria@listacerta.test` (com área, catálogo e 1 lead), `admin@listacerta.test`, `parceiro@listacerta.test` (parceiro B2B ativo), todas com `is_demo = true`.

- [ ] **Step 1:** `git fetch && git checkout -b slice/S29-revisao-total origin/main`; confirmar que `git log --oneline -3` mostra os merges de #55 e #56. Se não mostrar, parar e registrar em "Aguardando humano".
- [ ] **Step 2: teste que falha**

```ts
// tests/db/s29-seed.test.ts
import { describe, it, expect } from "vitest";
import { adminClient, runSqlFile } from "./helpers";

describe("seed das jornadas S29", () => {
  it("cria uma conta por público, todas demo, e um lead para a papelaria", async () => {
    await runSqlFile("scripts/s29-seed-jornadas.sql");
    const db = adminClient();
    const { data: profiles } = await db.from("profiles").select("role").in("id", (
      await db.from("profiles").select("id").like("display_name", "S29 %")
    ).data!.map((p) => p.id));
    expect(new Set(profiles!.map((p) => p.role))).toEqual(new Set(["parent", "school", "stationery", "admin"]));
    const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("is_demo", true);
    expect(count).toBeGreaterThan(0);
  });
});
```

(Antes de escrever, abrir `tests/db/helpers.ts` e usar os nomes reais dos helpers; se `runSqlFile` não existir, reaproveitar o padrão de `scripts/s28-seed-medicao.sql` e do teste que o carrega.)

- [ ] **Step 3:** `pnpm db:reset && pnpm vitest run -c vitest.db.config.ts tests/db/s29-seed.test.ts`. Esperado: FAIL (arquivo SQL não existe).
- [ ] **Step 4:** escrever `scripts/s29-seed-jornadas.sql` compondo `scripts/s28-seed-medicao.sql`, `e2e-s14-seed.sql` e `e2e-s24-seed.sql` (via `\i` ou cópia do trecho necessário), com `display_name` prefixado por `S29 `.
- [ ] **Step 5:** rodar o teste de novo. Esperado: PASS. Commit `test(s29): seed das jornadas`.

### Task 1: Tokens de movimento e reduced-motion

**Files:**
- Modify: `app/globals.css` (bloco `:root` de tokens e o bloco `@media (prefers-reduced-motion...)` da linha ~108)
- Test: `tests/brand/motion.test.ts`

**Interfaces:**
- Produces: variáveis CSS `--mov-rapido`, `--mov-base`, `--mov-entrada`, `--mov-ease-in`, `--mov-ease-out`; utilitários Tailwind `duration-mov-rapido|base|entrada`.

- [ ] **Step 1: teste que falha**

```ts
// tests/brand/motion.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

describe("sistema de movimento", () => {
  it("define os três tokens com os valores do spec", () => {
    expect(css).toMatch(/--mov-rapido:\s*120ms/);
    expect(css).toMatch(/--mov-base:\s*200ms/);
    expect(css).toMatch(/--mov-entrada:\s*320ms/);
  });
  it("nenhuma animação ou transição passa de 400 ms", () => {
    const ms = [...css.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    expect(Math.max(...ms)).toBeLessThanOrEqual(400);
  });
  it("reduced-motion zera animação e transição globalmente", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation(-duration)?:\s*(none|0s|0\.01ms)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition(-duration)?:\s*(none|0s|0\.01ms)/);
  });
  it("não há loop decorativo", () => {
    expect(css).not.toMatch(/animation:[^;]*infinite/);
  });
});
```

- [ ] **Step 2:** `pnpm vitest run tests/brand/motion.test.ts`. Esperado: FAIL nos tokens (e no loop, se o `tick-loop` da landing ainda for infinito).
- [ ] **Step 3:** acrescentar os tokens ao `:root`, o bloco global de reduced-motion (`*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }`), e trocar durações soltas pelos tokens. Se o `tick-loop` for infinito, torná-lo finito (3 iterações) com Ruling.
- [ ] **Step 4:** rodar o teste. Esperado: PASS. Rodar também `pnpm vitest run tests/brand`. Commit `feat(s29): tokens de movimento e reduced-motion global`.

### Task 2: Variantes de botão e estado de carregamento

**Files:**
- Modify: `components/ui/Button.tsx`
- Test: `tests/ui/button.test.tsx`

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces: `ButtonVariant = "primary" | "outline" | "text" | "danger" | "icon" | "whatsapp"`; prop `loading?: boolean`; `buttonClass(variant, size, extra)` inalterada na assinatura.

- [ ] **Step 1: teste que falha**

```tsx
// tests/ui/button.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("loading desabilita, anuncia e ignora toque duplo", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Pedir cotação</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Pedir cotação" }));
    rerender(<Button onClick={onClick} loading>Pedir cotação</Button>);
    const b = screen.getByRole("button", { name: /Pedir cotação/ });
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toBeDisabled();
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("variante icon exige nome acessível", () => {
    render(<Button variant="icon" aria-label="Fechar menu">×</Button>);
    expect(screen.getByRole("button", { name: "Fechar menu" })).toBeInTheDocument();
  });
  it("variante text tem alvo mínimo de 44 px", () => {
    render(<Button variant="text">Ver todos</Button>);
    expect(screen.getByRole("button").className).toMatch(/min-h-11|h-11|h-12/);
  });
});
```

- [ ] **Step 2:** rodar. Esperado: FAIL (`loading`, `text` e `icon` não existem).
- [ ] **Step 3:** implementar: `text` = `bg-transparent text-tinta underline-offset-4 hover:underline min-h-11 px-2`; `icon` = `h-11 w-11 p-0` (e `px-0` na base); `loading` → `disabled`, `aria-busy="true"`, largura mantida (`min-w` do conteúdo). Em desenvolvimento, `console.warn` se `variant="icon"` sem `aria-label`.
- [ ] **Step 4:** rodar. Esperado: PASS. Commit `feat(s29): variantes text e icon e estado loading no Button`.

### Task 3: Rubrica, sistemas no DESIGN.md e feedback em linha

**Files:**
- Create: `docs/revisao-total/rubrica.md`
- Modify: `DESIGN.md` (novas seções "Botões e ações", "Feedback", "Movimento")
- Create: `components/ui/InlineStatus.tsx`
- Test: `tests/ui/inline-status.test.tsx`, `tests/brand/design-md.test.ts` (ampliar)

**Interfaces:**
- Produces: `<InlineStatus tone="success" | "error" | "info">texto</InlineStatus>` com `role="status"` (sucesso/info) ou `role="alert"` (erro).

- [ ] **Step 1:** invocar `/ui-ux-pro-max` (Skill `anthropic-skills:ui-ux-pro-max`) e produzir `docs/revisao-total/rubrica.md`: as regras priorizadas da skill (acessibilidade, toque, desempenho, layout, tipografia, animação, formulários, navegação) traduzidas em perguntas de sim/não aplicáveis a uma tela da ListaCerta, cada uma com ID `R-NN`.
- [ ] **Step 2:** invocar `/design-intelligence` e escrever no `DESIGN.md` as três seções do spec §7 (copiar os valores exatos: variantes, rótulo verbo + objeto, carregamento com `aria-busy`, desabilitado com motivo, feedback em linha, erro preso ao campo, tokens de movimento, permitido e proibido).
- [ ] **Step 3: teste que falha** — ampliar `tests/brand/design-md.test.ts`:

```ts
it("DESIGN.md tem os sistemas da S29", () => {
  const md = readFileSync("DESIGN.md", "utf8");
  for (const s of ["Botões e ações", "Feedback", "Movimento", "--mov-base", "aria-busy"]) expect(md).toContain(s);
});
```

e criar `tests/ui/inline-status.test.tsx` verificando `role="status"` para sucesso e `role="alert"` para erro.
- [ ] **Step 4:** rodar ambos. Esperado: FAIL. Implementar `InlineStatus` (≤ 40 linhas, tokens `erro-*` e `verde-fundo`). Rodar. Esperado: PASS. Commit `docs(s29): rubrica ui-ux-pro-max e sistemas no DESIGN.md; InlineStatus`.

### Task 4: Checagens automáticas sobre o HTML

**Files:**
- Create: `lib/ux-checks/primary-actions.ts`, `lib/ux-checks/dead-ends.ts`, `lib/ux-checks/off-system.ts`, `lib/ux-checks/index.ts`
- Create: `scripts/s29-checks.mjs`
- Test: `tests/ux-checks/*.test.ts`

**Interfaces:**
- Produces:
  - `countPrimaryPerRegion(doc: Document): { region: string; count: number }[]` — região = cada `main`, `header`, `footer`, `form`, `dialog`, `[data-region]`; primária = elemento com a classe `bg-tinta` em `button`/`a`.
  - `findDeadEnds(doc: Document, path: string): string[]` — devolve motivos quando a tela não tem nenhum link ou botão que leve adiante (fora do header/footer) ou nenhum caminho de volta (link "Voltar", breadcrumb ou header com logo linkado).
  - `findOffSystemButtons(doc: Document): string[]` — `button`/`a[role=button]` sem nenhuma das classes-assinatura do `buttonClass` (`rounded-botao`) e sem `data-ui="native-ok"`.
  - `findOffTokenMotion(cssText: string): string[]` — `transition`/`animation` com duração literal fora de 120/200/320 ms.
  - `scripts/s29-checks.mjs --jornada J1` → grava a seção da jornada em `docs/revisao-total/checks.md` e sai com código 1 se houver falha.

- [ ] **Step 1: testes que falham**

```ts
// tests/ux-checks/primary-actions.test.ts
import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";
import { countPrimaryPerRegion } from "@/lib/ux-checks";

const doc = (html: string) => new JSDOM(html).window.document;

describe("countPrimaryPerRegion", () => {
  it("acusa duas ações principais no mesmo main", () => {
    const r = countPrimaryPerRegion(doc(`<main><a class="rounded-botao bg-tinta">A</a><button class="rounded-botao bg-tinta">B</button></main>`));
    expect(r.find((x) => x.region === "main")!.count).toBe(2);
  });
  it("aceita uma principal no main e outra num dialog", () => {
    const r = countPrimaryPerRegion(doc(`<main><a class="rounded-botao bg-tinta">A</a><dialog open><button class="rounded-botao bg-tinta">B</button></dialog></main>`));
    expect(r.every((x) => x.count <= 1)).toBe(true);
  });
});
```

```ts
// tests/ux-checks/dead-ends.test.ts
import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";
import { findDeadEnds } from "@/lib/ux-checks";

const doc = (html: string) => new JSDOM(html).window.document;

describe("findDeadEnds", () => {
  it("tela só com texto no main é beco sem saída", () => {
    expect(findDeadEnds(doc(`<header><a href="/">ListaCerta</a></header><main><p>Nenhuma papelaria.</p></main>`), "/cotacao/nova")).toContain("sem ação adiante");
  });
  it("vazio com ação passa", () => {
    expect(findDeadEnds(doc(`<header><a href="/">ListaCerta</a></header><main><p>Nada.</p><a href="/carrinho/1">Voltar ao carrinho</a></main>`), "/cotacao/nova")).toEqual([]);
  });
});
```

```ts
// tests/ux-checks/off-system.test.ts
import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";
import { findOffSystemButtons, findOffTokenMotion } from "@/lib/ux-checks";

describe("fora do sistema", () => {
  it("acusa botão com classes próprias", () => {
    const d = new JSDOM(`<button class="bg-red-600 px-2">Excluir</button>`).window.document;
    expect(findOffSystemButtons(d)).toHaveLength(1);
  });
  it("acusa transição de 500ms e aceita 200ms", () => {
    expect(findOffTokenMotion(".a{transition:opacity 500ms}")).toHaveLength(1);
    expect(findOffTokenMotion(".a{transition:opacity 200ms}")).toHaveLength(0);
  });
});
```

Fixture de nome longo (Review Focus 4) em `tests/ux-checks/long-text.test.ts`: renderizar `components/schools/SchoolCard` (ou o cartão de escola real — abrir `components/schools/` para o nome exato) com nome de 90 caracteres e checar que o elemento do nome tem `break-words` ou `[overflow-wrap:anywhere]`.

- [ ] **Step 2:** rodar `pnpm vitest run tests/ux-checks`. Esperado: FAIL (módulos não existem).
- [ ] **Step 3:** implementar as quatro funções (puras, sem rede) e `scripts/s29-checks.mjs`, que reaproveita `login()`/`ensureSessions()` de `scripts/s28-medir.mjs` (extrair para `scripts/lib/sessions.mjs` se preciso), busca o HTML de cada rota da jornada com o cookie da conta certa, roda as funções e também as checagens de rolagem, `main`, `h1`, alvo de toque e texto < 12 px já existentes. A lista de rotas por jornada vem de `docs/revisao-total/fluxos.md` (Task 5) ou, até lá, de uma constante `JOURNEYS` no próprio script copiada do spec §4.
- [ ] **Step 4:** rodar os testes. Esperado: PASS. Rodar `node scripts/s29-checks.mjs --jornada J1` contra `pnpm build && pnpm start` local (porta da trilha) e guardar a saída como linha de base em `docs/revisao-total/checks-antes.md`. Commit `feat(s29): checagens de ação principal, beco sem saída, botão e movimento fora do sistema`.

### Task 5: Mapa de fluxos e fichas de J9, J1 e J2

**Files:**
- Create: `docs/revisao-total/fluxos.md`, `docs/revisao-total/fichas/J9.md`, `J1.md`, `J2.md`, capturas em `docs/revisao-total/capturas/antes/`

- [ ] **Step 1:** escrever `fluxos.md` com um diagrama Mermaid por jornada (spec §4), cada nó = rota, cada aresta = ação que leva de uma à outra, costuras entre públicos marcadas.
- [ ] **Step 2:** com `pnpm build && pnpm start` e o seed da Task 0, percorrer J9, J1 e J2 no agent-browser a 390 × 844 e 1280 × 800, capturando cada passo (`capturas/antes/J1-01-inicio-390.png` etc.).
- [ ] **Step 3:** invocar `/impeccable` (`critique` e `audit`) por jornada e aplicar a rubrica `R-NN` da Task 3 a cada rota; preencher uma linha de ficha por rota com os campos do spec §6. Começar cada ficha pelos achados da auditoria da S28 da mesma rota (`docs/superpowers/evidencias/S28/auditoria-*.md`), marcando os já resolvidos.
- [ ] **Step 4:** anexar a cada ficha a saída de `node scripts/s29-checks.mjs --jornada <J>`. Commit `docs(s29): fluxos e fichas de J9, J1 e J2`.

### Task 6: Fichas de J3 e J4

Mesmos passos 2–4 da Task 5 para J3 e J4 (conta, login por link mágico com Mailpit e Google indisponível localmente: registrar a experiência de erro; envio de lista com foto real de 5 MB+). Commit `docs(s29): fichas de J3 e J4`.

### Task 7: Fichas de J5 e J6

Mesmos passos 2–4 da Task 5 para J5 e J6, logando como `escola@` e `papelaria@` do seed; percorrer a costura J2 → J6 (lead criado pela família aparece para a papelaria, resposta volta). Commit `docs(s29): fichas de J5 e J6`.

### Task 8: Fichas de J7 e J8

Mesmos passos 2–4 da Task 5 para J7 (as 17 rotas do admin, núcleo piloto primeiro) e J8 (B2B, `parceiro@`). Commit `docs(s29): fichas de J7 e J8`.

### Task 9: Backlog consolidado

**Files:**
- Create: `docs/revisao-total/backlog.md`
- Modify: `docs/superpowers/DEBT.md` (D-161 marcada como absorvida pela S29), `docs/MELHORIAS.md` (itens pós-piloto que a S29 resolve)

- [ ] **Step 1:** juntar todos os achados das fichas, deduplicar com `MELHORIAS.md` e `DEBT.md`, e classificar P0 (bloqueia a jornada), P1 (confunde ou atrasa), P2 (inconsistência de sistema), P3 (acabamento).
- [ ] **Step 2:** para cada achado: ID `UX-NNN`, jornada, rota, arquivo provável, correção concreta em uma frase, teste ou checagem que prova. P0 e P1 das jornadas piloto são obrigatórios na Task 10–18; P2 e P3 podem receber Ruling de adiamento com motivo.
- [ ] **Step 3:** Commit `docs(s29): backlog da revisão total`.

### Tasks 10 a 18: Correções por jornada

Uma task por jornada, nesta ordem: **10 = J9, 11 = J1, 12 = J2, 13 = J3, 14 = J4, 15 = J6, 16 = J5, 17 = J7, 18 = J8** (bordas primeiro; depois família, papelaria, escola, equipe, B2B).

Cada task tem a mesma forma:

**Files:** os listados na coluna "arquivo provável" dos itens `UX-NNN` da jornada no `backlog.md`.

- [ ] **Step 1:** para cada item com lógica (estado, navegação, validação, dupla submissão, retorno após login), escrever o teste que falha no padrão de `tests/` da área (Testing Library para componente, Vitest puro para função, `tests/db/` para repositório).
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** corrigir: aplicar `Button`/`buttonClass`, `InlineStatus`, `Field`, `ConfirmDialog` e `Skeleton`; textos pelo vocabulário; estados vazio, carregando e erro com ação. Onde a ficha pede movimento com função (feedback, transição, orientação, celebração de marco), invocar `/tripled-ui` e adaptar aos tokens da Task 1, sem dependência nova. Usar `/impeccable` (`clarify`, `distill`, `harden`, `polish`, `animate`) conforme o tipo do item.
- [ ] **Step 4:** rodar os testes da área e `node scripts/s29-checks.mjs --jornada <J>`. Esperado: testes PASS e 0 falhas nas rotas da jornada.
- [ ] **Step 5:** capturar o "depois" a 390 e 1280 (`capturas/depois/`), marcar os itens `UX-NNN` como resolvidos na ficha e no backlog. Commit `fix(s29): jornada <J> — <resumo>`; push.

Testes obrigatórios do Review Focus, cada um na task da jornada dona:
- **Task 12 (J2):** voltar pelo histórico do navegador de `/cotacao/nova` para `/carrinho/[id]` mantém a opção escolhida (teste de componente com estado vindo da URL/servidor, não de estado React perdido) e toque duplo em "Pedir cotação" cria um único pedido (teste da action com duas chamadas concorrentes → um registro).
- **Task 13 (J3):** ação protegida com sessão expirada redireciona para `/entrar?next=<rota atual>` e, após o login, volta à mesma rota (teste de `features/auth/redirect.ts`).
- **Task 14 (J4):** falha de rede no upload mostra erro acionável e botão "Tentar de novo" que reenvia sem pedir a série de novo (teste do componente de envio com `fetch` rejeitado).
- **Task 11 (J1):** nome de escola com 90 caracteres a 390 px sem rolagem horizontal (checagem do `s29-checks` com o seed contendo uma escola de nome longo).

### Task 19: Verificação, E2E e revisão final

**Files:**
- Create: `scripts/e2e-s29.sh` (usa `scripts/e2e-lib.sh`), `docs/superpowers/e2e/S29.md`, `docs/revisao-total/comparacao.md`, `docs/revisao-total/teste-de-corredor.md`
- Modify: `docs/superpowers/PROGRESS.md`, `docs/superpowers/ledger.md`

- [ ] **Step 1:** `scripts/e2e-s29.sh` percorre as 9 jornadas ponta a ponta com asserções por passo (texto da ação principal presente, destino correto, estado final esperado). Rodar. Esperado: 0 falhas.
- [ ] **Step 2:** `node scripts/s29-checks.mjs --todas` → 0 falhas; Lighthouse e axe com `scripts/s28-medir.mjs` nas páginas do aceite da S28 e nas áreas logadas → desempenho e acessibilidade ≥ 90, axe 0 sérias/críticas. Montar `comparacao.md` com capturas antes × depois por jornada.
- [ ] **Step 3:** escrever `teste-de-corredor.md` (spec §9) e o item correspondente em "Aguardando humano".
- [ ] **Step 4:** revisão final com Opus em três grupos (J1–J4, J5–J7, J8–J9), cada uma aplicando a rubrica e `/impeccable critique`. Corrigir bloqueantes e importantes; menores com Ruling.
- [ ] **Step 5:** gate completo `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm db:reset && pnpm test:db`; PROGRESS, DEBT e ledger; PR `S29 · Revisão total de UX e UI` com o checklist da seção 8 do SPEC, a tabela das 9 jornadas e o link das comparações. Não mesclar.

---

## Self-review

- **Cobertura do spec:** §3.1 → Tasks 5–8; §3.2 → Tasks 4, 10–19; §3.3 → Task 4 (`countPrimaryPerRegion`); §3.4 → Tasks 2, 4; §3.5 → Tasks 1, 4; §3.6 → Tasks 5–8 e 10–18 (vocabulário); §3.7 e §3.8 → Task 19; §3.9 → Task 19 Step 4; §5 → Tasks 3, 5–8, 10–18; §6 → Tasks 5–8; §7 → Tasks 1–3; §8 → ordem das tasks; §9 → Task 19 Step 3; §10 → Task 9 (dedupe com S28) e Rulings.
- **Placeholders:** as Tasks 10–18 não trazem código porque os achados só existem depois das fichas; cada uma tem forma fixa, teste obrigatório do Review Focus e checagem automática como critério de saída.
- **Consistência de nomes:** `buttonClass`, `Button`, `InlineStatus`, `countPrimaryPerRegion`, `findDeadEnds`, `findOffSystemButtons`, `findOffTokenMotion`, `s29-checks.mjs --jornada <J>` e `--todas` usados igual em todas as tasks.
