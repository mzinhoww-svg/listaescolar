-- S29 T12: criação de carrinho idempotente por (dono, chave). O formulário gera uma chave por renderização; reenvio
-- (toque duplo, duas abas) devolve o mesmo carrinho. Coluna nula para carrinhos antigos e outros caminhos de criação.
-- RLS e grants da tabela não mudam (o dono já insere e lê os próprios; a coluna nova entra no grant de tabela existente).
alter table public.carts add column idempotency_key uuid;
create unique index carts_owner_idempotency_key_uidx on public.carts (owner_id, idempotency_key) where idempotency_key is not null;
