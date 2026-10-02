# Go-Live Express (2026-10-02)

Decisão autônoma (brainstorming sem perguntas, a pedido do humano). Fontes: SPEC, PLAN, PROGRESS, DEBT, MELHORIAS, ADR-003/006/007.

## Resultado esperado
Produção acessível na URL final, com login por código de 6 dígitos funcionando no navegador do WhatsApp, uma lista real, um carrinho real gerando links e uma cotação real chegando a uma papelaria pelo WhatsApp.

## Entra no ar
Busca de escola, lista oficial, carrinho com links de loja (sem tag), cotação com papelaria pelo WhatsApp, painel da papelaria (10 leads grátis), painel da escola, admin, site público, termos e privacidade.

## Entra desligado por feature flag (padrão seguro em produção)
| Recurso | Motivo | Para ligar |
|---|---|---|
| Cobrança Pix e passe pago | sem credencial Pix/Asaas de produção | credencial + flag |
| Tags de afiliado | sem contas de afiliado | credenciais; links saem sem tag |
| PostHog | sem chave | NEXT_PUBLIC_POSTHOG_KEY |
| Publicação automática por IA | só revisão humana | flag |
| Campanhas B2B pagas | dependem da cobrança | flag |

## Obrigatório antes de abrir
1. Login por código de 6 dígitos (D-163) + detecção de navegador embutido com "abrir no navegador".
2. RLS e segurança verdes (`pnpm test:db`, advisors do Supabase).
3. Nenhum dado de demonstração em produção (`is_demo = false` em tudo).
4. Backup ou banco vazio verificado antes de qualquer migration; smoke depois; rollback documentado.
5. `SITE_INDEXING=1` só com domínio final ativo.

## Dependência externa que bloqueia T4
O projeto Supabase de **produção não existe** (ADR-003) e o `ListaEscolar` é o staging. Criar projeto gasta dinheiro (proibido pela autorização). Fica na fila "Aguardando humano" do PROGRESS.md: criar o projeto e pôr `SUPABASE_PROD_DB_URL` e as chaves de produção no `.env.local` e na Vercel (Production). Até lá, tudo o mais fica pronto e o T4 retoma quando a fila for resolvida.

Ruling: Go-Live Express com cobrança, afiliados, PostHog, IA automática e campanhas pagas desligados por flag — só há credenciais para o núcleo gratuito — custo se errada: religar uma flag exige credencial e um deploy, sem migração.
