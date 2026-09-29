# Plano de tracking · ListaCerta

Status: **aprovada** (ADR-007, aceito pelo humano em 28/09/2026, plano gratuito; instrumentação na S28). Código em `lib/analytics/`, `components/analytics/` e `supabase/functions/_shared/analytics/`. **Desligada sem `NEXT_PUBLIC_POSTHOG_KEY`.**

Fonte da verdade do esquema: `supabase/functions/_shared/analytics/schema.ts` (um `zod` `.strict()` por evento; `tests/analytics/*` falham se um evento sair com propriedade fora do esquema ou com PII). Sem SDK: cliente mínimo próprio de `fetch` (Ruling da S28), sem autocaptura e sem replay no piloto.

## Consentimento (leitura vigente)

- **Nada sai do navegador antes do aceite** (`SEND_BEFORE_CONSENT = false`). Antes da escolha, os eventos ficam numa fila em memória (no máximo 50, descartável), sem cookie, sem `localStorage`, sem `identify`; só são liberados se o aceite vier na mesma página.
- Aceitar grava a escolha e o identificador anônimo em `localStorage`; recusar ou revogar descarta a fila, apaga o identificador e para o envio. O aviso é `components/analytics/ConsentNotice.tsx` (dois botões de 48 px).
- Eventos de **servidor** (fatos gravados no banco) não passam pelo navegador: saem com `distinct_id` de entidade ou aleatório e `$process_person_profile: false`, nunca ligados a uma pessoa nem ao comportamento no navegador.
- O navegador fala só com `/ingest` (Route Handler `app/ingest/[...path]`, destino fixo `NEXT_PUBLIC_POSTHOG_HOST`; só POST em `i/v0/e` e `batch`, corpo até 64 KB, repassa apenas `content-type`), com `credentials: "omit"` e `referrerPolicy: "no-referrer"`; `proxy.ts` deixa `/ingest` fora da sessão.

## Eventos acrescentados na S28

| Evento | Quando | Origem | Propriedades específicas |
|---|---|---|---|
| `login_started` | Pedido de link ou de login com Google | cliente | `method` (`magic_link`, `google`) |
| `login_completed` | Login concluído (`/auth/confirm`, `/auth/callback`) | servidor | `method` |
| `list_shared` | Compartilhar lista (WhatsApp, copiar link) | cliente | `channel`, `school_inep`, `grade_slug` |
| `cart_options_viewed` | Opções do carrinho vistas | cliente | `options_count` |
| `stationery_onboarding_step` | Passo de credenciamento visto | cliente | `step` (`register`, `catalog`, `areas`, `first_lead`), `status` (`viewed`, `completed`) |

## Divergências do plano original (Rulings da S28)

- `purchase_clicked` sai do **servidor** (`/ir-para/.../go`, criação do lead e abertura do WhatsApp): o clique termina em redirect e o servidor é o único ponto que sempre o vê. Não se liga ao visitante do navegador.
- `lead_received` sai do serviço de leads; `billing_source` só vai quando o livro-razão devolve o tipo (senão a propriedade é omitida).
- `list_published` não leva `school_inep` (o contexto de publicação não o traz); `list_viewed` não leva `has_alerts` (a lista pública não expõe alertas); `list_upload_started` não leva `source` (o papel define no servidor).
- **Adiados:** `lead_converted` e `catalog_activated` nascem de transições SQL (2 de 3 sinais; aprovação da papelaria) sem ponto único no Node; emitir só parte delas falsearia o funil. Esquema e contrato prontos; emissão correta por outbox ou varredor (dívida registrada).


## Regras (valem para todos os eventos)

- Nome em `snake_case`, verbo no particípio (`list_viewed`, `lead_received`).
- **Sem PII.** Proibido: nome, e-mail, telefone, CPF, endereço, IP, texto livre, apelido ou série de estudante, nome de responsável, conteúdo de lista enviada, código completo de pedido. Escola, série e cidade só por identificador público (INEP, slug da série, código IBGE).
- Propriedades validadas por esquema antes do envio; propriedade fora do esquema é descartada, nunca enviada.
- Toda chamada recebe as **propriedades comuns** abaixo.
- `distinct_id`: anônimo até o `identify`; depois, **o uuid do perfil**. O `identify` acontece no login e no envio com telefone, mas o telefone e o e-mail nunca são enviados.
- Antes do consentimento: modo em memória, sem cookie, sem `localStorage`, sem replay.
- Eventos marcados como **servidor** nascem de fatos gravados no banco (Supabase é a fonte de verdade) e são enviados pelo servidor, não pelo navegador.

### Propriedades comuns

| Propriedade | Tipo | Valores / exemplo | Observação |
|---|---|---|---|
| `is_internal` | boolean | `true`/`false` | Equipe, domínios de teste (`@listacerta.test`, `.invalid`), E2E e ambientes não produtivos |
| `app_env` | string | `production`, `preview`, `staging`, `local` | Também separa projetos PostHog |
| `is_demo` | boolean | | Conteúdo de demonstração (selo "Demonstração") |
| `role` | string | `anonymous`, `parent`, `school_member`, `stationery_member`, `admin` | Papel, nunca a pessoa |
| `municipality_ibge` | string | `5103403` | Quando o contexto tiver cidade |
| `device_class` | string | `mobile`, `tablet`, `desktop` | Derivado do viewport, sem UA completo |

## Funil 1 · Família

| Evento | Quando | Origem | Propriedades específicas |
|---|---|---|---|
| `landing_viewed` | Abertura da landing ou de página de entrada pública | cliente | `path`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` (só os `utm_*`, sem outros parâmetros de URL), `referrer_domain` (só o domínio) |
| `school_searched` | Busca de escola executada | cliente | `query_length` (número de caracteres, nunca o texto), `results_count`, `has_filters` |
| `school_viewed` | Página pública da escola aberta | cliente | `school_inep`, `verification_status` |
| `list_viewed` | Lista pública de uma série aberta | cliente | `school_inep`, `grade_slug`, `school_year`, `list_version_id`, `items_count`, `has_alerts` |
| `purchase_clicked` | Clique em comprar/cotar a partir da lista | servidor (ver Divergências) | `canal` (`marketplace`, `papelaria_whatsapp`, `papelaria_cotacao`, `carrinho`), `list_version_id`, `school_inep`, `grade_slug`, `retailer_slug` (quando houver) |

Funil: `landing_viewed` → `school_searched` → `school_viewed` → `list_viewed` → `purchase_clicked`, quebrado por `utm_source` e `canal`.

## Funil 2 · Envio de lista

| Evento | Quando | Origem | Propriedades específicas |
|---|---|---|---|
| `list_upload_started` | Envio de arquivo iniciado (escola ou família) | cliente | `source` (`school`, `parent`), `mime_type`, `size_bucket` (`<1MB`, `1-5MB`, `>5MB`), `has_school` |
| `ocr_completed` | Leitura do arquivo concluída (inline ou pelo worker) | servidor | `duracao_ms`, `fila` (`inline`, `async`), `status` (`accepted`, `low_confidence`, `failed`), `items_count`, `model_route` (`cheap`, `strong`, `vision`, sem nome de modelo), `attempts` |
| `list_auto_approved` | Motor de publicação decide `auto_publish` | servidor | `overall_score_bucket`, `rules_version` |
| `list_published` | Nova versão publicada (automática ou humana) | servidor | `school_inep`, `grade_slug`, `school_year`, `origin` (`auto`, `human`), `is_first_version` |

Métricas: tempo de `list_upload_started` até `ocr_completed` (p50/p95 por `fila`), taxa `list_auto_approved / ocr_completed`, tempo até `list_published`.

## Funil 3 · Papelaria

| Evento | Quando | Origem | Propriedades específicas |
|---|---|---|---|
| `stationery_registered` | Cadastro de papelaria enviado | cliente + servidor | `municipality_ibge`, `offers_pickup`, `offers_delivery` |
| `catalog_activated` | Papelaria aprovada e com catálogo ativo pela primeira vez | servidor | `catalog_items_count`, `days_since_registered` |
| `lead_received` | Lead entregue à papelaria (após cobrança, S21) | servidor | `billing_source` (`free_lead`, `pass_lead`, `lead_debit`), `items_count_bucket`, `school_inep` (quando houver lista oficial) |
| `lead_converted` | Lead atinge 2 de 3 sinais (S22) | servidor | `signals` (lista de códigos: `stationery`, `parent`, `pix_platform`), `hours_to_convert` |

Funil: `stationery_registered` → `catalog_activated` → `lead_received` → `lead_converted`, por `municipality_ibge`.

## Identificação

| Momento | Ação | Identificador |
|---|---|---|
| Login (link mágico ou OAuth) concluído | `identify` | uuid do perfil |
| Envio com telefone (lead) concluído | `identify` | uuid do perfil (o telefone não é enviado) |
| Logout ou revogação do consentimento | `reset` (e `opt_out_capturing` na revogação) | — |

## Fora do escopo

Métricas financeiras (saldo, comissão, repasse, faturamento B2B) continuam só no banco; o PostHog não recebe valores em dinheiro.
