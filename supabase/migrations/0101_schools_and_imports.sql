-- 0101_schools_and_imports: escolas e importação INEP por CSV (S03, trilha Dados).
-- Cadastro INEP não é verificação: toda escola nasce 'registered' e a importação nunca altera
-- verification_status de escola existente. A gravação em lote é feita por funções SECURITY DEFINER
-- chamáveis só por service_role (o TypeScript valida/normaliza e fatia o arquivo em lotes).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.school_network as enum ('federal', 'state', 'municipal', 'private');
create type public.import_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.import_row_action as enum ('inserted', 'updated', 'duplicate', 'rejected');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(btrim(file_name)) > 0),
  file_hash text not null check (length(file_hash) > 0), -- sha256 hex do arquivo bruto: base da idempotência
  source text not null default 'inep',
  total_rows integer not null default 0 check (total_rows >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  status public.import_status not null default 'pending',
  imported_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_file_hash_key unique (file_hash)
);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw jsonb,
  normalized jsonb,
  errors jsonb not null default '[]'::jsonb, -- lista de {code, message}
  action public.import_row_action not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_rows_batch_row_key unique (batch_id, row_number)
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  inep text not null check (inep ~ '^[0-9]{8}$'),
  name text not null check (length(btrim(name)) > 0),
  normalized_name text not null,
  network public.school_network not null,
  neighborhood text,
  address text,
  cep text,
  phone text,
  email text,
  municipality_id uuid not null references public.municipalities (id),
  verification_status public.verification_status not null default 'registered',
  registry_source public.registry_source not null default 'inep_import',
  source_batch_id uuid references public.import_batches (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_inep_key unique (inep)
);

create index schools_municipality_name_idx on public.schools (municipality_id, normalized_name);
create index schools_source_batch_idx on public.schools (source_batch_id);
create index import_rows_batch_inep_idx on public.import_rows (batch_id, ((normalized ->> 'inep')));
create index import_batches_imported_by_idx on public.import_batches (imported_by);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger schools_set_updated_at before update on public.schools
  for each row execute function public.set_updated_at();
create trigger import_batches_set_updated_at before update on public.import_batches
  for each row execute function public.set_updated_at();
create trigger import_rows_set_updated_at before update on public.import_rows
  for each row execute function public.set_updated_at();
-- contatos de escola são dado institucional, mas ficam fora do audit_log (imutável) por precaução.
create trigger schools_audit after insert or update or delete on public.schools
  for each row execute function public.audit_row_change('email', 'phone');
alter table public.schools enable always trigger schools_audit;

-- ---------------------------------------------------------------------------
-- Grants (mínimos; RLS decide o resto)
-- ---------------------------------------------------------------------------
revoke all on public.schools, public.import_batches, public.import_rows from anon, authenticated, service_role;
grant select on public.schools to anon, authenticated;
grant insert, update, delete on public.schools to authenticated;
grant select on public.import_batches, public.import_rows to authenticated;
grant select, insert, update, delete on public.schools, public.import_batches, public.import_rows to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.schools enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

-- schools: qualquer um lê escolas de municípios habilitados.
create policy schools_select_enabled on public.schools
  for select to anon, authenticated
  using (exists (select 1 from public.municipalities m where m.id = municipality_id and m.is_enabled));
-- schools: admin e system leem todas.
create policy schools_select_admin on public.schools
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- schools: só admin/system inserem.
create policy schools_insert_admin on public.schools
  for insert to authenticated with check ((select public.auth_role()) in ('admin', 'system'));
-- schools: só admin/system atualizam.
create policy schools_update_admin on public.schools
  for update to authenticated
  using ((select public.auth_role()) in ('admin', 'system')) with check ((select public.auth_role()) in ('admin', 'system'));
-- schools: só admin/system apagam.
create policy schools_delete_admin on public.schools
  for delete to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- import_batches: só admin/system leem (escrita só via service_role, que ignora RLS).
create policy import_batches_select_admin on public.import_batches
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
-- import_rows: só admin/system leem (escrita só via service_role).
create policy import_rows_select_admin on public.import_rows
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- ---------------------------------------------------------------------------
-- import_claim_batch: insere o lote ou devolve o existente para o mesmo hash.
-- Seguro sob concorrência: on conflict do nothing espera a transação concorrente e o select
-- seguinte (novo snapshot, READ COMMITTED) enxerga o lote já confirmado.
-- ---------------------------------------------------------------------------
create function public.import_claim_batch(
  p_file_hash text, p_file_name text, p_imported_by uuid, p_is_demo boolean
) returns table (batch_id uuid, already_exists boolean, status public.import_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_file_hash is null or length(btrim(p_file_hash)) = 0 then
    raise exception 'file_hash obrigatório' using errcode = '22023';
  end if;

  insert into public.import_batches (file_name, file_hash, imported_by, is_demo)
  values (coalesce(nullif(btrim(p_file_name), ''), 'arquivo.csv'), p_file_hash, p_imported_by, coalesce(p_is_demo, false))
  on conflict (file_hash) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, false, 'pending'::public.import_status;
    return;
  end if;

  return query select b.id, true, b.status from public.import_batches b where b.file_hash = p_file_hash;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_apply_rows: aplica linhas já validadas/normalizadas pelo TypeScript.
-- Idempotente por (batch_id, row_number): linha já registrada é pulada e o retorno reflete o
-- que está gravado. Chamadas são serializadas por advisory lock (evita corrida em unique(inep)).
-- ---------------------------------------------------------------------------
create function public.import_apply_rows(p_batch_id uuid, p_rows jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  rn integer;
  v_batch_demo boolean;
  v_inep text;
  v_name text;
  v_norm text;
  v_network text;
  v_neighborhood text;
  v_address text;
  v_cep text;
  v_phone text;
  v_email text;
  v_demo boolean;
  v_muni_id uuid;
  v_muni_enabled boolean;
  v_school public.schools%rowtype;
  v_action public.import_row_action;
  v_errors jsonb;
  v_numbers integer[] := '{}';
  v_result jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows deve ser um array JSON' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.import_apply_rows'));

  select b.is_demo into v_batch_demo from public.import_batches b where b.id = p_batch_id for update;
  if not found then
    raise exception 'lote % não encontrado', p_batch_id using errcode = 'P0002';
  end if;

  update public.import_batches
     set status = 'processing', started_at = coalesce(started_at, now())
   where id = p_batch_id and status in ('pending', 'failed');

  for r in
    select e.value from jsonb_array_elements(p_rows) as e(value) order by (e.value ->> 'row_number')::integer
  loop
    rn := (r ->> 'row_number')::integer;
    if rn is null or rn <= 0 then
      raise exception 'row_number inválido' using errcode = '22023';
    end if;
    v_numbers := array_append(v_numbers, rn);

    if exists (select 1 from public.import_rows x where x.batch_id = p_batch_id and x.row_number = rn) then
      continue; -- idempotência
    end if;

    v_inep := nullif(btrim(r ->> 'inep'), '');
    v_name := nullif(btrim(r ->> 'name'), '');
    v_norm := coalesce(nullif(btrim(r ->> 'normalized_name'), ''), lower(v_name));
    v_network := nullif(btrim(r ->> 'network'), '');
    v_neighborhood := nullif(btrim(r ->> 'neighborhood'), '');
    v_address := nullif(btrim(r ->> 'address'), '');
    v_cep := nullif(btrim(r ->> 'cep'), '');
    v_phone := nullif(btrim(r ->> 'phone'), '');
    v_email := nullif(btrim(r ->> 'email'), '');
    v_demo := coalesce((r ->> 'is_demo')::boolean, v_batch_demo);
    v_action := null;
    v_errors := case when jsonb_typeof(r -> 'errors') = 'array' then r -> 'errors' else '[]'::jsonb end;

    if jsonb_array_length(v_errors) = 0 then
      if v_inep is null or v_inep !~ '^[0-9]{8}$' then
        v_errors := jsonb_build_array(jsonb_build_object('code', 'invalid_inep', 'message', 'INEP inválido (8 dígitos)'));
      elsif v_name is null then
        v_errors := jsonb_build_array(jsonb_build_object('code', 'invalid_name', 'message', 'Nome da escola vazio'));
      elsif v_network is null or v_network not in ('federal', 'state', 'municipal', 'private') then
        v_errors := jsonb_build_array(jsonb_build_object('code', 'invalid_network', 'message', 'Rede inválida'));
      else
        select m.id, m.is_enabled into v_muni_id, v_muni_enabled
          from public.municipalities m where m.ibge_code = (r ->> 'ibge_code');
        if v_muni_id is null or not v_muni_enabled then
          v_errors := jsonb_build_array(jsonb_build_object(
            'code', 'municipality_not_enabled', 'message', 'Município não habilitado ou inexistente'));
        end if;
      end if;
    end if;

    if jsonb_array_length(v_errors) > 0 then
      v_action := 'rejected';
    elsif exists (
      select 1 from public.import_rows x
       where x.batch_id = p_batch_id and x.normalized ->> 'inep' = v_inep and x.action in ('inserted', 'updated')
    ) then
      v_action := 'duplicate';
      v_errors := jsonb_build_array(jsonb_build_object(
        'code', 'duplicate_inep_in_file', 'message', 'INEP repetido no mesmo arquivo'));
    else
      select * into v_school from public.schools s where s.inep = v_inep;
      if found then
        if (v_school.name, v_school.normalized_name, v_school.network::text, v_school.neighborhood, v_school.address,
            v_school.cep, v_school.phone, v_school.email, v_school.municipality_id)
           is distinct from
           (v_name, v_norm, v_network, v_neighborhood, v_address, v_cep, v_phone, v_email, v_muni_id) then
          -- nunca toca verification_status nem registry_source: cadastro INEP não é verificação.
          update public.schools
             set name = v_name, normalized_name = v_norm, network = v_network::public.school_network,
                 neighborhood = v_neighborhood, address = v_address, cep = v_cep, phone = v_phone,
                 email = v_email, municipality_id = v_muni_id, source_batch_id = p_batch_id
           where id = v_school.id;
          v_action := 'updated';
        else
          v_action := 'duplicate';
          v_errors := jsonb_build_array(jsonb_build_object(
            'code', 'already_up_to_date', 'message', 'Escola já cadastrada com os mesmos dados'));
        end if;
      elsif exists (
        select 1 from public.schools s where s.municipality_id = v_muni_id and s.normalized_name = v_norm
      ) then
        v_action := 'duplicate';
        v_errors := jsonb_build_array(jsonb_build_object(
          'code', 'duplicate_name_municipality', 'message', 'Já existe escola com o mesmo nome no município'));
      else
        insert into public.schools (inep, name, normalized_name, network, neighborhood, address, cep, phone, email,
                                    municipality_id, source_batch_id, is_demo)
        values (v_inep, v_name, v_norm, v_network::public.school_network, v_neighborhood, v_address, v_cep, v_phone,
                v_email, v_muni_id, p_batch_id, v_demo);
        v_action := 'inserted';
      end if;
    end if;

    insert into public.import_rows (batch_id, row_number, raw, normalized, errors, action)
    values (p_batch_id, rn, r -> 'raw', r - 'raw' - 'errors', v_errors, v_action);
  end loop;

  -- contadores do lote sempre recalculados do que está gravado (consistente e idempotente).
  update public.import_batches b
     set total_rows = c.total, inserted_count = c.ins, updated_count = c.upd,
         duplicate_count = c.dup, rejected_count = c.rej
    from (
      select count(*)::integer as total,
             (count(*) filter (where action = 'inserted'))::integer as ins,
             (count(*) filter (where action = 'updated'))::integer as upd,
             (count(*) filter (where action = 'duplicate'))::integer as dup,
             (count(*) filter (where action = 'rejected'))::integer as rej
        from public.import_rows where batch_id = p_batch_id
    ) c
   where b.id = p_batch_id;

  select jsonb_build_object(
           'inserted', (count(*) filter (where action = 'inserted'))::integer,
           'updated', (count(*) filter (where action = 'updated'))::integer,
           'duplicate', (count(*) filter (where action = 'duplicate'))::integer,
           'rejected', (count(*) filter (where action = 'rejected'))::integer)
    into v_result
    from public.import_rows where batch_id = p_batch_id and row_number = any (v_numbers);
  return v_result;
end;
$$;

-- O Supabase concede EXECUTE por padrão a anon/authenticated: revoga explicitamente.
revoke execute on function public.import_claim_batch(text, text, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function public.import_apply_rows(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_claim_batch(text, text, uuid, boolean) to service_role;
grant execute on function public.import_apply_rows(uuid, jsonb) to service_role;
