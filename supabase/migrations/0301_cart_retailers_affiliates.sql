-- 0301_cart_retailers_affiliates: carrinho, varejistas, snapshots de preço e cliques de afiliado (S12, trilha Comércio).
-- Sem FK para tabelas de outras trilhas (ADR-004): list_id e list_item_id são uuid soltos.
-- Regra de produto: preço só existe com origem (source) e data (checked_at); nunca estimado.
-- Sem função SECURITY DEFINER nova: as políticas usam auth.uid() e auth_role() (0001).

create type public.cart_strategy as enum ('cheapest', 'fewest_stores', 'balanced', 'local_stationery');
create type public.affiliate_kind as enum ('none', 'mercadolivre', 'amazon');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
-- retailers: allowlist de destinos. O redirect é sempre montado a partir de search_url_template.
create table public.retailers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (btrim(name) <> ''),
  base_url text not null check (base_url ~ '^https://[^/?#\s]+$'),
  search_url_template text not null check (search_url_template ~ '^https://[^/?#\s{}]+[/?#][^\s]*\{query\}'),
  affiliate_kind public.affiliate_kind not null default 'none',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  list_id uuid, -- sem FK (lists é de outra trilha)
  strategy public.cart_strategy not null default 'cheapest',
  options_snapshot jsonb check (options_snapshot is null or pg_column_size(options_snapshot) < 65536),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index carts_owner_id_idx on public.carts (owner_id);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  list_item_id uuid, -- sem FK (list_items é de outra trilha)
  name text not null check (btrim(name) <> ''),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cart_items_cart_id_idx on public.cart_items (cart_id);

create table public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers (id) on delete cascade,
  item_key text not null check (btrim(item_key) <> ''), -- nome normalizado do item
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  source text not null check (btrim(source) <> ''), -- ex.: manual_admin, retailer_feed:<nome>, demo
  checked_at timestamptz not null check (checked_at <= now() + interval '5 minutes'), -- sem data futura
  product_url text check (product_url is null or product_url ~ '^https://[^\s]+$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'demo') = is_demo) -- demo sempre marcado, e só demo marca
);
create index price_snapshots_lookup_idx on public.price_snapshots (retailer_id, item_key, checked_at desc);

create table public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  retailer_id uuid not null references public.retailers (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  affiliate_applied boolean not null default false,
  target_url text not null check (target_url ~ '^https://[^\s]+$'),
  clicked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index affiliate_clicks_cart_id_idx on public.affiliate_clicks (cart_id);
create index affiliate_clicks_profile_id_idx on public.affiliate_clicks (profile_id);
create index affiliate_clicks_retailer_id_idx on public.affiliate_clicks (retailer_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger retailers_set_updated_at before update on public.retailers
  for each row execute function public.set_updated_at();
create trigger carts_set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();
create trigger cart_items_set_updated_at before update on public.cart_items
  for each row execute function public.set_updated_at();
create trigger price_snapshots_set_updated_at before update on public.price_snapshots
  for each row execute function public.set_updated_at();
create trigger affiliate_clicks_set_updated_at before update on public.affiliate_clicks
  for each row execute function public.set_updated_at();

create trigger retailers_audit after insert or update or delete on public.retailers
  for each row execute function public.audit_row_change();
create trigger price_snapshots_audit after insert or update or delete on public.price_snapshots
  for each row execute function public.audit_row_change();
-- Auditoria vale mesmo com session_replication_role = replica (como nas tabelas da 0001).
alter table public.retailers enable always trigger retailers_audit;
alter table public.price_snapshots enable always trigger price_snapshots_audit;

-- ---------------------------------------------------------------------------
-- Grants (mínimos; RLS decide o resto)
-- ---------------------------------------------------------------------------
revoke all on public.retailers, public.carts, public.cart_items, public.price_snapshots, public.affiliate_clicks
  from anon, authenticated, service_role;
grant select on public.retailers, public.price_snapshots to anon, authenticated;
grant insert, update, delete on public.retailers, public.price_snapshots to authenticated;
grant select, insert, update, delete on public.carts, public.cart_items to authenticated;
grant select, insert on public.affiliate_clicks to authenticated; -- cliques são imutáveis para o usuário
grant select, insert, update, delete on public.retailers, public.carts, public.cart_items,
  public.price_snapshots, public.affiliate_clicks to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.retailers enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.affiliate_clicks enable row level security;

-- retailers: público vê só os ativos; admin/system veem e gerenciam todos.
-- público (anon e logado) vê só varejistas ativos.
create policy retailers_select_active on public.retailers
  for select to anon, authenticated using (is_active);
-- admin/system veem também os inativos.
create policy retailers_select_admin on public.retailers
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- só admin/system cadastram varejistas.
create policy retailers_insert_admin on public.retailers
  for insert to authenticated with check ((select public.auth_role()) in ('admin', 'system'));
-- só admin/system alteram varejistas (template de busca é destino de redirect).
create policy retailers_update_admin on public.retailers
  for update to authenticated
  using ((select public.auth_role()) in ('admin', 'system')) with check ((select public.auth_role()) in ('admin', 'system'));
-- só admin/system removem varejistas.
create policy retailers_delete_admin on public.retailers
  for delete to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- price_snapshots: leitura pública (dado de comparação, sempre com origem); escrita só admin/system.
-- leitura pública: todo preço tem origem e data.
create policy price_snapshots_select_public on public.price_snapshots
  for select to anon, authenticated using (true);
-- só admin/system registram preços.
create policy price_snapshots_insert_admin on public.price_snapshots
  for insert to authenticated with check ((select public.auth_role()) in ('admin', 'system'));
-- só admin/system corrigem preços.
create policy price_snapshots_update_admin on public.price_snapshots
  for update to authenticated
  using ((select public.auth_role()) in ('admin', 'system')) with check ((select public.auth_role()) in ('admin', 'system'));
-- só admin/system removem preços.
create policy price_snapshots_delete_admin on public.price_snapshots
  for delete to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- carts: dono lê/escreve os próprios; admin/system só leem. Anon não tem grant.
-- dono lê os próprios carrinhos.
create policy carts_select_own on public.carts
  for select to authenticated using (owner_id = (select auth.uid()));
-- admin/system leem qualquer carrinho (suporte), sem escrita.
create policy carts_select_admin on public.carts
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- só cria carrinho em nome de si mesmo.
create policy carts_insert_own on public.carts
  for insert to authenticated with check (owner_id = (select auth.uid()));
-- só altera o próprio carrinho e não o transfere a outro dono.
create policy carts_update_own on public.carts
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- só apaga o próprio carrinho.
create policy carts_delete_own on public.carts
  for delete to authenticated using (owner_id = (select auth.uid()));

-- cart_items: herdam o dono do carrinho (o EXISTS já passa pela RLS de carts).
-- dono do carrinho lê os itens.
create policy cart_items_select_own on public.cart_items
  for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.owner_id = (select auth.uid())));
-- admin/system leem itens de qualquer carrinho, sem escrita.
create policy cart_items_select_admin on public.cart_items
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- só insere item em carrinho próprio.
create policy cart_items_insert_own on public.cart_items
  for insert to authenticated
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.owner_id = (select auth.uid())));
-- só altera item de carrinho próprio e não o move para carrinho alheio.
create policy cart_items_update_own on public.cart_items
  for update to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.owner_id = (select auth.uid())));
-- só apaga item de carrinho próprio.
create policy cart_items_delete_own on public.cart_items
  for delete to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.owner_id = (select auth.uid())));

-- affiliate_clicks: só o dono do carrinho registra e lê o próprio clique; admin/system leem.
-- dono lê os próprios cliques.
create policy affiliate_clicks_select_own on public.affiliate_clicks
  for select to authenticated using (profile_id = (select auth.uid()));
-- admin/system leem cliques (relatório). A UI de admin nunca renderiza target_url como link.
create policy affiliate_clicks_select_admin on public.affiliate_clicks
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- dono de carrinho próprio registra clique, em nome de si e para varejista ativo; sem update/delete (imutável).
create policy affiliate_clicks_insert_own on public.affiliate_clicks
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (select 1 from public.carts c where c.id = cart_id and c.owner_id = (select auth.uid()))
    and exists (select 1 from public.retailers r where r.id = retailer_id and r.is_active)
  );

-- ---------------------------------------------------------------------------
-- Seed: quatro varejistas. URLs sem parâmetro de afiliado; o ID entra só no servidor, via env.
-- ---------------------------------------------------------------------------
insert into public.retailers (slug, name, base_url, search_url_template, affiliate_kind) values
  ('kalunga', 'Kalunga', 'https://www.kalunga.com.br', 'https://www.kalunga.com.br/busca/{query}', 'none'),
  ('magalu', 'Magalu', 'https://www.magazineluiza.com.br', 'https://www.magazineluiza.com.br/busca/{query}/', 'none'),
  ('mercadolivre', 'Mercado Livre', 'https://www.mercadolivre.com.br', 'https://lista.mercadolivre.com.br/{query}', 'mercadolivre'),
  ('amazon', 'Amazon', 'https://www.amazon.com.br', 'https://www.amazon.com.br/s?k={query}', 'amazon');
