-- 0102_school_search: busca pública de escolas por trigram (S04, trilha Dados).
-- A função é SECURITY INVOKER: a RLS de public.schools (S03) decide as linhas (público só vê município
-- habilitado). pg_trgm/unaccent ficam no schema `extensions` (local e hospedado); tudo é qualificado
-- porque a função roda com search_path vazio. INEP não é pesquisado aqui (o redirect é da aplicação).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() é STABLE; para indexar precisamos de um wrapper IMMUTABLE com dicionário fixo.
create function public.immutable_unaccent(p_text text) returns text
  language sql immutable strict parallel safe
  set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, p_text) $$;

-- Normalização da consulta: sem acento, minúsculo, só [a-z0-9] e espaço único, teto de 200 caracteres na entrada (a função corta em 100).
create function public.search_normalize(p_text text) returns text
  language sql immutable parallel safe
  set search_path = ''
as $$
  select btrim(regexp_replace(lower(public.immutable_unaccent(left(coalesce(p_text, ''), 200))), '[^a-z0-9]+', ' ', 'g'))
$$;

create index schools_normalized_name_trgm_idx on public.schools
  using gin (normalized_name extensions.gin_trgm_ops);
create index schools_neighborhood_trgm_idx on public.schools
  using gin ((public.search_normalize(neighborhood)) extensions.gin_trgm_ops);
create index schools_municipality_network_idx on public.schools (municipality_id, network);

create function public.search_schools(
  p_query text default null,
  p_municipality_id uuid default null,
  p_network public.school_network default null,
  p_neighborhood text default null,
  p_limit int default 20,
  p_offset int default 0
) returns table (
  id uuid,
  inep text,
  name text,
  network public.school_network,
  neighborhood text,
  municipality_id uuid,
  municipality_name text,
  verification_status public.verification_status,
  is_demo boolean,
  rank real,
  total_count bigint
)
  language sql stable security invoker
  set search_path = ''
as $$
  with p as (
    select
      left(public.search_normalize(p_query), 100) as q,
      p_query is not null as has_q,
      left(public.search_normalize(left(coalesce(p_neighborhood, ''), 100)), 100) as hood,
      p_neighborhood is not null as has_hood,
      least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
      greatest(coalesce(p_offset, 0), 0) as off
  ),
  ok as (
    -- consulta informada mas curta demais (ex.: só "%" ou espaços) não vira "listar tudo".
    select p.*, (not p.has_q or length(p.q) >= 2) and (not p.has_hood or length(p.hood) >= 2) as valid from p
  )
  select
    s.id, s.inep, s.name, s.network, s.neighborhood, s.municipality_id,
    m.name as municipality_name, s.verification_status, s.is_demo,
    case when ok.has_q
      then greatest(extensions.similarity(s.normalized_name, ok.q), extensions.word_similarity(ok.q, s.normalized_name))
      else 0::real end as rank,
    count(*) over () as total_count
  from ok
  cross join public.schools s
  join public.municipalities m on m.id = s.municipality_id
  where ok.valid
    and (not ok.has_q or s.normalized_name operator(extensions.%) ok.q or ok.q operator(extensions.<%) s.normalized_name)
    and (not ok.has_hood
         or public.search_normalize(s.neighborhood) operator(extensions.%) ok.hood
         or ok.hood operator(extensions.<%) public.search_normalize(s.neighborhood))
    and (p_municipality_id is null or s.municipality_id = p_municipality_id)
    and (p_network is null or s.network = p_network)
  order by rank desc, s.name asc, s.id asc
  limit (select lim from ok) offset (select off from ok)
$$;

revoke all on function public.search_schools(text, uuid, public.school_network, text, int, int) from public;
grant execute on function public.search_schools(text, uuid, public.school_network, text, int, int)
  to anon, authenticated, service_role;
-- helpers de normalização: puros e inofensivos, usados pela função INVOKER e pelos índices (o papel que
-- consulta precisa de EXECUTE); `public` não executa. Sem chamada direta esperada pela API.
revoke all on function public.immutable_unaccent(text) from public;
revoke all on function public.search_normalize(text) from public;
grant execute on function public.immutable_unaccent(text) to anon, authenticated, service_role;
grant execute on function public.search_normalize(text) to anon, authenticated, service_role;

-- Privacidade: a S03 deu SELECT da tabela inteira a anon/authenticated (só a RLS filtrava linhas), o que
-- expunha `email` de escola via API. Troca por grant por coluna, sem `email` e sem `source_batch_id`.
-- Leitura de e-mail (admin/importação) passa pelo servidor com a chave secreta (service_role, intacto).
-- A RLS e os grants de insert/update/delete não mudam. `select *` por esses papéis passa a dar 42501.
revoke select on public.schools from anon, authenticated;
grant select (
  id, inep, name, normalized_name, network, neighborhood, address, cep, phone, municipality_id,
  verification_status, registry_source, is_demo, created_at, updated_at
) on public.schools to anon, authenticated;
