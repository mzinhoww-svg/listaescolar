-- 0303_leads: leads de cotação por WhatsApp, itens, eventos imutáveis e funções do funil (S14, trilha Comércio).
-- Sem FK para tabelas de outras trilhas (ADR-004): list_id e consent_id são uuid soltos; FK só para profiles,
-- municipalities e tabelas da trilha Comércio (carts, stationeries).
-- Regras de produto: nunca inventar preço/estoque (valores só "informados pela papelaria"); nenhum dado de menor nem
-- do responsável chega à papelaria (grants por coluna excluem requester_id, consent_*, idempotency_key, actor_id);
-- nada é cobrado aqui (o evento `created` é o "lead entregue" que a S21 debitará).
-- Escrita só pelas funções SECURITY DEFINER (EXECUTE só service_role): nem authenticated nem service_role escrevem
-- direto nas tabelas. Eventos e itens são imutáveis. Erros saem com errcode + hint estáveis (o repositório mapeia por hint):
-- forbidden, invalid_state, transition_not_allowed, rate_limited, stationery_unavailable, out_of_area, expired,
-- amount_invalid, reason_required, actor_invalid, limit_exceeded, consent_required, invalid_input, not_found.
-- Bairro: chave única da S13 (sem acento, espaços juntados, minúscula) via lead_neighborhood_key().

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  -- Crockford base32 (sem I, L, O, U); nasce com 4 caracteres e cresce até 6 em colisão.
  code text not null unique check (code ~ '^LC-[0-9A-HJKMNP-TV-Z]{4,6}$'),
  requester_id uuid references public.profiles (id) on delete set null, -- nulo só após exclusão de conta; o rastro fica
  cart_id uuid references public.carts (id) on delete set null,
  list_id uuid not null, -- sem FK (lists é de outra trilha)
  stationery_id uuid not null references public.stationeries (id) on delete restrict,
  status public.lead_status not null default 'received',
  -- snapshot público da lista (nada de estudante)
  school_name text not null check (btrim(school_name) <> '' and length(school_name) <= 200),
  grade_label text not null check (btrim(grade_label) <> '' and length(grade_label) <= 60),
  school_year integer not null check (school_year between 2000 and 2100),
  municipality_id uuid not null references public.municipalities (id) on delete restrict,
  neighborhood text check (neighborhood is null or (neighborhood <> '' and neighborhood = lower(btrim(neighborhood)) and length(neighborhood) <= 120)),
  item_count integer not null check (item_count between 1 and 300),
  expires_at timestamptz not null,
  consent_id uuid, -- sem FK: linha em public.consents (FK só na 0600)
  consent_text_version text not null check (btrim(consent_text_version) <> ''),
  consented_at timestamptz not null,
  idempotency_key uuid not null,
  -- valores informados/declarados pela papelaria (opcionais; nunca calculados aqui)
  quoted_total_cents integer check (quoted_total_cents is null or quoted_total_cents between 1 and 10000000),
  quoted_at timestamptz,
  declared_sale_cents integer check (declared_sale_cents is null or declared_sale_cents between 1 and 10000000),
  declared_at timestamptz,
  close_reason text check (close_reason is null or close_reason in ('price', 'stock', 'no_reply', 'bought_elsewhere', 'other')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, idempotency_key)
);
create index leads_stationery_status_idx on public.leads (stationery_id, status, created_at desc);
create index leads_requester_idx on public.leads (requester_id, created_at desc);
create index leads_cart_id_idx on public.leads (cart_id);
create index leads_municipality_id_idx on public.leads (municipality_id);
create index leads_due_idx on public.leads (expires_at) where status not in ('converted', 'declined', 'expired', 'cancelled');
-- um lead aberto por (solicitante, papelaria, lista)
create unique index leads_one_open_per_requester_stationery_list on public.leads (requester_id, stationery_id, list_id)
  where status not in ('converted', 'declined', 'expired', 'cancelled');

create table public.lead_items (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  position integer not null check (position >= 1),
  name text not null check (btrim(name) <> '' and length(name) <= 200),
  item_key text not null check (btrim(item_key) <> '' and length(item_key) <= 200),
  quantity integer not null check (quantity between 1 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, position)
);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete restrict,
  event_type text not null check (event_type in ('created', 'viewed', 'status_changed', 'quote_registered', 'sale_declared',
                                                 'closed_lost', 'cancelled', 'expired', 'whatsapp_opened')),
  from_status public.lead_status,
  to_status public.lead_status,
  actor_role text not null check (actor_role in ('parent', 'stationery', 'admin', 'system')),
  actor_id uuid, -- sem FK: o rastro sobrevive à exclusão de conta (anonimização na S17)
  amount_cents integer check (amount_cents is null or amount_cents between 1 and 10000000),
  reason text check (reason is null or length(reason) <= 500),
  item_count integer check (item_count is null or item_count between 1 and 300), -- snapshot para a faixa de preço (S21)
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index lead_events_lead_idx on public.lead_events (lead_id, created_at);

-- ---------------------------------------------------------------------------
-- Funções internas e guardas
-- ---------------------------------------------------------------------------
-- eventos e itens são imutáveis (update, delete e truncate), inclusive para o dono do banco.
create function public.lead_rows_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% é imutável (% bloqueado)', tg_table_name, tg_op using errcode = '42501';
end;
$$;

-- Aplica a mudança de status sobre um lead JÁ TRAVADO (for update) e grava exatamente um evento.
-- Uso interno das funções públicas abaixo (executa como o dono; ninguém mais tem EXECUTE).
create function public.lead_apply(
  l public.leads,
  p_to public.lead_status,
  p_actor_role text,
  p_actor_id uuid,
  p_amount integer,
  p_reason text
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_terminal boolean := p_to in ('converted', 'declined', 'expired', 'cancelled');
  v_event text := case p_to
    when 'viewed' then 'viewed'
    when 'quote_sent' then 'quote_registered'
    when 'converted' then 'sale_declared'
    when 'declined' then 'closed_lost'
    when 'cancelled' then 'cancelled'
    when 'expired' then 'expired'
    else 'status_changed'
  end;
begin
  update public.leads
     set status = p_to,
         quoted_total_cents = case when p_to = 'quote_sent' and p_amount is not null then p_amount else quoted_total_cents end,
         quoted_at = case when p_to = 'quote_sent' and p_amount is not null then now() else quoted_at end,
         declared_sale_cents = case when p_to = 'converted' and p_amount is not null then p_amount else declared_sale_cents end,
         declared_at = case when p_to = 'converted' and p_amount is not null then now() else declared_at end,
         close_reason = case when p_to = 'declined' then p_reason else close_reason end,
         -- atividade da papelaria em status não terminal renova o prazo (nunca o encurta)
         expires_at = case when p_actor_role = 'stationery' and not v_terminal
                           then greatest(expires_at, now() + interval '7 days') else expires_at end
   where id = l.id;
  insert into public.lead_events (lead_id, event_type, from_status, to_status, actor_role, actor_id, amount_cents, reason)
  values (l.id, v_event, l.status, p_to, p_actor_role, p_actor_id, p_amount, p_reason);
end;
$$;

-- chave do bairro: MESMA normalização de features/stationeries/neighborhood.ts (normalizeNeighborhood):
-- sem acento, espaços juntados, minúscula. Vazio vira nulo.
create function public.lead_neighborhood_key(p_name text) returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(btrim(public.immutable_unaccent(coalesce(p_name, ''))), '\s+', ' ', 'g')), '')
$$;

-- claim sub do JWT (quando a chamada é em nome de um usuário); nulo sem claims.
create function public.lead_jwt_sub() returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_create: lead + itens + consentimento + evento `created` numa transação, idempotente e com limites anti-abuso.
-- ---------------------------------------------------------------------------
create function public.lead_create(
  p_requester_id uuid,
  p_cart_id uuid,
  p_list_id uuid,
  p_stationery_id uuid,
  p_school_name text,
  p_grade_label text,
  p_school_year integer,
  p_municipality_id uuid,
  p_neighborhood text,
  p_items jsonb,
  p_consent_text_version text,
  p_idempotency_key uuid,
  p_is_demo boolean,
  p_max_per_day integer default 10,
  p_max_open_per_list integer default 5
) returns table (lead_id uuid, code text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_version text := nullif(btrim(coalesce(p_consent_text_version, '')), '');
  v_nb text := public.lead_neighborhood_key(p_neighborhood);
  v_sub text := public.lead_jwt_sub();
  v_role public.user_role;
  v_n integer;
  v_existing public.leads%rowtype;
  s public.stationeries%rowtype;
  v_served boolean;
  v_muni_enabled boolean;
  v_cart_demo boolean;
  v_demo boolean;
  v_consent uuid;
  -- GUC app.lead_code_alphabet: gancho SÓ DE TESTE (força colisão de código). Só service_role executa esta função e o
  -- PostgREST não expõe set_config; valor fora do alfabeto Crockford é ignorado.
  v_alpha text := coalesce(nullif(current_setting('app.lead_code_alphabet', true), ''), '');
  v_default_alpha constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_len integer := 4;
  v_fail integer := 0;
  v_code text;
  v_bytes bytea;
  v_id uuid;
  v_constraint text;
  i integer;
begin
  if v_version is null then
    raise exception 'consentimento obrigatório' using errcode = '22023', hint = 'consent_required';
  end if;
  if p_requester_id is null or p_list_id is null or p_stationery_id is null or p_idempotency_key is null or p_municipality_id is null then
    raise exception 'parâmetros obrigatórios ausentes' using errcode = '22023', hint = 'invalid_input';
  end if;
  -- snapshot público da lista: mensagens estáveis (invalid_input) em vez de violar CHECK da tabela.
  if p_school_year is null or p_school_year not between 2000 and 2100
     or btrim(coalesce(p_school_name, '')) = '' or length(btrim(p_school_name)) > 200
     or btrim(coalesce(p_grade_label, '')) = '' or length(btrim(p_grade_label)) > 60
     or length(coalesce(v_nb, '')) > 120 then
    raise exception 'dados da lista inválidos' using errcode = '22023', hint = 'invalid_input';
  end if;
  if coalesce(p_max_per_day, 0) < 1 or coalesce(p_max_open_per_list, 0) < 1 then
    raise exception 'limites inválidos' using errcode = '22023', hint = 'invalid_input';
  end if;
  -- com claim sub (chamada em nome de um usuário), o solicitante precisa ser esse usuário.
  if v_sub is not null and v_sub is distinct from p_requester_id::text then
    raise exception 'solicitante diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  select p.role into v_role from public.profiles p where p.id = p_requester_id;
  if v_role is distinct from 'parent' then
    raise exception 'só responsável (parent) cria lead' using errcode = '42501', hint = 'forbidden';
  end if;

  -- itens: 1..300, cada um {name, item_key, quantity}
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'itens inválidos' using errcode = '22023', hint = 'invalid_input';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n = 0 then
    raise exception 'lista sem itens' using errcode = '22023', hint = 'invalid_input';
  end if;
  if v_n > 300 then
    raise exception 'itens demais (máximo 300)' using errcode = '54000', hint = 'limit_exceeded';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) is distinct from 'object'
        or jsonb_typeof(e -> 'name') is distinct from 'string'
        or jsonb_typeof(e -> 'item_key') is distinct from 'string'
        or jsonb_typeof(e -> 'quantity') is distinct from 'number'
        or btrim(e ->> 'name') = '' or length(e ->> 'name') > 200
        or btrim(e ->> 'item_key') = '' or length(e ->> 'item_key') > 200
        or (case when (e ->> 'quantity') ~ '^[0-9]{1,3}$' then (e ->> 'quantity')::integer else 0 end) not between 1 and 999
  ) then
    raise exception 'item inválido' using errcode = '22023', hint = 'invalid_input';
  end if;

  -- serializa por solicitante: duplo clique, duas abas e limites sem corrida.
  perform pg_advisory_xact_lock(hashtextextended('lead_create:' || p_requester_id::text, 0));

  -- idempotência pela chave: reenvio devolve o mesmo lead.
  select * into v_existing from public.leads x where x.requester_id = p_requester_id and x.idempotency_key = p_idempotency_key;
  if found then
    lead_id := v_existing.id; code := v_existing.code; created := false;
    return next;
    return;
  end if;

  -- carrinho do próprio solicitante.
  select k.is_demo into v_cart_demo from public.carts k where k.id = p_cart_id and k.owner_id = p_requester_id;
  if p_cart_id is null or not found then
    raise exception 'carrinho não encontrado para este usuário' using errcode = '42501', hint = 'forbidden';
  end if;

  -- papelaria active, na área, e o solicitante não é membro dela.
  select * into s from public.stationeries x where x.id = p_stationery_id for share;
  if not found or s.status <> 'active' then
    raise exception 'papelaria indisponível' using errcode = '23514', hint = 'stationery_unavailable';
  end if;
  if exists (select 1 from public.stationery_members m where m.stationery_id = s.id and m.profile_id = p_requester_id) then
    raise exception 'membro da papelaria não pede cotação a ela' using errcode = '42501', hint = 'forbidden';
  end if;
  -- município habilitado por dado (municipalities.is_enabled); desabilitado = fora da área.
  select m.is_enabled into v_muni_enabled from public.municipalities m where m.id = p_municipality_id;
  -- mesma regra de servesLocation (features/stationeries/local-quote-provider.ts): sem bairro pedido, basta atender
  -- o município; com bairro, vale área cadastrada (chave normalizada) ou o bairro da própria papelaria no município.
  -- (Papelaria sem bairro e sem área NÃO atende o município inteiro: é a regra do TS.)
  v_served := coalesce(v_muni_enabled, false) and coalesce(
    case when v_nb is null then
      s.municipality_id = p_municipality_id
      or exists (select 1 from public.stationery_areas a where a.stationery_id = s.id and a.municipality_id = p_municipality_id)
    else
      exists (select 1 from public.stationery_areas a
               where a.stationery_id = s.id and a.municipality_id = p_municipality_id
                 and public.lead_neighborhood_key(a.neighborhood) = v_nb)
      or (s.municipality_id = p_municipality_id and public.lead_neighborhood_key(s.neighborhood) = v_nb)
    end, false);
  v_demo := s.is_demo or v_cart_demo;
  if p_is_demo is distinct from v_demo then
    raise exception 'is_demo deve acompanhar papelaria e carrinho' using errcode = '22023', hint = 'invalid_input';
  end if;
  if not v_served then
    raise exception 'papelaria não atende esta área' using errcode = '23514', hint = 'out_of_area';
  end if;

  -- lead aberto para a mesma (solicitante, papelaria, lista): devolve o existente (vencido é expirado e segue).
  select * into v_existing from public.leads x
   where x.requester_id = p_requester_id and x.stationery_id = p_stationery_id and x.list_id = p_list_id
     and x.status not in ('converted', 'declined', 'expired', 'cancelled')
   for update;
  if found then
    if v_existing.expires_at > now() then
      lead_id := v_existing.id; code := v_existing.code; created := false;
      return next;
      return;
    end if;
    perform public.lead_apply(v_existing, 'expired', 'system', null, null, null);
  end if;

  -- limites anti-abuso (rate limit por IP é da S19).
  select count(*) into v_n from public.leads x where x.requester_id = p_requester_id and x.created_at > now() - interval '24 hours';
  if v_n >= p_max_per_day then
    raise exception 'limite de pedidos em 24 horas atingido' using errcode = '54000', hint = 'rate_limited';
  end if;
  select count(*) into v_n from public.leads x
   where x.requester_id = p_requester_id and x.list_id = p_list_id and x.status not in ('converted', 'declined', 'expired', 'cancelled');
  if v_n >= p_max_open_per_list then
    raise exception 'muitos pedidos abertos para esta lista' using errcode = '54000', hint = 'rate_limited';
  end if;

  -- consentimento (mesma transação); a data é do banco.
  insert into public.consents (profile_id, purpose, text_version)
  values (p_requester_id, 'lead_whatsapp_quote', v_version)
  returning id into v_consent;

  -- alfabeto: Crockford. O GUC só existe para testes de colisão (só service_role executa esta função).
  if v_alpha !~ '^[0-9A-HJKMNP-TV-Z]+$' then
    v_alpha := v_default_alpha;
  end if;
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := 'LC-';
    for i in 0 .. v_len - 1 loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % length(v_alpha)) + 1, 1);
    end loop;
    begin
      insert into public.leads (
        code, requester_id, cart_id, list_id, stationery_id, school_name, grade_label, school_year, municipality_id,
        neighborhood, item_count, expires_at, consent_id, consent_text_version, consented_at, idempotency_key, is_demo
      ) values (
        v_code, p_requester_id, p_cart_id, p_list_id, p_stationery_id, btrim(coalesce(p_school_name, '')), btrim(coalesce(p_grade_label, '')),
        p_school_year, p_municipality_id, v_nb, jsonb_array_length(p_items), now() + interval '7 days', v_consent, v_version, now(),
        p_idempotency_key, v_demo
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'leads_code_key' then
        raise;
      end if;
      v_fail := v_fail + 1;
      if v_fail % 10 = 0 then
        v_len := v_len + 1;
      end if;
      if v_len > 6 then
        raise exception 'não foi possível gerar um código único' using errcode = '54000', hint = 'limit_exceeded';
      end if;
    end;
  end loop;

  insert into public.lead_items (lead_id, position, name, item_key, quantity)
  select v_id, t.ord::integer, btrim(t.e ->> 'name'), lower(btrim(t.e ->> 'item_key')), (t.e ->> 'quantity')::integer
    from jsonb_array_elements(p_items) with ordinality as t (e, ord);

  insert into public.lead_events (lead_id, event_type, from_status, to_status, actor_role, actor_id, item_count)
  values (v_id, 'created', null, 'received', 'parent', p_requester_id, jsonb_array_length(p_items));

  lead_id := v_id; code := v_code; created := true;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_transition: única porta de mudança de status (matriz por ator, motivo, valor, prazo, expiração preguiçosa).
-- Lead vencido e não terminal vira `expired` (evento system) e a função DEVOLVE `expired` sem erro: um erro desfaria
-- a própria gravação; o repositório compara o status devolvido com o pedido.
-- ---------------------------------------------------------------------------
create function public.lead_transition(
  p_lead_id uuid,
  p_to public.lead_status,
  p_actor_id uuid,
  p_actor_role text,
  p_amount_cents integer default null,
  p_reason text default null
) returns public.lead_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads%rowtype;
  s_status public.stationery_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_from text;
  v_to text := p_to::text;
  v_open constant text[] := array['received', 'viewed', 'in_progress', 'quote_sent', 'awaiting_customer'];
  v_overdue boolean;
  v_allowed boolean;
  v_sub text := public.lead_jwt_sub();
begin
  if p_actor_role is null or p_actor_role not in ('parent', 'stationery', 'admin', 'system') then
    raise exception 'ator inválido' using errcode = '22023', hint = 'actor_invalid';
  end if;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  v_from := l.status::text;

  -- o ator precisa ser quem diz ser.
  if p_actor_role = 'parent' then
    if p_actor_id is null or l.requester_id is distinct from p_actor_id then
      raise exception 'ator não é o solicitante' using errcode = '42501', hint = 'forbidden';
    end if;
  elsif p_actor_role = 'stationery' then
    if p_actor_id is null or not exists (
      select 1 from public.stationery_members m where m.stationery_id = l.stationery_id and m.profile_id = p_actor_id
    ) then
      raise exception 'ator não é membro da papelaria do lead' using errcode = '42501', hint = 'forbidden';
    end if;
    select st.status into s_status from public.stationeries st where st.id = l.stationery_id;
    if s_status not in ('active', 'paused') then
      raise exception 'papelaria não pode operar leads em %', s_status using errcode = '23514', hint = 'stationery_unavailable';
    end if;
  elsif p_actor_role = 'admin' then
    if p_actor_id is null or not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin') then
      raise exception 'ator não é admin' using errcode = '42501', hint = 'forbidden';
    end if;
  else
    if p_actor_id is not null and not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'system') then
      raise exception 'ator não é system' using errcode = '42501', hint = 'forbidden';
    end if;
  end if;

  -- contrato único para "expirado": lead já `expired` (job ou outra transição) devolve `expired` sem erro e sem novo
  -- evento, igual à expiração preguiçosa; assim job x transição em paralelo dão o mesmo resultado em qualquer ordem.
  if v_from = 'expired' then
    return 'expired';
  end if;

  -- expiração preguiçosa: lead aberto e vencido é expirado por qualquer transição.
  v_overdue := v_from = any (v_open) and l.expires_at <= now();
  if v_overdue then
    perform public.lead_apply(l, 'expired', 'system', null, null, null);
    return 'expired';
  end if;

  -- matriz por ator.
  if p_actor_role = 'stationery' then
    v_allowed := (v_from = 'received' and v_to = 'viewed')
      or (v_from = any (v_open) and v_from <> v_to
          and v_to in ('in_progress', 'quote_sent', 'awaiting_customer', 'converted', 'declined'));
  elsif p_actor_role in ('parent', 'admin') then
    v_allowed := v_from = any (v_open) and v_to = 'cancelled';
  else
    v_allowed := false; -- system só expira lead vencido, tratado acima
  end if;
  if not v_allowed then
    raise exception 'transição % -> % não permitida para %', v_from, v_to, p_actor_role using errcode = '23514', hint = 'transition_not_allowed';
  end if;

  if length(coalesce(v_reason, '')) > 500 then
    raise exception 'motivo longo demais' using errcode = '22023', hint = 'invalid_input';
  end if;
  if v_to = 'declined' then
    if v_reason is null then
      raise exception 'motivo obrigatório para declined' using errcode = '22023', hint = 'reason_required';
    end if;
    if v_reason not in ('price', 'stock', 'no_reply', 'bought_elsewhere', 'other') then
      raise exception 'motivo inválido' using errcode = '22023', hint = 'invalid_input';
    end if;
  elsif v_to = 'cancelled' and p_actor_role = 'admin' and v_reason is null then
    raise exception 'motivo obrigatório para cancelamento pela equipe' using errcode = '22023', hint = 'reason_required';
  end if;

  -- valor opcional, só em quote_sent e converted, em centavos 1..10.000.000 (informado/declarado pela papelaria).
  if p_amount_cents is not null and (v_to not in ('quote_sent', 'converted') or p_amount_cents not between 1 and 10000000) then
    raise exception 'valor inválido' using errcode = '22023', hint = 'amount_invalid';
  end if;

  perform public.lead_apply(l, p_to, p_actor_role, p_actor_id, p_amount_cents, v_reason);
  return p_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_mark_viewed: a papelaria abriu o lead. Idempotente (received -> viewed uma vez; adiante, devolve o status).
-- ---------------------------------------------------------------------------
create function public.lead_mark_viewed(p_lead_id uuid, p_actor_id uuid) returns public.lead_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads%rowtype;
  s_status public.stationery_status;
  v_sub text := public.lead_jwt_sub();
begin
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.stationery_members m where m.stationery_id = l.stationery_id and m.profile_id = p_actor_id
  ) then
    raise exception 'ator não é membro da papelaria do lead' using errcode = '42501', hint = 'forbidden';
  end if;
  select st.status into s_status from public.stationeries st where st.id = l.stationery_id;
  if s_status not in ('active', 'paused') then
    raise exception 'papelaria não pode operar leads em %', s_status using errcode = '23514', hint = 'stationery_unavailable';
  end if;
  if l.status in ('received', 'viewed', 'in_progress', 'quote_sent', 'awaiting_customer') and l.expires_at <= now() then
    perform public.lead_apply(l, 'expired', 'system', null, null, null);
    return 'expired';
  end if;
  if l.status = 'received' then
    perform public.lead_apply(l, 'viewed', 'stationery', p_actor_id, null, null);
    return 'viewed';
  end if;
  return l.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_record_whatsapp_open: o solicitante abriu o wa.me. Evento `whatsapp_opened` (dedupe de 60 s), sem mudar status.
-- Devolve false quando deduplicado.
-- ---------------------------------------------------------------------------
create function public.lead_record_whatsapp_open(p_lead_id uuid, p_actor_id uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads%rowtype;
  v_sub text := public.lead_jwt_sub();
begin
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_actor_id is null or l.requester_id is distinct from p_actor_id then
    raise exception 'ator não é o solicitante' using errcode = '42501', hint = 'forbidden';
  end if;
  if l.status in ('converted', 'declined', 'expired', 'cancelled') then
    raise exception 'lead encerrado' using errcode = '23514', hint = 'invalid_state';
  end if;
  if l.expires_at <= now() then
    raise exception 'lead vencido' using errcode = '23514', hint = 'expired';
  end if;
  if exists (
    select 1 from public.lead_events e
     where e.lead_id = l.id and e.event_type = 'whatsapp_opened' and e.created_at > clock_timestamp() - interval '60 seconds'
  ) then
    return false;
  end if;
  insert into public.lead_events (lead_id, event_type, from_status, to_status, actor_role, actor_id)
  values (l.id, 'whatsapp_opened', l.status, l.status, 'parent', p_actor_id);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_expire_due: job de expiração (idempotente; for update skip locked). Devolve quantos expirou.
-- ---------------------------------------------------------------------------
create function public.lead_expire_due(p_limit integer default 500) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads%rowtype;
  v_n integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'limite inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  for l in
    select x.* from public.leads x
     where x.status in ('received', 'viewed', 'in_progress', 'quote_sent', 'awaiting_customer') and x.expires_at <= now()
     order by x.expires_at
     limit p_limit
     for update skip locked
  loop
    perform public.lead_apply(l, 'expired', 'system', null, null, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create trigger lead_items_no_update_delete before update or delete on public.lead_items
  for each row execute function public.lead_rows_block_mutation();
create trigger lead_items_no_truncate before truncate on public.lead_items
  for each statement execute function public.lead_rows_block_mutation();
create trigger lead_events_no_update_delete before update or delete on public.lead_events
  for each row execute function public.lead_rows_block_mutation();
create trigger lead_events_no_truncate before truncate on public.lead_events
  for each statement execute function public.lead_rows_block_mutation();

-- idempotency_key e consent_* ficam fora do audit_log, que é imutável.
create trigger leads_audit after insert or update or delete on public.leads
  for each row execute function public.audit_row_change('idempotency_key', 'consent_id', 'consent_text_version', 'consented_at');
alter table public.leads enable always trigger leads_audit;

-- ---------------------------------------------------------------------------
-- Grants (mínimos; RLS decide as linhas; escrita só pelas funções)
-- ---------------------------------------------------------------------------
revoke execute on function public.lead_rows_block_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.lead_apply(public.leads, public.lead_status, text, uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.lead_jwt_sub() from public, anon, authenticated, service_role;
revoke execute on function public.lead_neighborhood_key(text) from public, anon, authenticated, service_role;
revoke execute on function public.lead_create(uuid, uuid, uuid, uuid, text, text, integer, uuid, text, jsonb, text, uuid, boolean, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.lead_create(uuid, uuid, uuid, uuid, text, text, integer, uuid, text, jsonb, text, uuid, boolean, integer, integer)
  to service_role;
revoke execute on function public.lead_transition(uuid, public.lead_status, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.lead_transition(uuid, public.lead_status, uuid, text, integer, text) to service_role;
revoke execute on function public.lead_mark_viewed(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.lead_mark_viewed(uuid, uuid) to service_role;
revoke execute on function public.lead_record_whatsapp_open(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.lead_record_whatsapp_open(uuid, uuid) to service_role;
revoke execute on function public.lead_expire_due(integer) from public, anon, authenticated, service_role;
grant execute on function public.lead_expire_due(integer) to service_role;

revoke all on public.leads, public.lead_items, public.lead_events from public, anon, authenticated, service_role;
-- authenticated: sem requester_id, cart_id (ligaria leads do mesmo responsável), consent_* e idempotency_key (a papelaria
-- nunca identifica o responsável; o solicitante lê cart_id por service_role no repositório);
-- a RLS ainda restringe as linhas. Sem INSERT/UPDATE/DELETE/TRUNCATE para ninguém.
grant select (id, code, list_id, stationery_id, status, school_name, grade_label, school_year, municipality_id,
              neighborhood, item_count, expires_at, quoted_total_cents, quoted_at, declared_sale_cents, declared_at,
              close_reason, is_demo, created_at, updated_at)
  on public.leads to authenticated;
grant select on public.leads to service_role;
grant select on public.lead_items to authenticated, service_role;
-- lead_events: sem actor_id e sem reason (texto livre do admin ao cancelar por abuso não vai para a papelaria; leitura
-- do motivo por service_role).
grant select (id, lead_id, event_type, from_status, to_status, actor_role, amount_cents, item_count, created_at, updated_at)
  on public.lead_events to authenticated;
grant select on public.lead_events to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;
alter table public.lead_items enable row level security;
alter table public.lead_events enable row level security;

-- leads: anon sem política. Sem política de escrita para ninguém (só as funções escrevem).
-- o solicitante lê os próprios leads.
create policy leads_select_requester on public.leads
  for select to authenticated using (requester_id = (select auth.uid()));
-- membro da papelaria lê os leads da própria papelaria (em qualquer status da papelaria: o histórico fica).
create policy leads_select_member on public.leads
  for select to authenticated
  using (exists (select 1 from public.stationery_members m
                 where m.stationery_id = leads.stationery_id and m.profile_id = (select auth.uid())));
-- admin/system leem todos.
create policy leads_select_admin on public.leads
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- itens e eventos herdam a visibilidade do lead (a subconsulta passa pela RLS de leads do próprio usuário).
-- quem vê o lead vê seus itens.
create policy lead_items_select_via_lead on public.lead_items
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_items.lead_id));
-- quem vê o lead vê seus eventos.
create policy lead_events_select_via_lead on public.lead_events
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_events.lead_id));
