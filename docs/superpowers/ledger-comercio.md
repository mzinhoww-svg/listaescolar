# Ledger da trilha comercio (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`. O orquestrador consolida em ledger.md na S11.


## S12 · Task 1 (migration 0301)
- Ruling: `affiliate_clicks` sem update/delete para o usuário (só select/insert; insert exige carrinho próprio e `profile_id = auth.uid()`) — cliques são registro imutável, cada clique conta — custo se errada: baixo (liberar update por política nova).
- Ruling: `retailers.search_url_template` do Mercado Livre usa host `lista.mercadolivre.com.br` (busca oficial) com `base_url` `www.mercadolivre.com.br`; o banco exige apenas https e `{query}`, e o teste confere o domínio registrável — custo se errada: baixo (ajustar seed).
- Ruling: `price_snapshots.currency` restrito a `BRL` e `product_url`/`target_url` restritos a https por check — sem moeda ou esquema inesperado — custo se errada: baixo (relaxar check).
