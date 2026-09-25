# Ledger da trilha comercio (Rulings)

Formato: `Ruling: <decisão> — <motivo> — <custo se estiver errada>`. O orquestrador consolida em ledger.md na S11.


## S12 · Task 1 (migration 0301)
- Ruling: `affiliate_clicks` sem update/delete para o usuário (só select/insert; insert exige carrinho próprio e `profile_id = auth.uid()`) — cliques são registro imutável, cada clique conta — custo se errada: baixo (liberar update por política nova).
- Ruling: `retailers.search_url_template` do Mercado Livre usa host `lista.mercadolivre.com.br` (busca oficial) com `base_url` `www.mercadolivre.com.br`; o banco exige apenas https e `{query}`, e o teste confere o domínio registrável — custo se errada: baixo (ajustar seed).
- Ruling: `price_snapshots.currency` restrito a `BRL` e `product_url`/`target_url` restritos a https por check — sem moeda ou esquema inesperado — custo se errada: baixo (relaxar check).
- Ruling: endurecimento da 0301 após revisão: template exige `/`, `?` ou `#` antes de `{query}` e `{query}` fora do host; clique só para varejista ativo; snapshot sem data futura (>5 min) e `source='demo'` ⇔ `is_demo`; auditoria (`audit_row_change`) em retailers e price_snapshots; `options_snapshot` < 64KB — custo se errada: baixo (relaxar check/política).
- Ruling: a UI de admin nunca renderiza `affiliate_clicks.target_url` como link (só texto): o valor vem de servidor mas é dado de log e não deve virar destino clicável — custo se errada: médio (XSS/redirect a partir de log).

## S12 · Task 2 (motor, provedores, afiliados)
- Ruling: `balanced` = 500·preço + 200·lojas + 200·cobertura + 100·prazo (permil; razões escaladas a 1e6, preço com BigInt), calculado só entre combinações de lojas que cobrem o máximo de itens cotados e em que toda loja é usada; prazo só entra se alguma combinação tem `deliveryDays` da fonte em todas as linhas (as sem prazo pontuam 0 nesse termo), senão o termo sai; desempate: score, menor total, menos lojas, ordem alfabética — nunca oferecer menos itens para baratear, e cobertura fica constante entre candidatas (peso mantido por fidelidade ao spec) — custo se errada: baixo (constantes `BALANCED_WEIGHTS`).
- Ruling: validade de preço 24 h (`DEFAULT_STALE_AFTER_MS`, configurável); data no futuro além de 5 min é tratada como inconfiável e excluída junto com as velhas (`staleExcluded`); cotação sem origem, data inválida, preço não inteiro/≤0 ou `inStock=false` é descartada em silêncio — custo se errada: baixo.
- Ruling: `fewest_stores`/`balanced` enumeram subconjuntos de lojas (2^n), limitados às 12 lojas que mais cobrem itens (`MAX_SUBSET_RETAILERS`); hoje são 4 — custo se errada: baixo.
- Ruling: `local_stationery` escolhe a papelaria (id `local:<uuid>`) com mais itens cobertos e menor total; sem cotação (ou só velha) → `unavailable/no_local_quote` — custo se errada: baixo.
- Ruling: demo só com `DEMO_RETAILERS=1` e `VERCEL_ENV != production` (não NODE_ENV, porque `next start` local roda com production e o E2E precisa do demo); preços demo são fictícios, determinísticos, `is_demo`, origem `demo` — custo se errada: baixo; risco se `VERCEL_ENV` faltar em produção fora da Vercel (documentar no deploy).
- Ruling: destino do redirect valida https, ausência de credenciais, `{query}` único e fora do host, host final igual ao do template e dentro do domínio do `base_url`; query sanitizada (controles, NFC, espaços), truncada em 120 code points e `encodeURIComponent` — custo se errada: baixo.
- Ruling: parâmetros de afiliado: Amazon `tag=`; Mercado Livre `matt_tool`+`matt_word` (suposição a confirmar com o ID real do programa); ID só vale com `[A-Za-z0-9_.-]{1,64}`, senão sem selo — custo se errada: baixo (trocar nome do parâmetro em `affiliate.ts`).
- Ruling: `SnapshotRow.checkedAt` sem `z.coerce` (null virava 1970 e passava como data válida): aceita `Date` válido ou ISO-8601 com offset — custo se errada: baixo.
- Ruling: teste de repositório roda em `pnpm test:db` (config db inclui `tests/cart/repository.test.ts`, exclui-o do `pnpm test`) com usuários reais via Auth local e chaves lidas de `scripts/supa.mjs env` em tempo de execução — custo se errada: baixo.
