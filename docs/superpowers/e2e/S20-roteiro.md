# S20 · Roteiro E2E completo no staging

Executado no preview da Vercel apontando para o staging (Supabase `hojbnqkwzsicahzgshne`), com agent-browser, depois da S19 e da S28 mescladas. Complementa o `docs/GO-LIVE.md` (critério de pronto, item 4). O resultado de cada rodada vai para `docs/superpowers/e2e/S20-resultado.md` (PASS/FAIL por passo; capturas em `docs/superpowers/e2e/screenshots/`). Nenhum passo grava em produção.

Regras: dados de teste com e-mail `+e2e@` ou `e2e+<papel>@listacerta.invalid` (criado pela API admin), escola e listas de demonstração com `is_demo = true`, limpeza ao fim (`source_group = 'e2e-teste'` na pesquisa; nunca tocar `survey_*` real). O lead REAL (passo F) usa papelaria não-demo e o contato do próprio humano. Menores: só apelido e série.

## Pré-requisitos (dados que precisam existir no staging)

| Dado | Como criar pela UI | Como conferir |
|---|---|---|
| Migrations em dia (incl. `0606`/`0607` da S19) | orquestrador via MCP `apply_migration`, fora da UI | `list_migrations` sem pendência (`node scripts/prod-migrate.mjs --applied-file=...`) |
| Plano de cobrança publicado (D-102; pendente com o humano, ver "Aguardando humano" do PROGRESS) | admin em `/admin/planos`: 10 leads grátis, faixa R$ 5,00, passe R$ 1.500 (300 leads, 3x, nov a mar), pacotes R$ 50/100/250 | `/papelaria/creditos` não mostra `billing_unavailable` |
| Conta admin | humano: `update public.profiles set role = 'admin' where id = '<uuid>'` no SQL Editor | `/admin` abre |
| Escola de teste (Cuiabá) | `/admin/importacoes`: upload de `tests/fixtures/inep-demo.csv` como demonstração, ou escola já existente do staging | `/escolas` lista a escola com selo "Demonstração" |
| Escola reivindicada e conta de escola | conta de teste em `/escolas/<inep>/reivindicar`; admin aprova em `/admin/reivindicacoes` | `/escola` abre; perfil "Reivindicada" (cadastro INEP não é verificação) |
| Lista publicada | conta da escola em `/escola/listas/nova` ou pai em `/enviar-lista`; leitura pela IA (worker `ocr-worker-tick`); revisão em `/admin/revisao` até `published` | `/escolas/<inep>/<serie>` mostra os itens |
| Papelaria REAL não-demo | conta de teste em `/cadastrar-papelaria` (dados reais do humano: nome, bairro, contato dele); admin aprova em `/admin/papelarias` | `/papelarias/<slug>` sem selo "Demonstração"; `/papelaria` abre |
| Papelaria demo (fluxos sem custo) | `DEMO_RETAILERS=1` só em Preview/Development | selo "Demonstração" visível |
| Parceiro B2B aprovado | `/parceiros` cadastro; admin aprova em `/admin/parceiros` | `/b2b` abre; chave emitida em `/b2b/api` |
| Google OAuth ativo no staging e sessão do Chrome do humano logada em conta Google | humano | passo A2 |
| Bypass da proteção do preview (GO-LIVE etapa 1) | segredo em variável local | `curl` com bypass devolve 200 |

## A. Pai (família)

1. **A1 · link mágico.** `/entrar` com e-mail `+e2e@`. Sem Mailpit no staging: gerar o link por `admin.generateLink` com `type=email` no `verifyOtp` (D-077) ou usar caixa real do humano. Abrir em OUTRA sessão do agent-browser: chega a `/conta` logado (valida os templates `magic_link`).
2. **A2 · login com Google (Chrome do humano).** O agent-browser não tem conta Google: usar claude-in-chrome (`tabs_context_mcp`, `navigate` ao preview, `find`/`computer` no botão de Google, conta do humano já logada). Esperado: volta a `/conta`, `profiles.role = 'parent'`. Se a sessão do Chrome não estiver logada ou pedir 2FA: registrar em "Aguardando humano" e seguir.
3. **A3 · busca e lista.** `/escolas`, buscar a escola de teste, abrir `/escolas/<inep>/<serie>`: itens e origem; sem preço nem estoque inventado (sem fonte: "indisponível").
4. **A4 · envio de lista.** `/enviar-lista` com `tests/fixtures/claim-evidence-demo.pdf` ou foto de lista: consentimento, upload, leitura por IA (worker, cerca de 1 min), `/enviar-lista/<id>/revisar`, confirmar. Esperado: `human_review` (`auto_publish_enabled` = false).
5. **A5 · carrinho e cotação.** `/carrinho/novo` a partir da lista, comparar lojas, `/cotacao/nova`, `/cotacao/<code>`; `/ir-para/<cartId>/<retailer>` (selo de afiliado só se `MELI_AFFILIATE_ID`/`AMAZON_ASSOCIATE_TAG` existirem).
6. **A6 · área da família.** `/conta/alunos/novo` (apelido e série apenas), `/conta/carrinhos`, `/conta/listas-salvas`, `/conta/notificacoes`, `/conta/privacidade` (exportar dados; revogar consentimento).
7. **A7 · 403.** parent em `/admin`, `/escola` e `/papelaria`: `/403`.

## B. Escola

1. Conta de escola reivindicada em `/escola`: painel; `/escola/listas/nova` envia lista da própria escola; enviar para outra escola é recusado (D-002).
2. Reivindicação: `/escolas/<inep>/reivindicar` (conta nova), aprovação em `/admin/reivindicacoes/<id>`, perfil "Reivindicada".

## C. Admin

`/admin` (painel); `/admin/importacoes` (upload do CSV de teste, relatório de erros, reimportar o mesmo arquivo é idempotente); `/admin/revisao` e `/admin/revisao/<id>` (aprovar e rejeitar); `/admin/reivindicacoes`; `/admin/papelarias`; `/admin/planos`; `/admin/repasses`; `/admin/inadimplencia`; `/admin/contestacoes`; `/admin/denuncias`; `/admin/ia` (`auto_publish_enabled` continua false); `/admin/auditoria` (filtros; eventos dos passos anteriores); `/admin/parceiros`; `/admin/campanhas`; `/admin/eventos`; `/admin/listas/<id>` (arquivar a lista de teste).

## D. Papelaria

Conta da papelaria não-demo: `/papelaria` (painel), `/papelaria/catalogo`, `/papelaria/areas`, `/papelaria/leads` e `/papelaria/leads/<code>` (enviar orçamento), `/papelaria/desempenho`, `/papelaria/creditos` (passe, pacotes, faturas; Pix: com o PSP configurado gerar cobrança de teste; sem ele deve mostrar "Pagamento via Pix indisponível"), `/papelaria/creditos/faturas/<id>`.

## E. B2B

`/parceiros` (cadastro); `/b2b` (painel); `/b2b/api` (emitir chave); `curl -H "x-listacerta-key: ..." https://<preview>/v1/schools` = 200 e sem chave = 401; `/v1/openapi.json`; `/b2b/widget` (incorporar o widget; `/api/widget/*`); `/b2b/webhooks` (receptor de teste `scripts/e2e-webhook-receiver.mjs` exposto por túnel do humano; assinatura conferida); `/b2b/campanhas`; `/b2b/insights`; `/b2b/faturamento`; `/b2b/docs`; `/parceiros/docs`; `/parceiros/termos`. Rate limit: rajada em `/v1/*` retorna 429 quando a regra do Firewall (GO-LIVE etapa 7) estiver publicada.

## F. Lead REAL de ponta a ponta (papelaria não-demo)

Depende do plano de cobrança publicado (D-102). Sem plano, o esperado é `billing_unavailable` e o passo fica em "Aguardando humano" (não é falha do produto).
1. Pai (A1) monta carrinho com a lista publicada da escola de teste e pede orçamento à papelaria real de teste (`/cotacao/nova`), com nome e telefone do próprio humano; nenhum dado de menor.
2. Papelaria: o lead aparece em `/papelaria/leads` (dentro dos 10 leads grátis); abrir `/papelaria/leads/<code>` e enviar orçamento com valores de teste.
3. Pai recebe o orçamento em `/cotacao/<code>` e em `/conta/notificacoes`; e-mail e Push só se as credenciais existirem.
4. Conversão: marcar pedido concluído; conferir atribuição e, no admin, `/admin/eventos` e `/admin/repasses`; abrir e fechar uma contestação em `/admin/contestacoes`.
5. Cobrança: consumir os leads grátis até o próximo lead ser cobrado a R$ 5,00 (ou comprar o pacote de R$ 50 com Pix de teste do humano, se o PSP estiver configurado); conferir `/papelaria/creditos/faturas/<id>` e `/admin/inadimplencia`.
6. Auditoria: `/admin/auditoria` mostra a cadeia do lead sem dado pessoal em claro além do permitido.
7. Limpeza: lead de teste identificável como teste; papelaria de teste suspensa ou arquivada pelo admin ao fim; nada de `delete` em `audit_log` (imutável).

## G. Transversais

- Preview protegido: sem bypass, 401; com bypass, 200 (GO-LIVE etapa 1).
- `X-Robots-Tag: noindex` em `/`, `/sobre`, `/robots.txt`, `/escolas` (staging nunca indexa).
- Crons: cada `/api/cron/*` com `Authorization: Bearer $CRON_SECRET` responde 200 e sem o cabeçalho 401/503.
- Pesquisa: `/pesquisa` responde; nenhuma linha real de `survey_*` alterada; linhas de teste com `source_group = 'e2e-teste'` apagadas ao fim.
- Sentry: erro provocado pelo `health-check` da S19 chega ao projeto sem dado pessoal.
- PostHog (S28): antes do aceite de consentimento nenhuma requisição a `/ingest`; depois, eventos sem PII (só se `NEXT_PUBLIC_POSTHOG_KEY` estiver definida no preview).

## Critério de aprovação

Todos os passos A a G em PASS, exceto os bloqueados por credencial ou ação do humano, cada um registrado em "Aguardando humano" com o passo exato. Falha real: abrir item no `DEBT.md` (alta se afetar dado, segurança ou go-live) antes do go-live.
