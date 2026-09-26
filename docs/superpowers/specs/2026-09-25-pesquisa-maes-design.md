# Pesquisa com mães · Design Spec

- **Data:** 25/09/2026
- **Status:** aprovado pelo fundador (Aurimar Nogueira). Autoridade vinculante para o plano e a implementação.
- **Produto:** ListaCerta (repositório `listaescolar`, Next.js App Router + Supabase + Vercel, ADR-001).

## 1. Objetivo e critérios de sucesso

**Objetivo principal:** gerar evidência de dor e de comportamento de compra da lista escolar para o pitch pré-seed.
**Objetivo secundário:** captar lista de espera para a temporada de janeiro de 2027.

**Público:** mães e responsáveis de Cuiabá e Várzea Grande, principalmente da rede privada. Acesso pelo celular, a partir de link em grupo de WhatsApp.

**Critérios de sucesso (medidos na página de resultados):**
- 100 respostas completas até 31/10/2026.
- Taxa de conclusão de pelo menos 60% (completas sobre iniciadas).
- Tempo mediano abaixo de 3 minutos.
- Pelo menos 40% das completas deixam contato.

**Princípio de pesquisa:** perguntar o que a pessoa fez na última volta às aulas (2026), não o que ela faria. A reação ao conceito vem só no fim.

## 2. Escopo

**Dentro:** rota pública `/pesquisa`, salvamento por pergunta, captura de lead com consentimento, compartilhamento via WhatsApp, rastreio de origem, página de resultados protegida por senha, exportação CSV, imagem Open Graph, testes.

**Fora (YAGNI):** login, anúncios e pixels, sorteio, autocomplete de escola pelo INEP, i18n, e-mail, painel administrativo geral.

## 3. Arquitetura

- Rotas dentro do app Next.js existente, isoladas em `app/pesquisa/**` e `app/api/pesquisa/**`. Nenhum arquivo fora desse escopo é alterado, exceto configuração compartilhada estritamente necessária.
- Se o repositório ainda não tiver o app Next.js, criar o mínimo necessário conforme ADR-001: App Router, TypeScript strict, Tailwind e Zod.
- O navegador nunca fala direto com o Supabase. Toda escrita e leitura passa por route handlers no servidor, usando `SUPABASE_SERVICE_ROLE_KEY`.
- RLS habilitado nas tabelas novas, sem nenhuma policy para `anon` ou `authenticated`. Só a service role acessa.
- Configuração das perguntas em um único arquivo tipado (`lib/pesquisa/perguntas.ts`), usado pela UI, pela validação Zod e pela página de resultados.
- Componentes de até 250 linhas. Migrations com `gen_random_uuid()`.

### Estrutura de arquivos sugerida

```
app/pesquisa/page.tsx                 # server component, lê ?g e ?ref, renderiza <Pesquisa/>
app/pesquisa/opengraph-image.tsx      # imagem OG 1200x630 via next/og
app/pesquisa/privacidade/page.tsx     # aviso de privacidade da pesquisa
app/pesquisa/resultados/page.tsx      # resultados (protegido)
app/pesquisa/resultados/login/page.tsx
app/api/pesquisa/resposta/route.ts    # POST upsert por pergunta
app/api/pesquisa/concluir/route.ts    # POST marca conclusão
app/api/pesquisa/lead/route.ts        # POST contato
app/api/pesquisa/login/route.ts       # POST senha -> cookie
app/api/pesquisa/export/route.ts      # GET CSV (?tipo=respostas|leads)
components/pesquisa/*                 # Pesquisa, Tela, OpcaoUnica, OpcaoMultipla, Progresso, TelaFinal
lib/pesquisa/perguntas.ts             # definição das telas
lib/pesquisa/schemas.ts               # Zod
lib/pesquisa/sessao.ts                # id de sessão no localStorage
lib/pesquisa/repositorio.ts           # acesso ao Supabase (server-only)
lib/pesquisa/auth-resultados.ts       # HMAC do cookie
lib/pesquisa/agregacao.ts             # contagens, funil, mediana
lib/pesquisa/telefone.ts              # normalização de WhatsApp BR
supabase/migrations/<timestamp>_pesquisa_maes.sql
```

## 4. Roteiro (telas e textos exatos)

Uma pergunta por tela. Escolha única avança sozinha após 250 ms. Múltipla escolha e texto têm botão "Continuar". Toda tela, exceto a de boas-vindas, tem "Voltar". Perguntas opcionais têm "Pular".

**Tela 0 · Boas-vindas**
- Título: "Como foi comprar a lista de material escolar este ano?"
- Texto: "São 12 perguntas rápidas, menos de 3 minutos. Suas respostas ajudam a criar um jeito mais fácil de resolver a lista da escola."
- Aviso: "Não pedimos nenhum dado do seu filho. Suas respostas são anônimas. [Como usamos seus dados](/pesquisa/privacidade)"
- Botão: "Começar"

| Tela | id | Pergunta | Tipo | Opções | Obrigatória |
|---|---|---|---|---|---|
| 1 | `cidade` | Em que cidade você mora? | única | Cuiabá · Várzea Grande · Outra cidade | sim |
| 2 | `filhos` | Quantos filhos você tem na escola? | única | 1 · 2 · 3 ou mais | sim |
| 3 | `rede` | A escola deles é particular ou pública? | única | Particular · Pública · Tenho nas duas | sim |
| 4 | `escola` + `etapas` | Qual a escola e em que etapa estão? | texto curto (máx. 120, opcional, placeholder "Nome da escola (opcional)") + múltipla | Educação infantil · Fundamental 1 (1º ao 5º) · Fundamental 2 (6º ao 9º) · Ensino médio | etapas sim, escola não |
| 5 | `recebimento` | Como a lista chegou para você em 2026? | única | Papel impresso · Foto ou PDF no WhatsApp · Site ou app da escola · Outro jeito | sim |
| 6 | `onde_comprou` | Onde você comprou o material? | múltipla | Papelaria do bairro · Loja grande (Kalunga e similares) · Internet · Supermercado · Kit vendido pela escola · Outro | sim |
| 7 | `gasto` | Quanto você gastou por filho, só com material? | única | Até R$ 200 · R$ 200 a 400 · R$ 400 a 600 · Mais de R$ 600 · Não lembro | sim |
| 8 | `tempo` | Quanto tempo levou para resolver tudo? | única | Até 1 hora · De 1 a 3 horas · Meio dia · Mais de um dia | sim |
| 9 | `comparou` | Você comparou preços antes de comprar? | única | Sim, em várias lojas · Um pouco · Não comparei | sim |
| 10 | `dores` | O que mais deu trabalho? Escolha até 2. | múltipla, máx. 2 | Preço alto · Achar todos os itens · Entender o item ou a marca pedida · Ir até a loja · Comprar item errado · Falta de tempo | sim |
| 11 | `usaria` + `canal` | Imagine escolher a escola e a série e receber o carrinho pronto, com o preço comparado entre lojas. Você usaria? | única + única condicional | usaria: Com certeza · Talvez · Não. canal (aparece se usaria ≠ Não, pergunta "E onde preferiria comprar?"): Internet, com entrega em casa · Papelaria do bairro, pelo WhatsApp · Tanto faz | usaria sim; canal sim quando exibido |
| 12 | `compra_ideal` + `pode_citar` | Como seria a compra perfeita da lista? | texto longo (máx. 500) + checkbox "Pode usar minha frase, sem meu nome" (desmarcado) | | não |

Valores salvos: slug estável em snake_case por opção (ex.: `cuiaba`, `varzea_grande`, `outra`). O rótulo fica só na config.

**Tela final · Lista de espera**
- Título: "Obrigada! Quer receber a lista da sua escola pronta em janeiro?"
- Campos: Nome (opcional, máx. 80), WhatsApp (obrigatório para enviar, máscara `(65) 99999-9999`), checkbox desmarcado: "Aceito receber mensagens da ListaCerta pelo WhatsApp sobre a lista escolar. Posso cancelar quando quiser."
- Botão "Quero receber", habilitado só com WhatsApp válido e checkbox marcado. Link "Agora não" pula o cadastro.
- Após o envio ou o pulo: "Pronto! Ajude outra mãe a economizar tempo." e botão "Enviar para outra mãe". Esse botão abre `https://wa.me/?text=<mensagem codificada>` com a mensagem: "Estou respondendo uma pesquisa rápida sobre a compra da lista de material escolar. Leva 3 minutos: <URL>/pesquisa?ref=<session_id>&g=<g atual ou 'indicacao'>".

A conclusão (`/api/pesquisa/concluir`) é chamada ao sair da tela 12, antes da tela final.

## 5. Dados

### 5.1 Migration

```sql
create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique,
  survey_version text not null default 'maes-2026-09',
  answers jsonb not null default '{}'::jsonb,
  last_step smallint not null default 0 check (last_step between 0 and 12),
  source_group text check (char_length(source_group) <= 60),
  ref_session_id uuid,
  ip_hash text,
  user_agent text check (char_length(user_agent) <= 300),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index survey_responses_source_idx on public.survey_responses (source_group);
create index survey_responses_ip_recent_idx on public.survey_responses (ip_hash, started_at);

create table public.survey_leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.survey_responses(session_id) on delete cascade,
  name text check (char_length(name) <= 80),
  whatsapp_e164 text not null check (whatsapp_e164 ~ '^\+55[1-9][0-9]9?[0-9]{8}$'),
  consent_text text not null,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.survey_responses enable row level security;
alter table public.survey_leads enable row level security;
-- sem policies: apenas service_role acessa

create or replace function public.survey_upsert_answer(
  p_session_id uuid, p_step smallint, p_answers jsonb,
  p_source_group text, p_ref uuid, p_ip_hash text, p_user_agent text
) returns void language sql security definer set search_path = public as $$
  insert into survey_responses (session_id, answers, last_step, source_group, ref_session_id, ip_hash, user_agent)
  values (p_session_id, p_answers, p_step, p_source_group, p_ref, p_ip_hash, p_user_agent)
  on conflict (session_id) do update
    set answers = survey_responses.answers || excluded.answers,
        last_step = greatest(survey_responses.last_step, excluded.last_step),
        updated_at = now();
$$;
revoke all on function public.survey_upsert_answer from public, anon, authenticated;
```

A migration é só aditiva. É proibido alterar ou apagar objetos existentes.

### 5.2 Contratos de API

Todas as respostas são JSON. Erros usam `{ "error": "<codigo>" }`.

- `POST /api/pesquisa/resposta` com o corpo `{ session_id: uuid, step: 1..12, answers: { [id]: valor }, g?: string<=60, ref?: uuid, hp?: string }`.
  - Validação Zod usa a config. Só aceita ids da tela `step`, e os valores precisam estar entre os slugs permitidos, respeitando o máximo de itens da múltipla e o tamanho do texto.
  - `hp` preenchido (honeypot) retorna 200 e não grava nada.
  - Limite: mais de 30 sessões novas por `ip_hash` na última hora retorna 429. O `ip_hash` é SHA-256 de `IP_HASH_SALT + ip`, com IP vindo de `x-forwarded-for`.
  - Sucesso retorna `200 { ok: true }`. Payload inválido retorna 400.
- `POST /api/pesquisa/concluir` com `{ session_id }`. Define `completed_at = now()` se estiver nulo e `last_step >= 11`. Caso contrário, retorna 409.
- `POST /api/pesquisa/lead` com `{ session_id, name?, whatsapp, consent: true, hp? }`. Normaliza para E.164 +55, exigindo DDD válido e 10 ou 11 dígitos. Sem `consent === true`, retorna 400. Grava `consent_text` com o texto exato do checkbox. Sessão inexistente retorna 404. Lead duplicado atualiza o registro.
- `POST /api/pesquisa/login` com `{ senha }`. Compara em tempo constante com `PESQUISA_RESULTS_PASSWORD`. Se bater, grava o cookie `pesquisa_auth` (httpOnly, secure, sameSite lax, 7 dias, valor HMAC-SHA256 de `"resultados"` com a senha). Se não bater, retorna 401.
- `GET /api/pesquisa/export?tipo=respostas|leads` exige o cookie válido. Sem cookie, retorna 401. Gera CSV UTF-8 com BOM, uma coluna por id de pergunta (arrays unidos por `;`), mais `source_group`, `started_at`, `completed_at` e `last_step`. O CSV de leads contém nome, WhatsApp, consent_at e source_group.

### 5.3 Cliente

- `session_id` é gerado com `crypto.randomUUID()` e guardado em `localStorage` (`listacerta_pesquisa_session`), com a etapa atual e as respostas. Quem recarrega a página continua de onde parou. Se a sessão já foi concluída, o app mostra direto a tela final.
- O envio é otimista. A UI avança sem esperar a rede. Falhas vão para uma fila em memória com 3 tentativas e backoff de 1, 3 e 9 segundos. Um aviso discreto aparece só se as 3 falharem.
- "Pular" também envia a etapa, com `answers: {}`, para `last_step` avançar. O Zod aceita objeto vazio só em telas cujos campos são todos opcionais (tela 12).
- `g` e `ref` são lidos da URL na primeira visita e persistidos na sessão.

## 6. Experiência e marca

- Tokens: Tinta `#0F1B2D`, Papel `#F5F2EA`, Branco tonal `#FCFBF8`, Verde Certo `#2FCB86` (só sobre escuro), Verde Fundo `#0B6B4A` (ação sobre claro), Texto 2 `#3A4658`, Linha `#E6E2D8`, Campo `#ECE8DE`. Raio de card 24, botão 999 e campo 14.
- Fonte: Plus Jakarta Sans via `next/font/google`, com pesos 500, 600, 700 e 800. Títulos em 800.
- Wordmark no topo: "lista" em 500 e "certa" em 800, caixa baixa, letter-spacing -0.05em.
- Mobile first, entre 360 e 430 px. Alvos de toque de pelo menos 48 px e conteúdo com largura máxima de 480 px no desktop.
- Barra de progresso "N de 12". A opção selecionada ganha borda e fundo Verde Fundo com texto branco.
- Acessibilidade: opções como `radiogroup` e `checkbox` reais, foco visível, navegação por teclado, contraste AA e `aria-live` na troca de tela.
- Metadados: title "Pesquisa: a lista de material escolar | ListaCerta". A description é o texto da tela 0. A imagem OG 1200x630 mostra fundo Papel, wordmark e o título da tela 0.
- Sem pixels, analytics de terceiros ou cookies além do `localStorage` da sessão e do cookie de resultados.

## 7. Privacidade (`/pesquisa/privacidade`)

Página curta com:
- Finalidade: entender a experiência de compra da lista escolar e, se autorizado, avisar pelo WhatsApp quando a lista da escola estiver disponível.
- Controlador: ListaCerta (Aurimar Nogueira), com contato mazinhoww@gmail.com.
- Dados coletados: respostas anônimas, e nome e WhatsApp só quando informados.
- Crianças: nenhum dado de criança é coletado além da etapa escolar.
- Retenção: respostas por até 24 meses. Contato até o pedido de exclusão ou até 31/12/2027.
- Exclusão: basta escrever para o e-mail informado.
- Não afirmar conformidade legal total.

## 8. Resultados (`/pesquisa/resultados`)

Sem cookie válido, redireciona para `/pesquisa/resultados/login`.

Conteúdo:
- Cartões: iniciadas, completas, taxa de conclusão, tempo mediano (`completed_at - started_at` das completas), leads e taxa de lead sobre as completas.
- Funil: quantidade de sessões por `last_step`, de 0 a 12, em barras horizontais.
- Por pergunta: contagem e percentual de cada opção, sobre quem respondeu aquela pergunta.
- Por origem: iniciadas e completas por `source_group`.
- Frases: `compra_ideal` onde `pode_citar = true`, sem nenhum dado de contato.
- Botões de exportação CSV de respostas e de leads.
- A agregação é feita no servidor, em `lib/pesquisa/agregacao.ts`, como função pura e testável.

## 9. Variáveis de ambiente

| Nome | Origem |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_URL` | Reusar a existente no projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Reusar a existente; se faltar, obter via Supabase CLI ou MCP e cadastrar na Vercel |
| `PESQUISA_RESULTS_PASSWORD` | Gerar (24 caracteres aleatórios), cadastrar na Vercel e informar no relatório final |
| `IP_HASH_SALT` | Gerar (32 bytes em hex) e cadastrar na Vercel |
| `NEXT_PUBLIC_SITE_URL` | URL de produção da Vercel (ou domínio próprio, se configurado) |

Nunca commitar segredos. O `.env.local` fica no `.gitignore`.

## 10. Testes e critérios de aceite

**Unitários (Vitest):**
- Schemas: aceita slugs válidos e rejeita id de outra tela, valor desconhecido, mais de 2 dores e texto longo demais.
- Telefone: normaliza `(65) 99999-1234`, `65999991234` e `+55 65 99999-1234`. Rejeita DDD inválido e quantidade errada de dígitos.
- Agregação: contagens, percentuais, funil e mediana com fixtures.
- Auth: HMAC válido e inválido, e comparação em tempo constante.

**Integração (contra o Supabase):** upsert duplicado não cria duas linhas, faz merge das respostas e nunca reduz `last_step`. Concluir antes da etapa 11 retorna 409. Lead sem consentimento retorna 400. Honeypot não grava nada. Os dados de teste usam `source_group = 'e2e-teste'` e são apagados ao final, sempre filtrando por esse valor.

**Ponta a ponta com agent-browser, em viewport 390x844, contra o deploy de preview e depois o de produção:**
1. Fluxo completo com lead: as 12 telas, a tela final com WhatsApp e consentimento, e o botão de compartilhar gerando uma URL `wa.me` com `ref`. No banco, isso resulta em 1 linha completa e 1 lead.
2. Abandono: parar na tela 7, recarregar, confirmar que retoma na 7, e confirmar no banco que `last_step = 7`.
3. Opcionais: pular escola, frase e lead. A resposta fica completa e não gera lead.
4. Condicional: "Não" na tela 11 esconde o canal.
5. Validação: o botão de lead fica desabilitado com telefone inválido ou sem checkbox.
6. Resultados: senha errada é recusada, a certa mostra os números do teste, e os dois CSVs baixam.
7. Screenshots de todas as telas salvos em `docs/superpowers/evidencias/pesquisa/`.

**Definição de pronto:** lint, typecheck, testes unitários e de integração verdes. Os cenários de ponta a ponta 1 a 7 verdes em produção. Dados de teste apagados. Relatório final entregue.
