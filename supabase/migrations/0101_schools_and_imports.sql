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
  unchanged_count integer not null default 0 check (unchanged_count >= 0), -- escolas já iguais (import_rows.unchanged)
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
  unchanged boolean not null default false, -- escola já igual ao arquivo (gravada como duplicate)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_rows_batch_row_key unique (batch_id, row_number),
  constraint import_rows_unchanged_is_duplicate check (not unchanged or action = 'duplicate')
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
-- import_claim_batch: claim atômico do lote por hash. Devolve `owner = true` só para quem pode
-- processar: lote novo (nasce `processing`) ou existente `pending`/`failed` da mesma natureza
-- (demo x real) ou `processing` parado há mais de 10 min (heartbeat = updated_at, renovado por
-- import_apply_rows). Os demais recebem o lote existente com owner = false.
-- Seguro sob concorrência: on conflict do nothing espera a transação concorrente e o update
-- seguinte (novo snapshot, READ COMMITTED) reavalia a linha já confirmada.
-- ---------------------------------------------------------------------------
create function public.import_claim_batch(
  p_file_hash text, p_file_name text, p_imported_by uuid, p_is_demo boolean
) returns table (batch_id uuid, already_exists boolean, status public.import_status, owner boolean, is_demo boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_demo boolean := coalesce(p_is_demo, false);
begin
  if p_file_hash is null or length(btrim(p_file_hash)) = 0 then
    raise exception 'file_hash obrigatório' using errcode = '22023';
  end if;

  insert into public.import_batches (file_name, file_hash, imported_by, is_demo, status, started_at)
  values (coalesce(nullif(btrim(p_file_name), ''), 'arquivo.csv'), p_file_hash, p_imported_by, v_demo,
          'processing', now())
  on conflict (file_hash) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, false, 'processing'::public.import_status, true, v_demo;
    return;
  end if;

  update public.import_batches b
     set status = 'processing', started_at = coalesce(b.started_at, now()), finished_at = null
   where b.file_hash = p_file_hash
     and b.is_demo = v_demo
     and (b.status in ('pending', 'failed')
          or (b.status = 'processing' and b.updated_at < now() - interval '10 minutes'))
  returning b.id into v_id;

  if v_id is not null then
    return query select v_id, true, 'processing'::public.import_status, true, v_demo;
    return;
  end if;

  return query select b.id, true, b.status, false, b.is_demo from public.import_batches b where b.file_hash = p_file_hash;
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
  c_max_rows constant integer := 1000;
  c_max_json constant integer := 20000; -- caracteres de raw/normalized/errors por linha
  c_max_errors constant integer := 20;
  c_keys constant text[] := array['row_number', 'inep', 'name', 'normalized_name', 'network', 'neighborhood',
                                  'address', 'cep', 'phone', 'email', 'ibge_code', 'is_demo'];
  r jsonb;
  rn integer;
  v_batch_demo boolean;
  v_batch_status public.import_status;
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
  v_locked boolean;
  v_eff_muni uuid;
  v_eff_phone text;
  v_eff_email text;
  v_warn jsonb;
  v_action public.import_row_action;
  v_errors jsonb;
  v_normalized jsonb;
  v_raw jsonb;
  v_unchanged boolean;
  v_numbers integer[] := '{}';
  v_result jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows deve ser um array JSON' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > c_max_rows then
    raise exception 'p_rows excede % linhas', c_max_rows using errcode = '22023';
  end if;

  -- duas chaves constantes (namespace do módulo + função): não colide com hashtext de outros usos.
  perform pg_advisory_xact_lock(101, 1);

  select b.is_demo, b.status into v_batch_demo, v_batch_status
    from public.import_batches b where b.id = p_batch_id for update;
  if not found then
    raise exception 'lote % não encontrado', p_batch_id using errcode = 'P0002';
  end if;
  if v_batch_status = 'completed' then
    raise exception 'lote % já concluído', p_batch_id using errcode = '22023';
  end if;

  -- renova o heartbeat (updated_at, pelo trigger) mesmo quando o lote já está `processing`.
  update public.import_batches
     set status = 'processing', started_at = coalesce(started_at, now())
   where id = p_batch_id;

  for r in
    select e.value from jsonb_array_elements(p_rows) as e(value)
     order by case when jsonb_typeof(e.value) = 'object' then (e.value ->> 'row_number')::integer end
  loop
    if jsonb_typeof(r) <> 'object' then
      raise exception 'elemento de p_rows deve ser objeto' using errcode = '22023';
    end if;
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
    -- lote demo nunca cria/atualiza escola real; linha demo em lote real também é demo.
    v_demo := v_batch_demo or coalesce((r ->> 'is_demo')::boolean, false);
    v_action := null;
    v_unchanged := false;
    v_muni_id := null;
    v_warn := '[]'::jsonb;
    v_errors := case when jsonb_typeof(r -> 'errors') = 'array' then r -> 'errors' else '[]'::jsonb end;
    v_normalized := (select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb)
                       from jsonb_each(r) as k(key, value) where k.key = any (c_keys));
    -- tetos de tamanho: raw, normalized e errors nunca inflam import_rows.
    v_raw := r -> 'raw';
    if v_raw is not null and length(v_raw::text) > c_max_json then
      v_raw := jsonb_build_object('truncated', true);
    end if;
    if length(v_normalized::text) > c_max_json then
      v_normalized := '{}'::jsonb;
    end if;
    if jsonb_array_length(v_errors) > c_max_errors or length(v_errors::text) > c_max_json then
      v_errors := jsonb_build_array(jsonb_build_object(
        'code', 'invalid_row', 'message', 'Erros de validação acima do tamanho máximo'));
    end if;

    if jsonb_array_length(v_errors) = 0 then
      if v_inep is null or v_inep !~ '^[0-9]{8}$' then
        v_errors := jsonb_build_array(jsonb_build_object('code', 'invalid_inep', 'message', 'INEP inválido (8 dígitos)'));
      elsif v_name is null then
        v_errors := jsonb_build_array(jsonb_build_object('code', 'invalid_name', 'message', 'Nome da escola vazio'));
      elsif v_network is null or v_network not in ('federal', 'state', 'municipal', 'private') then
        v_errors := jsonb_build_array(jsonb_build_object('code', 'invalid_network', 'message', 'Rede inválida'));
      elsif length(v_name) > 300 or length(v_norm) > 300 or length(v_address) > 300 or length(v_neighborhood) > 300
            or length(v_cep) > 20 or length(v_phone) > 50 or length(v_email) > 254 then
        v_errors := jsonb_build_array(jsonb_build_object('code', 'field_too_long', 'message', 'Campo acima do tamanho máximo'));
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
       where x.batch_id = p_batch_id and x.normalized ->> 'inep' = v_inep and x.action <> 'rejected'
    ) then
      v_action := 'duplicate';
      v_errors := jsonb_build_array(jsonb_build_object(
        'code', 'duplicate_inep_in_file', 'message', 'INEP repetido no mesmo arquivo'));
    else
      select * into v_school from public.schools s where s.inep = v_inep;
      if found then
        v_locked := v_school.verification_status <> 'registered';
        if v_school.is_demo is distinct from v_demo then
          v_action := 'rejected';
          v_errors := jsonb_build_array(jsonb_build_object(
            'code', 'demo_real_conflict', 'message', 'INEP existente com natureza diferente (demonstração x real)'));
        else
          -- escola reivindicada/verificada/suspensa: município e contatos são preservados (só identificação muda).
          v_eff_muni := case when v_locked then v_school.municipality_id else v_muni_id end;
          v_eff_phone := case when v_locked then v_school.phone else v_phone end;
          v_eff_email := case when v_locked then v_school.email else v_email end;
          if v_muni_id is distinct from v_school.municipality_id then
            v_warn := jsonb_build_array(jsonb_build_object(
              'code', case when v_locked then 'municipality_change_ignored' else 'municipality_changed' end,
              'message', case when v_locked then 'Município do arquivo difere; escola não é movida'
                              else 'Escola movida para outro município' end));
          end if;

          if (v_school.name, v_school.normalized_name, v_school.network::text, v_school.neighborhood, v_school.address,
              v_school.cep, v_school.phone, v_school.email, v_school.municipality_id)
             is not distinct from
             (v_name, v_norm, v_network, v_neighborhood, v_address, v_cep, v_eff_phone, v_eff_email, v_eff_muni) then
            v_action := 'duplicate';
            v_unchanged := true;
            v_errors := jsonb_build_array(jsonb_build_object(
              'code', 'already_up_to_date', 'message', 'Escola já cadastrada com os mesmos dados')) || v_warn;
          elsif exists (
            select 1 from public.schools s
             where s.id <> v_school.id and s.municipality_id = v_eff_muni and s.normalized_name = v_norm
               and s.is_demo = v_demo
          ) then
            v_action := 'duplicate';
            v_errors := jsonb_build_array(jsonb_build_object(
              'code', 'duplicate_name_municipality', 'message', 'Já existe escola com o mesmo nome no município'));
          else
            -- nunca toca verification_status nem registry_source: cadastro INEP não é verificação.
            update public.schools
               set name = v_name, normalized_name = v_norm, network = v_network::public.school_network,
                   neighborhood = v_neighborhood, address = v_address, cep = v_cep, phone = v_eff_phone,
                   email = v_eff_email, municipality_id = v_eff_muni, source_batch_id = p_batch_id
             where id = v_school.id;
            v_action := 'updated';
            v_errors := v_warn;
          end if;
        end if;
      elsif exists (
        select 1 from public.schools s
         where s.municipality_id = v_muni_id and s.normalized_name = v_norm and s.is_demo = v_demo
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

    insert into public.import_rows (batch_id, row_number, raw, normalized, errors, action, unchanged)
    values (p_batch_id, rn, v_raw, v_normalized, v_errors, v_action, v_unchanged);
  end loop;

  -- contadores do lote sempre recalculados do que está gravado (consistente e idempotente).
  -- "sem alteração" é gravado como duplicate + import_rows.unchanged (enum fixo) e contado à parte.
  update public.import_batches b
     set total_rows = c.total, inserted_count = c.ins, updated_count = c.upd,
         duplicate_count = c.dup, rejected_count = c.rej, unchanged_count = c.unc
    from (
      select count(*)::integer as total,
             (count(*) filter (where action = 'inserted'))::integer as ins,
             (count(*) filter (where action = 'updated'))::integer as upd,
             (count(*) filter (where action = 'duplicate' and not unchanged))::integer as dup,
             (count(*) filter (where action = 'rejected'))::integer as rej,
             (count(*) filter (where action = 'duplicate' and unchanged))::integer as unc
        from public.import_rows where batch_id = p_batch_id
    ) c
   where b.id = p_batch_id;

  select jsonb_build_object(
           'inserted', (count(*) filter (where action = 'inserted'))::integer,
           'updated', (count(*) filter (where action = 'updated'))::integer,
           'duplicate', (count(*) filter (where action = 'duplicate' and not unchanged))::integer,
           'rejected', (count(*) filter (where action = 'rejected'))::integer,
           'unchanged', (count(*) filter (where action = 'duplicate' and unchanged))::integer)
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
