# 0001 · Sem ambiente de staging

Data: 24/09/2026

## Decisão
Um único projeto Supabase (`production`). Variáveis na Vercel só em Production e Preview. Dev local via Supabase CLI.

## Consequências
- Previews e E2E gravam no banco real. Dados de teste usam e-mail `+e2e@` e escola fictícia, com limpeza ao fim da suíte.
- Toda migration passa por `supabase db reset` local antes de ir para produção.
- Nenhum agente roda `supabase db push` ou migration remota sem aprovação humana.
