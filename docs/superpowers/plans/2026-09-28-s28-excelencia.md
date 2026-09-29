# S28 · Excelência de produto e design · Plano de implementação (fases 2 a 5)

> **Para quem executa:** use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Passos com caixa de seleção (`- [ ]`). Worktree `S28-excelencia`, branch `slice/S28-excelencia-produto`, `.track` = 2 (app na porta 3002, API local 54421, Mailpit 54524, contêiner `supabase_db_listacerta-t2`).

**Meta:** entregar o top 15 de `docs/MELHORIAS.md` com PostHog (ADR-007), custo de IA por lista e consultas lentas medidos, e provar o ganho com o mesmo script de medição do "antes".

**Arquitetura:** mudanças de texto, estado e apresentação nas áreas existentes; três módulos novos e pequenos (`lib/analytics/`, `features/submissions/image-reduction*`, `features/ai-settings/cost.ts`); uma migration aditiva (`0800`); nenhuma regra de negócio alterada.

**Stack:** Next.js 16 App Router, TypeScript strict, Zod 4, Tailwind com tokens reais (`--tinta`, `--papel`, `--verde-*`; utilitários `bg-tinta`, `text-texto-2`), Vitest, Supabase local, agent-browser, Lighthouse 12 e axe-core via `scripts/s28-medir.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-28-s28-excelencia-design.md` · Diagnóstico: `docs/MELHORIAS.md` · Baseline: `docs/superpowers/evidencias/S28/antes/`.

## Restrições globais (valem para toda task)

- Marca fechada: Tinta #0F1B2D, Papel #F5F2EA, Verde Certo #2FCB86, Verde Fundo #0B6B4A, Plus Jakarta Sans; logo não muda.
- Nunca inventar preço, estoque, prazo, métrica, parceria ou dado de escola. Sem fonte, "indisponível".
- Menores: só apelido e série. Nenhum evento PostHog carrega nome, e-mail, telefone, CPF, apelido, série de estudante, texto livre, conteúdo de lista, IP ou valor em dinheiro; só identificadores pseudônimos (uuid do perfil, INEP, slug de série, IBGE, buckets).
- Sem dependência nova pesada. Nenhum pacote novo em `dependencies` sem Ruling no `ledger.md` (S28).
- `prefers-reduced-motion` respeitado em toda animação nova.
- Componente com até 250 linhas (`pnpm check:sizes`); `"use client"` só com interação; Zod em toda fronteira; sem `any`.
- Não tocar staging, produção nem Vercel. Migration só local; aplicação no staging fica registrada em "Aguardando humano" no `PROGRESS.md` se for barrada.
- Commits em português, `docs(s28): ...` ou `feat(s28): ...`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; rodar `git checkout CLAUDE.md` antes de cada commit; `git push -u origin slice/S28-excelencia-produto` ao fim de cada task.
- Gate de cada task: `pnpm typecheck && pnpm lint && pnpm test`. Gate da fatia: mais `pnpm db:reset && pnpm test:db && pnpm build` (antes de `db:reset`: `pgrep -f "vitest.mjs run -c vitest.db.config.ts"` deve estar vazio).
- Encerrar só o servidor que abriu: `kill "$(lsof -ti tcp:3002 -sTCP:LISTEN)"`. Nunca `pkill` nem `agent-browser close --all`; sessões próprias com prefixo `s28-`.

## Achados da baseline que moldam o plano

- Lighthouse mobile "antes" (mediana de 3, build local): desempenho 93 a 99 e acessibilidade 100 em todas as 9 páginas; axe sem nenhuma violação (46 a 34 regras aprovadas por página). **Os dois critérios numéricos do aceite já passam no build local.** O trabalho de M08 e M09 vira "não regredir, cobrir as demais áreas (admin, B2B, escola, conta, cotação) e medir as páginas logadas de forma confiável", e não "subir a nota".
- SEO baixo (54 a 69) é efeito do `noindex` fora da produção; não é meta da fatia.
- No primeiro run, `/papelaria` e `/enviar-lista` redirecionaram para `/entrar`; o script agora falha alto se a sessão não está logada (`assertLogged`). O "depois" mede as duas logadas.
- `B2B_CAMPAIGN_TRACKING_SECRET` é lida em `features/campaigns/tracking-service.ts` mas não consta em `.env.example` nem em `lib/env.ts` (Task 19).
- `features/submissions/constants.ts` diz que fotos grandes "são reduzidas no navegador", mas nada o faz (`SubmitForm.tsx` não tem canvas): M04 é real.
- `ai_decisions` não guarda tokens nem custo (o roteador já soma `usage`, mas não persiste): M02 exige migration.

## Revisão de foco (o que o spec implica e nenhum teste cobre por padrão)

1. Foto de 8 MB em HEIC (Chrome não decodifica): o envio deve orientar em português, nunca falhar em silêncio (Task 12).
2. Evento com valor parecido com e-mail, telefone ou CPF (ex.: `query_length` trocado por texto): deve ser descartado e nunca enviado (Task 20).
3. Recusa ou revogação do consentimento com fila já cheia: a fila esvazia sem enviar (Task 21).
4. Taxa de câmbio ausente: o custo aparece em dólar e "BRL indisponível", nunca zero (Task 24).
5. Link de acesso aberto em outro navegador ou depois de expirado: mensagem clara e retorno ao passo (Task 8).

---

## Fase 2 · Auditoria (`/impeccable`)

Regras comuns das Tasks 1 a 6: invocar a skill `impeccable` (modos `audit` e `critique`), comparar com o PNG e o HTML de `docs/design` da área (mapa em `docs/design/SCREENS.md`), rodar em 390×844 e 1280×800, e gravar `docs/superpowers/evidencias/S28/auditoria-<area>.md` com achados numerados, severidade (alta, média, baixa), arquivo afetado, correção sugerida e o ID do item de `MELHORIAS.md` ao qual o achado pertence (ou "novo"). Cobrir: hierarquia e copy, vazio/carregando/erro, WCAG AA (contraste, foco, leitor de tela, alvo de toque ≥ 44 px), responsividade, Core Web Vitals. **Aceite comum:** arquivo commitado; cada achado de severidade alta ou média mapeado a uma task deste plano ou a um item de `MELHORIAS.md`; nenhuma correção de código nesta fase (correções entram nas tasks de implementação).

- [x] **Task 1 · Família, mobile primeiro.** Rotas: `/`, `/escolas`, `/escolas/[inep]`, `/escolas/[inep]/[serie]`, `/entrar`, `/carrinho/*`, `/cotacao/*`, `/enviar-lista/*`, `/conta/*`. Telas de referência: App01 a App24. Saída: `auditoria-familia.md`.
- [x] **Task 2 · Papelaria.** `/cadastrar-papelaria`, `/papelaria/*`, `/papelarias/[slug]`. Referência: Pap01 a Pap08. Saída: `auditoria-papelaria.md`. Semear via `scripts/e2e-s14-seed.sql` (usuário `s14a@listacerta.test`).
- [x] **Task 3 · Escola.** `/escola/*`, `/escolas/[inep]/reivindicar*`. Referência: Escola01 a Escola12. Saída: `auditoria-escola.md`. Semear via `pnpm seed:demo-claims`.
- [x] **Task 4 · Admin.** `/admin/*`. Referência: Admin01 a Admin16. Saída: `auditoria-admin.md`. Tabelas: leitura em 390 px (rolagem horizontal, cabeçalhos fixos), foco e contraste.
- [x] **Task 5 · B2B.** `/parceiros/*`, `/b2b/*`. Referência: B2B00 a B2B09. Saída: `auditoria-b2b.md`. Semear via `scripts/e2e-s24-seed.sql` e `e2e-s26-seed.sql`.
- [x] **Task 6 · Site.** `/`, `/como-funciona`, `/sobre`, `/termos`, `/privacidade`, `/l/[code]`, 403, 404. Referência: Landing, ComoFunciona, Sis01 a Sis07. Saída: `auditoria-site.md`. Commit único no fim das Tasks 1 a 6: `docs(s28): auditoria impeccable das seis áreas`.

## Fase 3 · Sistema (`/design-intelligence`)

- [x] **Task 7 · `DESIGN.md`.** Invocar `design-intelligence`. **Files:** Create `DESIGN.md` (raiz); Read `docs/brand/tokens.json`, `app/globals.css`, auditorias da Fase 2. Conteúdo obrigatório: tokens reais de `app/globals.css` (`--tinta`, `--papel`, `--verde-*`, sem prefixo `lc-`; cor, tipo, espaço, raio, sombra) copiados de `tokens.json` sem alteração; escala tipográfica; alvo de toque mínimo 44 px (48 px em ação primária mobile); componentes (botão primário, secundário, terciário, campo, seleção, tabela responsiva, cartão, selo, aviso, estado vazio, skeleton); padrão de formulário (rótulo visível, `inputmode`, `autocomplete`, erro com `role="alert"`); feedback (sucesso, erro, carregando); movimento (durações, easing, regras de `prefers-reduced-motion`); o que a marca proíbe (trocar logo, paleta, fonte). **Aceite:** `DESIGN.md` cita os quatro valores hexadecimais e a fonte exatos; cada componente aponta o arquivo real que o implementa; lista "divergências conhecidas" vinda das auditorias, cada uma com a task que a resolve. Teste: `tests/brand/design-md.test.ts` (novo) lê `DESIGN.md` e `docs/brand/tokens.json` e falha se algum hex de token divergir.

```ts
// tests/brand/design-md.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DESIGN.md", () => {
  const md = readFileSync("DESIGN.md", "utf8").toLowerCase();
  it.each(["#0f1b2d", "#f5f2ea", "#2fcb86", "#0b6b4a", "plus jakarta sans"])("cita %s", (v) => {
    expect(md).toContain(v);
  });
});
```

Passos: escrever o teste (falha, arquivo não existe) → `pnpm vitest run tests/brand/design-md.test.ts` (FAIL) → escrever `DESIGN.md` → rodar (PASS) → commit `docs(s28): DESIGN.md do projeto`.

## Fase 4 · Refinamento (`/tripled-ui`)

Regras comuns: invocar `tripled-ui` como fonte de blocos, adaptar aos tokens reais (`--tinta`, `--papel`, `--verde-*`) e ao `DESIGN.md`; CSS puro (sem Framer Motion nem outra biblioteca); toda animação dentro de `@media (prefers-reduced-motion: no-preference)` ou com `motion-reduce:`; nenhum número, depoimento ou logo de parceiro inventado.

- [x] **Task 8 · Landing e "Como funciona" (M10).** **Files:** Modify `components/site/Hero.tsx`, `HeroListCard.tsx`, `StepsSection.tsx`, `FeatureGrid.tsx`, `Section.tsx`, `app/(site)/page.tsx`, `app/(site)/como-funciona/page.tsx`, `app/globals.css`; Test `tests/site/landing-refine.test.tsx`. Entregas: frase de escopo do piloto junto à busca ("Piloto em Cuiabá, MT") (M06 depende); entrada suave dos blocos ao rolar só com CSS; cartão do hero com item marcando sozinho em loop curto (pausado com movimento reduzido). **Aceite:** teste de componente confirma a frase de escopo e que nenhum elemento animado existe sem a classe `motion-reduce:`; Lighthouse de `/` e `/como-funciona` continua ≥ 90 em desempenho e 100 em acessibilidade (`node scripts/s28-medir.mjs depois --only=inicio,como-funciona --skip=shots`). **Ajuste (S28-A):** remover os nomes de varejistas (Amazon, Kalunga) do `ChannelsStrip`, salvo parceria/fonte real no código (regra: nunca inventar parceria).
- [x] **Task 9 · Momentos-chave da família (M11).** **Files:** Modify `components/lists/*` (lista pronta com "Compartilhar no WhatsApp" em um toque, mensagem sem dado pessoal), `components/leads/*` (cotação enviada com próximo passo), `app/conta/page.tsx` e `components/students/*` (onboarding do primeiro acesso: adicionar aluno por apelido), estados vazios de `/conta/*`; Test `tests/family/key-moments.test.tsx`. **Aceite:** o link de compartilhamento usa `https://wa.me/?text=` com texto codificado que contém só nome da escola, série, ano e link; teste falha se o texto contiver apelido de aluno; cada tela nova com vazio, erro e sucesso; capturas antes e depois em `evidencias/S28/depois/`.

## Fase 5 · Implementação do top 15

Ordem por dependência. Cada task termina com gate, commit e push.

### Bloco A · Fluxo da família

- [x] **Task 10 · M03 Entrar sem perder o lugar.** **Files:** Modify `app/entrar/page.tsx`, `app/entrar/LoginForm.tsx`, `features/auth/actions.ts` (só retorno de estado), Create `app/entrar/LinkSent.tsx`; Test `tests/auth/LoginForm.test.tsx` (existe; acrescentar casos), `tests/auth/redirect.test.ts`. Entregas: subtítulo contextual conforme `next` (ex.: `next` começa com `/carrinho` → "Entre para montar o carrinho desta lista"); após envio, `LinkSent` com "Enviamos o link para <e-mail>. Abra o e-mail neste aparelho e toque no link", contador de 30 s para reenviar, botão "Trocar e-mail"; erro `codigo` com instrução de pedir novo link. **Aceite (testes):** (1) com `next=/carrinho/novo?lista=x` o título menciona carrinho; (2) depois de `status: "sent"` o texto contém o e-mail digitado e o botão de reenvio está desabilitado por 30 s (relógio falso); (3) "Trocar e-mail" volta ao formulário com o campo vazio; (4) `safeNextPath` continua recusando `//evil.test`. Rodar: `pnpm vitest run tests/auth`.
- [x] **Task 11 · M05 Sem preço, sem promessa vazia.** **Files:** Modify `app/carrinho/[id]/page.tsx`, `components/cart/*` (título e ordem), `app/escolas/[inep]/[serie]/page.tsx` (aviso antes do CTA); Test `tests/cart/no-price-copy.test.tsx`. Regra: título "Montamos N opções" usa a contagem de opções exibidas (hoje mostra 1 com 4 cartões); quando nenhuma opção tem preço de fonte, o cartão "Papelaria local / Pedir cotação a papelarias" vem primeiro e o texto diz "Ainda não temos preço de loja para esta lista. A papelaria informa o preço na cotação"; na lista publicada, uma linha antes do CTA: "Preços aparecem quando a loja ou a papelaria informa". **Aceite:** teste renderiza o carrinho com 4 opções (3 indisponíveis) e confirma título com 4, cotação primeiro e nenhuma ocorrência de valor monetário inventado; nenhuma alteração em `features/cart/*` de cálculo (diff só de texto e ordem).
- [x] **Task 12 · M04 Reduzir foto antes do envio.** **Files:** Create `features/submissions/image-reduction.ts` (puro), `features/submissions/image-reduction-browser.ts` (canvas); Modify `app/enviar-lista/SubmitForm.tsx`, `app/escola/listas/nova/*` (mesmo formulário, se aplicável); Test `tests/submissions/image-reduction.test.ts`.

```ts
// features/submissions/image-reduction.ts
import { MAX_UPLOAD_BYTES } from "./constants";

export const TARGET_BYTES = Math.floor(MAX_UPLOAD_BYTES * 0.9);
export const SIDE_STEPS = [2600, 2000, 1600] as const;
export const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55] as const;

export type Encoder = (maxSide: number, quality: number) => Promise<Blob>;
export type Reduction = { ok: true; blob: Blob; maxSide: number; quality: number } | { ok: false };

/** Tenta lados e qualidades decrescentes até caber em `target`. Não é chamada se o original já cabe. */
export async function reduceToLimit(encode: Encoder, target: number = TARGET_BYTES): Promise<Reduction> {
  for (const maxSide of SIDE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const blob = await encode(maxSide, quality);
      if (blob.size > 0 && blob.size <= target) return { ok: true, blob, maxSide, quality };
    }
  }
  return { ok: false };
}
```

```ts
// tests/submissions/image-reduction.test.ts
import { describe, expect, it } from "vitest";
import { QUALITY_STEPS, SIDE_STEPS, TARGET_BYTES, reduceToLimit } from "@/features/submissions/image-reduction";

const blobOf = (n: number) => new Blob([new Uint8Array(n)]);

describe("reduceToLimit", () => {
  it("devolve o primeiro encode que cabe", async () => {
    const calls: Array<[number, number]> = [];
    const r = await reduceToLimit(async (s, q) => {
      calls.push([s, q]);
      return blobOf(q > 0.7 ? TARGET_BYTES + 1 : TARGET_BYTES - 1);
    });
    expect(r).toMatchObject({ ok: true, maxSide: SIDE_STEPS[0], quality: 0.65 });
    expect(calls).toHaveLength(3);
  });
  it("desiste quando nada cabe, sem laço infinito", async () => {
    let n = 0;
    const r = await reduceToLimit(async () => { n += 1; return blobOf(TARGET_BYTES + 1); });
    expect(r).toEqual({ ok: false });
    expect(n).toBe(SIDE_STEPS.length * QUALITY_STEPS.length);
  });
  it("ignora blob vazio (encode falho)", async () => {
    expect(await reduceToLimit(async () => blobOf(0))).toEqual({ ok: false });
  });
});
```

`image-reduction-browser.ts` exporta `reduceImageFile(file: File): Promise<File | null>`: usa `createImageBitmap`, escala para `maxSide`, `canvas.toBlob("image/jpeg", quality)`, devolve `null` se o navegador não decodifica (HEIC no Chrome). `SubmitForm` chama só para `image/*` acima de `TARGET_BYTES`; PDF acima do teto e imagem que não reduz mostram: "Este arquivo passa de 4 MB. Tire a foto de novo com menos qualidade ou envie um PDF menor". Passos: escrever teste (FAIL: módulo inexistente) → implementar → PASS → ligar ao formulário com teste de componente (`tests/submissions/SubmitForm.test.tsx`: arquivo de 6 MB simulado é substituído pelo reduzido; HEIC mostra a orientação). **Aceite:** testes acima verdes; E2E manual com foto de 8 MB no agent-browser envia com sucesso.
- [x] **Task 13 · M06 Rede de segurança na busca.** **Files:** Modify `components/site/Hero.tsx` (atalhos), `app/escolas/page.tsx`, `components/schools/SearchResults.tsx` (busca vazia), Create `features/schools/published-lists.ts` (consulta só leitura de escolas do município habilitado com lista publicada, até 6); Test `tests/schools/search-empty.test.tsx`, `tests/schools/published-lists.test.ts` (db). Regras: atalhos só com escolas reais com lista publicada, com selo "Demonstração" quando `is_demo`; sem nenhuma, a seção não aparece (nunca lista inventada). Busca sem resultado mostra três saídas: "Enviar a lista da escola" (`/enviar-lista`), "Ver escolas de Cuiabá" (`/escolas`), "Avisar quando a lista sair" (quando há escola). **Aceite:** teste com resultado vazio confirma as três ações e o texto; teste de consulta confirma que escola sem lista publicada nunca entra. **Ajuste (S28-A) incorpora M33:** campo de busca da home utilizável no celular (botão não espreme o campo) e menu do topo com indício de rolagem.
- [x] **Task 14 · M14 Passe de copy pt-BR.** **Files:** Modify `features/site/copy.ts`, `features/*/messages.ts`, componentes de estado; Create `docs/superpowers/evidencias/S28/vocabulario.md` (um termo por conceito: "lista oficial", "cópia sua", "lista candidata"; INEP sempre com explicação; "reivindicar" → "pedir para administrar"); Test: atualizar os testes de texto existentes e criar `tests/site/vocabulary.test.ts` que varre `features/**/messages.ts` e `features/site/copy.ts` por termos banidos (`lead`, `leads` visíveis ao usuário fora do painel B2B/papelaria, "candidatas" sem explicação). **Aceite:** teste de vocabulário verde; nenhuma mudança de regra (diff só em strings); 15 telas principais lidas e listadas no `vocabulario.md`.

### Bloco B · Papelaria e escola

- [x] **Task 15 · M12 Papelaria: ativação.** **Files:** Create `components/stationeries/ActivationChecklist.tsx`, `features/stationeries/activation.ts` (função pura `computeActivation({hasProfile, areasCount, catalogCount, leadsReceived})`); Modify `app/papelaria/page.tsx`, `app/papelaria/leads/(lista)/page.tsx` (vazio orientado), `components/leads/*` (ação principal do lead no mobile); Test `tests/stationeries/activation.test.ts`. **Aceite:** teste da função cobre 0, parcial e completo; checklist só mostra passos calculados de dado real e some quando concluído; lead mobile mostra "Responder no WhatsApp" acima da dobra (teste de componente). **Ajuste (S28-A):** inverter a hierarquia da lista de leads no mobile (ação primeiro; sem verde em "0 vendas").
- [x] **Task 16 · M13 Escola: próximo passo.** **Files:** Modify `components/claims/MySchoolsTable.tsx`, `components/claims/StatusPanel*` (ou equivalente), `features/claims/messages*`, Create `features/claims/next-step.ts` (`nextStep(status, hasList)` → `{title, body, cta}`); Test `tests/claims/next-step.test.ts`. Estados: `submitted`, `awaiting_verification`, `token_expired`, `insufficient_evidence`, `rejected`, `approved` (com e sem lista). **Aceite:** teste tabela cobre cada estado com título e CTA em português; nenhum prazo prometido.
- [ ] **Task 17 · M07 Skeletons e layout estável.** **Files:** Create `components/ui/Skeleton.tsx`; Modify `app/loading.tsx` (mantém como fallback), Create `app/escolas/[inep]/[serie]/loading.tsx`, `app/carrinho/[id]/loading.tsx`, `app/papelaria/loading.tsx`, `app/escola/loading.tsx`; Test `tests/a11y/skeleton.test.tsx`. Skeleton com `role="status"`, texto "Carregando…", altura reservada; `animate-pulse` com `motion-reduce:animate-none`. Cuidado com soft-404 (D-043): o `loading.tsx` novo não pode voltar a responder 200 para `notFound()`; rodar `bash scripts/e2e-soft-404.sh` no fim. **Aceite:** CLS < 0,1 nas páginas medidas; soft-404 continua 404.
- [ ] **Task 18 · M15 Componentes compartilhados.** **Files:** Create `components/ui/Button.tsx`, `components/ui/Field.tsx` (pequenos, conforme `DESIGN.md`); Modify duas telas por área para adotá-los (não migrar tudo); Test `tests/ui/button-field.test.tsx`. **Aceite:** `pnpm check:sizes` verde; auditoria das seis áreas sem divergência aberta de severidade alta; `DESIGN.md` aponta para os arquivos. **Ajuste (S28-A):** foco em Verde Fundo no `primaryButton` e no `SkipLink`; trocar `text-red-700` e hex de erro pelos tokens `erro-*`; borda de campo ≥ 3:1; confirmação destrutiva unificada; M34 (admin recolhível) se couber.
- [ ] **Task 19 · Variável `B2B_CAMPAIGN_TRACKING_SECRET`.** **Files:** Modify `lib/env.ts` (esquema Zod, obrigatória em produção, opcional local), `.env.example` (linha com comentário: segredo do rastreio de campanhas B2B, gerar com `openssl rand -hex 32`); ler `features/campaigns/tracking-service.ts` para o formato exigido; Test `tests/env.test.ts` (acrescentar). **Aceite:** teste falha se a variável estiver ausente em `NODE_ENV=production` sem o rastreio desligado; `.env.example` contém a chave; nenhum valor real commitado.

### Bloco C · Acessibilidade e desempenho nas demais áreas

- [ ] **Task 20 · M09 Acessibilidade fora das 9 páginas medidas.** **Files:** os apontados por `auditoria-*.md`; ampliar `PAGES` de `scripts/s28-medir.mjs` com `/cotacao/nova`, `/conta`, `/escola`, `/admin` (usuário admin semeado), `/b2b` e `/parceiros`. Correções de contraste, nomes acessíveis, alvos de toque e ordem de foco; teste `tests/a11y/*` por área corrigida. **Aceite:** axe sem violação séria ou crítica nas páginas novas; Lighthouse de acessibilidade ≥ 90. **Ajuste (S28-A), escopo explícito:** 39 `text-[11px]`, alvos < 44 px, `main`/`h1` ausentes, rolagem horizontal da D-07, `overflow-x-auto` nas tabelas de docs; o script de medição ganha checagens próprias (alvo de toque, h1, main, rolagem horizontal) cobrindo admin, B2B, papelaria e conta.
- [ ] **Task 21 · M08 Orçamento de desempenho.** **Files:** `app/layout.tsx` (pesos de fonte usados: conferir se 500/600/700/800 são todos necessários), `sentry.client.config.ts` e `instrumentation-client.ts` (carregamento adiado), `next.config.ts`. **Aceite:** Lighthouse desempenho ≥ 90 nas páginas medidas e LCP/TBT não pioram em relação a `antes/lighthouse.md` (tolerância de 5 pontos por variância); tabela de tamanho de JS por página em `depois/lighthouse.md`. Se já estiver ≥ 90 e não houver ganho claro, registrar Ruling "sem mudança" e não mexer.

### Bloco D · PostHog (M01, ADR-007)

- [ ] **Task 22 · Núcleo de eventos.** **Files:** Create `lib/analytics/schema.ts`, `lib/analytics/sanitize.ts`, `lib/analytics/config.ts`; Test `tests/analytics/sanitize.test.ts`.

```ts
// lib/analytics/sanitize.ts (núcleo; schema.ts exporta EVENTS: Record<nome, ZodObject> e COMMON)
import { z } from "zod";
import { COMMON, EVENTS, type EventName } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INEP = /^\d{8}$/;
const IBGE = /^\d{7}$/;
const PII = [/[^\s@]+@[^\s@]+\.[^\s@]+/, /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/, /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/];

const safeIdentifier = (v: string) => UUID.test(v) || INEP.test(v) || IBGE.test(v);
export const looksLikePersonalData = (v: unknown): boolean =>
  typeof v === "string" && !safeIdentifier(v) && PII.some((r) => r.test(v));

export type Built = { ok: true; properties: Record<string, unknown> } | { ok: false; reason: "schema" | "pii" };

/** Descarta chave fora do esquema; se o restante não valida ou parece dado pessoal, descarta o evento inteiro. */
export function buildEvent(name: EventName, props: Record<string, unknown>, common: Record<string, unknown>): Built {
  const schema = EVENTS[name];
  const own = Object.fromEntries(Object.entries(props).filter(([k]) => k in schema.shape));
  const cm = Object.fromEntries(Object.entries(common).filter(([k]) => k in COMMON.shape));
  const parsed = z.object({ ...COMMON.shape, ...schema.shape }).strict().safeParse({ ...cm, ...own });
  if (!parsed.success) return { ok: false, reason: "schema" };
  if (Object.values(parsed.data).some(looksLikePersonalData)) return { ok: false, reason: "pii" };
  return { ok: true, properties: parsed.data };
}
```

Testes obrigatórios: propriedade extra é descartada e o evento passa; e-mail, telefone `(65) 99999-1234` e CPF em qualquer campo string derrubam o evento com `reason: "pii"`; uuid, INEP de 8 dígitos e IBGE de 7 dígitos passam; `query_length` só aceita inteiro; `school_searched` com `query` (texto) tem a chave descartada. `config.ts`: `getAnalyticsConfig(env)` devolve `{ enabled: false }` sem `NEXT_PUBLIC_POSTHOG_KEY`. `schema.ts` implementa os 13 eventos de `tracking-plan.md` e `login_started`, `login_completed`, `list_shared`, `cart_options_viewed`, `stationery_onboarding_step`, todos com `.strict()`, sem campo de texto livre. **Aceite:** `pnpm vitest run tests/analytics` verde; cada evento do `tracking-plan.md` tem um caso de teste.
- [ ] **Task 23 · Cliente, consentimento e proxy.** **Files:** Create `lib/analytics/client.ts` (fila em memória, `fetch` para `/ingest/i/v0/e/`, `sendBeacon` no `pagehide`, lote de até 10 ou 5 s), `lib/analytics/consent.ts` (`getConsent(): "unset" | "granted" | "denied"`, `grant()`, `deny()`, `revoke()`; `localStorage` só depois da escolha, com try/catch), `components/analytics/AnalyticsProvider.tsx` (`"use client"`, carrega adiado com `requestIdleCallback`), `components/analytics/ConsentNotice.tsx` (aviso discreto, dois botões de 48 px, `role="region"`); Modify `app/layout.tsx` (provider só se `enabled`), `next.config.ts` (`rewrites` de `/ingest/:path*` para `NEXT_PUBLIC_POSTHOG_HOST` só se a chave existir; não repassa cookie); Test `tests/analytics/client.test.ts`, `tests/analytics/consent.test.tsx`. Regras: antes da escolha, `distinct_id` em memória, `$process_person_profile: false`, sem `identify`; `deny` e `revoke` esvaziam a fila sem enviar e param o envio; `grant` persiste o id em `localStorage` e libera `identify(uuid)`; `identify` recebe apenas uuid. **Aceite (testes):** sem chave, nenhum `fetch` e nenhum nó no DOM; com chave e consentimento negado, zero requisições e fila vazia; antes da escolha, o corpo enviado não contém `identify` nem acesso a `localStorage` (espionado); depois do `grant`, `identify` usa o uuid e nunca e-mail ou telefone.
- [ ] **Task 24 · Pontos de chamada e eventos de servidor.** **Files:** Create `lib/analytics/server.ts` (`server-only`; `captureServer(name, props)` com `fetch` e `after()`, nunca lança), `lib/analytics/track.ts` (helper de cliente `track(name, props)`); Modify pontos do funil: landing, busca, escola, lista, compra (`ir-para` e cotação), envio de lista, login, cadastro de papelaria; Server Actions/serviços para `ocr_completed`, `list_auto_approved`, `list_published`, `lead_received`, `lead_converted`, `catalog_activated`; Update `docs/tracking-plan.md` (status "aprovada", novos eventos, leitura do consentimento); Test `tests/analytics/call-sites.test.ts`. O teste varre `app/`, `features/`, `components/` por `track(` e `captureServer(` e confirma que o primeiro argumento é nome de `EVENTS` e que nenhuma chamada passa objeto com chave `email`, `phone`, `telefone`, `nome`, `name`, `apelido`, `nickname`, `cpf`, `text` ou `query`. **Aceite:** teste de contrato verde; falha de PostHog (host indisponível simulado) não altera o resultado de nenhuma Server Action; E2E: com receptor local (`scripts/e2e-webhook-receiver.mjs` adaptado) e chave falsa, nada persistente antes do aceite e todos os eventos do funil da família chegam depois.
- [ ] **Task 25 · Documentação de privacidade e Aguardando humano.** **Files:** Modify `app/(site)/privacidade/page.tsx` (operador PostHog como placeholder a validar juridicamente, sem afirmar conformidade), `docs/superpowers/PROGRESS.md` (seção "Aguardando humano": criar projetos PostHog de staging e produção e cadastrar `NEXT_PUBLIC_POSTHOG_KEY` e `NEXT_PUBLIC_POSTHOG_HOST` na Vercel). **Aceite:** texto sem "em conformidade com a LGPD"; teste `tests/site/legal.test.tsx` (existente) atualizado.

### Bloco E · Custo de IA e consultas lentas (M02)

- [ ] **Task 26 · Migration `0800` e teste de banco.** **Files:** Create `supabase/migrations/0800_s28_ai_usage.sql`, `tests/db/ai-usage.test.ts`. A migration é aditiva: colunas `prompt_tokens`, `completion_tokens`, `total_tokens` (int, `>= 0`, nulas) e `provider_cost_usd_micros` (bigint, `>= 0`, nula) em `ai_decisions` (o gatilho de imutabilidade só bloqueia `update`/`delete`; `alter table add column` é permitido); coluna `usd_brl_rate numeric(8,4)` nula, `check (usd_brl_rate is null or usd_brl_rate > 0)`, em `ai_settings`; recriar o RPC de gravação de decisão (o usado por `supabase/functions/_shared/ai/rpc.ts`) com os quatro parâmetros novos opcionais, mantendo `search_path = ''`, privilégios e assinatura antiga compatível; view `public.ai_cost_per_entity` (`security_invoker = true`) somando por `entity_id`, com `count(*) filter (where provider_cost_usd_micros is null)` como `unknown_cost_rows`; RLS: a view herda a política de admin de `ai_decisions`; nada novo para `anon` nem `authenticated`. **Passos:** teste de banco primeiro (colunas existem; `authenticated` não-admin não lê a view; inserção sem uso continua válida; `update` continua bloqueado) → `pgrep -f "vitest.mjs run -c vitest.db.config.ts"` vazio → migration → `pnpm db:reset && pnpm test:db`. **Aceite:** `pnpm test:db` verde; migration do zero aplicável.
- [ ] **Task 27 · Captura do uso e cálculo de custo.** **Files:** Create `features/ai-settings/cost.ts`; Modify `supabase/functions/_shared/ai/router.ts` e `router-record.ts` (repassar `usage`), `recorder.ts` e `rpc.ts` (novos parâmetros), `supabase/functions/_shared/ai/openrouter.ts` (enviar `usage: { include: true }` e ler o custo devolvido, se houver; sem nome de modelo no código), `lib/ai/providers/openrouter.ts` (idem); Test `tests/ai/cost.test.ts`, testes existentes do roteador atualizados.

```ts
// features/ai-settings/cost.ts
/** micros de dólar → centavos de real; sem taxa configurada, nunca inventa: devolve null. */
export function usdMicrosToBrlCents(micros: number, rate: number | null): number | null {
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round((micros * rate) / 10_000);
}

export type CostRow = { provider_cost_usd_micros: number | null };
export function summarizeListCost(rows: CostRow[], rate: number | null) {
  const known = rows.filter((r) => r.provider_cost_usd_micros !== null);
  const usdMicros = known.reduce((s, r) => s + (r.provider_cost_usd_micros as number), 0);
  return {
    usdMicros,
    unknownRows: rows.length - known.length,
    brlCents: rows.length - known.length > 0 ? null : usdMicrosToBrlCents(usdMicros, rate),
  };
}
```

Testes: `usdMicrosToBrlCents(1_000_000, 5)` = 500 (US$ 1,00 a 5,00 = R$ 5,00 = 500 centavos); taxa `null` ou `0` devolve `null`; `summarizeListCost` com uma linha sem custo devolve `brlCents: null` (custo parcial nunca aparece como total); roteador grava `usage` quando o provedor informa e grava nulo quando não. **Aceite:** testes verdes; `pnpm test` inteiro verde (roteador e worker Deno intactos: `pnpm test` cobre `tests/ai` e `tests/worker`).
- [ ] **Task 28 · Relatório de custo por lista.** **Files:** Create `scripts/s28-custo-ia.ts`, Modify `app/admin/ia/page.tsx` (bloco "Custo por lista": média, p95, máximo, linhas sem custo, taxa em uso ou "BRL indisponível"), `features/admin/*` (consulta à view), Test `tests/admin/ai-cost-panel.test.tsx`. O script processa N listas de demonstração pelo pipeline (provedor real só se `OPENROUTER_KEY` responder; caso contrário usa o provedor falso, marca o relatório "cálculo provado, custo real indisponível" e registra D-077). Saída em `docs/superpowers/evidencias/S28/depois/custo-ia.md` e uma linha no `PROGRESS.md`. **Aceite:** custo médio por lista < R$ 0,50 com dado real, ou registro explícito de "indisponível" com o motivo; nunca zero fictício.
- [ ] **Task 29 · Consultas lentas.** **Files:** Create `scripts/s28-consultas.ts` (usa `pg_stat_statements` do banco local; `create extension if not exists pg_stat_statements` só no local; roda carga: buscar escola, abrir lista, criar carrinho, listar leads da papelaria; lê top por tempo total e médio; `EXPLAIN (ANALYZE, BUFFERS)` das quatro consultas quentes), `supabase/migrations/0801_s28_query_fixes.sql` **somente se** alguma consulta passar do orçamento (p95 > 100 ms local ou Seq Scan sobre tabela grande sem justificativa; D-019 é exceção registrada). **Aceite:** `depois/consultas.md` commitado com tabela consulta, chamadas, média, p95, plano e veredito; se houver migration, teste em `tests/db` e `pnpm test:db` verde.

## Fase final · Medição "depois" e fechamento

- [ ] **Task 30 · Medir "depois", incluindo páginas logadas.** **Files:** Modify `scripts/s28-medir.mjs` se necessário (páginas novas da Task 20); Create `docs/superpowers/evidencias/S28/depois/*` e `docs/superpowers/evidencias/S28/comparacao.md`. Passos: `pnpm db:reset` (com `pgrep` vazio) → semear (`pnpm import:inep tests/fixtures/inep-demo.csv --demo && pnpm seed:demo-lists && docker exec -i supabase_db_listacerta-t2 psql -U postgres -At -v ON_ERROR_STOP=1 < scripts/e2e-s14-seed.sql`) → `pnpm build && pnpm start -p 3002` (com `.env.local` carregado) → criar um carrinho pela interface → `AXE_JS=... node scripts/s28-medir.mjs depois` (o script falha alto se `/papelaria` ou `/enviar-lista` redirecionarem para `/entrar`) → encerrar só o servidor da porta 3002. **Aceite:** `comparacao.md` com tabela antes × depois por página (as 4 notas, LCP, CLS, TBT e contagem axe por impacto); Lighthouse ≥ 90 em desempenho e acessibilidade nas 7 páginas do aceite (início, busca, lista, carrinho, login, painel da papelaria, landing) e axe sem sérias ou críticas; capturas 390×844 lado a lado dos momentos das Tasks 8, 9, 10, 11 e 15 a 17. **Ajuste (S28-A):** semear membro de escola aprovado para medir `/escola/*`.
- [ ] **Task 31 · E2E da fatia.** **Files:** Create `scripts/e2e-s28.sh` (usa `scripts/e2e-lib.sh`), `docs/superpowers/e2e/S28.md`. Cenários: família (busca vazia com saídas, login com retorno, carrinho sem preço, foto grande reduzida, compartilhar), papelaria (checklist), escola (próximo passo), PostHog (nada persistente antes do aceite; recusa para o envio). **Aceite:** roteiro executado com 0 falhas e capturas anexadas.
- [ ] **Task 32 · Revisão final e fechamento.** Revisão com Opus focada em UX e acessibilidade (revisão de segurança só se a fatia tocar RLS ou dados: a `0800` toca `ai_decisions` e `ai_settings`, então incluir a leitura da migration e do RPC). Atualizar `docs/superpowers/PROGRESS.md` (custo de IA por lista, estado da fatia, "Aguardando humano" da Task 25 e aplicação da `0800` no staging), `docs/superpowers/DEBT.md` (itens novos) e o ledger com os Rulings de adiamento de qualquer item do top 15 não concluído. Não abrir PR (o orquestrador abre). **Aceite:** `pnpm typecheck && pnpm lint && pnpm test && pnpm db:reset && pnpm test:db && pnpm build` verdes; top 15 implementado ou com Ruling de adiamento; gate de go-live da S20 atendido para a S28.

## Cobertura do top 15 pelas tasks

| Item | Task |
|---|---|
| M01 PostHog | 22, 23, 24, 25 |
| M02 Custo de IA e consultas | 26, 27, 28, 29 |
| M03 Login | 10 |
| M04 Foto | 12 |
| M05 Sem preço | 11 |
| M06 Busca | 13 (e frase de escopo na 8) |
| M07 Skeletons | 17 |
| M08 Desempenho | 21 |
| M09 Acessibilidade | 20 |
| M10 Landing e Como funciona | 8 |
| M11 Momentos-chave | 9 |
| M12 Papelaria | 15 |
| M13 Escola | 16 |
| M14 Copy | 14 |
| M15 DESIGN.md e componentes | 7, 18 |
