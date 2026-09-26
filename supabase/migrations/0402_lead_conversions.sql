-- 0402_lead_conversions: atribuição, conversão e contestação de lead (S22, trilha Comércio).
-- Três sinais de conversão: (1) declaração da papelaria — já existe, é `leads.status = 'converted'` (S14/0303),
-- não duplicado aqui; (2) confirmação do pai ("Você comprou?", App22) — `lead_purchase_confirmations`; (3) Pix pela
-- plataforma — SEM FONTE nesta fatia (a S21/0401 cobra a papelaria pelo LEAD, não registra o pagamento do pai à
-- papelaria; isso é escopo da S23/comissão). `lead_conversion_signals` devolve esse terceiro sinal sempre `false`,
-- documentado — não é dado inventado, é ausência de fonte (Ruling no ledger-comercio, seção S22).
-- Convertido = 2 de 3 sinais; a declaração isolada da papelaria (1 sinal) não basta.
-- Contestação da papelaria (`lead_disputes`): prazo de 72h da CRIAÇÃO do lead (leads.created_at), fuso America/Cuiaba
-- só para exibição (o prazo em si é um intervalo de tempo absoluto a partir de um timestamptz, sem ambiguidade de
-- fuso). Aceita: estorna o débito do lead no livro-razão via `public.billing_reverse_entry` (0401, já idempotente:
-- reversão de uma reversão não duplica). Avaliação do pai (`lead_reviews`): comentário livre passa por uma
-- heurística de dado pessoal (e-mail, sequência de dígitos tipo telefone/CPF) e é RECUSADO na escrita (não uma fila
-- de moderação — Ruling por tempo de fatia, ver ledger-comercio).
-- Escrita só pelas funções SECURITY DEFINER abaixo (EXECUTE só service_role); nenhuma tabela tem grant de
-- INSERT/UPDATE/DELETE para authenticated nem service_role. Erros com errcode + hint estáveis: forbidden, not_found,
-- invalid_input, invalid_state, already_disputed, dispute_expired, personal_data_rejected, reason_required.
-- Sem FK para tabelas de outras trilhas (ADR-004): lead_id/stationery_id apontam só para leads/stationeries
-- (trilha Comércio, já em main).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

-- lead_purchase_confirmations: pesquisa "Você comprou?" (App22). Uma resposta por lead; o pai pode mudar de
-- ideia (ex.: "ainda não" -> "comprei aqui"), por isso é mutável (upsert via função), não append-only.
create table public.lead_purchase_confirmations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete set null,
  answer text not null check (answer in ('bought_here', 'not_yet', 'bought_elsewhere')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lead_purchase_confirmations_actor_idx on public.lead_purchase_confirmations (actor_id);

-- lead_reviews: avaliação do pai sobre a papelaria (App23). Uma por lead; vocabulário de etiquetas fixo, conferido
-- na função de escrita (não em CHECK, para não precisar de migration nova a cada etiqueta nova).
create table public.lead_reviews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete restrict,
  stationery_id uuid not null references public.stationeries (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  comment text check (comment is null or (btrim(comment) <> '' and length(comment) <= 500)),
  status text not null default 'published' check (status in ('published', 'hidden')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lead_reviews_stationery_idx on public.lead_reviews (stationery_id, status, created_at desc);

-- lead_disputes: contestação da papelaria, prazo de 72h da entrega do lead. Uma disputa por lead (nunca reaberta).
create table public.lead_disputes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete restrict,
  stationery_id uuid not null references public.stationeries (id) on delete restrict,
  reason text not null check (reason in ('wrong_number', 'incomplete_list', 'duplicate', 'out_of_area')),
  detail text check (detail is null or (btrim(detail) <> '' and length(detail) <= 500)),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  deadline_at timestamptz not null,
  opened_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_reason text check (resolution_reason is null or length(resolution_reason) <= 500),
  -- SEM FK para credit_ledger de propósito: uma FK externa faria `TRUNCATE credit_ledger` falhar com 0A000 (regra do
  -- Postgres) em vez do 42501 do gatilho de imutabilidade da 0401 (teste `billing-ledger.test.ts`, S21) — o valor
  -- sempre vem do retorno de `billing_reverse_entry` (um id de `credit_ledger` real), garantido pela função abaixo.
  reversed_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open') = (resolved_at is null)),
  check (status <> 'rejected' or reversed_entry_id is null)
);
create index lead_disputes_stationery_idx on public.lead_disputes (stationery_id, status, created_at desc);
create index lead_disputes_open_deadline_idx on public.lead_disputes (deadline_at) where status = 'open';

-- ---------------------------------------------------------------------------
-- Guardas de imutabilidade e updated_at
-- ---------------------------------------------------------------------------
create trigger lead_purchase_confirmations_set_updated_at before update on public.lead_purchase_confirmations
  for each row execute function public.set_updated_at();
create trigger lead_reviews_set_updated_at before update on public.lead_reviews
  for each row execute function public.set_updated_at();

-- lead_disputes: só a transição open -> accepted|rejected, gravando resolved_at/resolved_by/resolution_reason/
-- reversed_entry_id; nada mais muda (inclusive para o dono do banco), nunca delete.
create function public.lead_dispute_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'lead_disputes é imutável (delete bloqueado)' using errcode = '42501';
  end if;
  if old.status = 'open' and new.status in ('accepted', 'rejected')
     and new.lead_id = old.lead_id and new.stationery_id = old.stationery_id
     and new.reason = old.reason and new.detail is not distinct from old.detail
     and new.deadline_at = old.deadline_at and new.opened_by is not distinct from old.opened_by
     and new.created_at = old.created_at and new.resolved_at is not null
     -- resolved_by pode ficar nulo (ator system, ex.: cron/rotina interna) — só resolved_at é obrigatório.
  then
    return new;
  end if;
  raise exception 'lead_disputes é imutável (só a transição open -> accepted|rejected, pela função lead_dispute_resolve)' using errcode = '42501';
end;
$$;
create trigger lead_disputes_guard before update or delete on public.lead_disputes
  for each row execute function public.lead_dispute_guard();
alter table public.lead_disputes enable always trigger lead_disputes_guard;

-- auditoria (append-only, já existe desde a 0001): sem colunas sensíveis a excluir aqui (nenhuma destas tabelas
-- guarda identificação do pai alem do actor_id, que já é excluído dos grants abaixo).
create trigger lead_purchase_confirmations_audit after insert or update on public.lead_purchase_confirmations
  for each row execute function public.audit_row_change();
alter table public.lead_purchase_confirmations enable always trigger lead_purchase_confirmations_audit;
create trigger lead_reviews_audit after insert or update on public.lead_reviews
  for each row execute function public.audit_row_change();
alter table public.lead_reviews enable always trigger lead_reviews_audit;
create trigger lead_disputes_audit after insert or update on public.lead_disputes
  for each row execute function public.audit_row_change();
alter table public.lead_disputes enable always trigger lead_disputes_audit;

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------
create function public.conversion_jwt_sub() returns text
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

-- Heurística de dado pessoal em texto livre (S22): e-mail, ou uma sequência de ao menos 8 dígitos com no máximo um
-- separador entre cada um (telefone, CPF, CEP colado). Não é um validador de PII completo; é a barreira mínima
-- combinada com o vocabulário de etiquetas fixo para cobrir "sem texto livre com dado pessoal" (Ruling, ver ledger).
create function public.lead_review_contains_personal_data(p_text text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
      or p_text ~ '([0-9][ .\-()]?){7,}[0-9]';
$$;

-- ---------------------------------------------------------------------------
-- lead_confirm_purchase: pesquisa "Você comprou?" (App22). Só o solicitante do lead; upsert idempotente.
-- ---------------------------------------------------------------------------
create function public.lead_confirm_purchase(p_lead_id uuid, p_actor_id uuid, p_answer text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads%rowtype;
  v_id uuid;
  v_sub text := public.conversion_jwt_sub();
begin
  if p_actor_id is null then
    raise exception 'ator ausente' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_answer not in ('bought_here', 'not_yet', 'bought_elsewhere') then
    raise exception 'resposta inválida' using errcode = '22023', hint = 'invalid_input';
  end if;

  select * into l from public.leads where id = p_lead_id;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if l.requester_id is distinct from p_actor_id then
    raise exception 'ator não é o solicitante do lead' using errcode = '42501', hint = 'forbidden';
  end if;

  insert into public.lead_purchase_confirmations (lead_id, actor_id, answer)
  values (p_lead_id, p_actor_id, p_answer)
  on conflict (lead_id) do update set answer = excluded.answer, actor_id = excluded.actor_id
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_conversion_signals: leitura pura dos 3 sinais e da regra 2 de 3. Não grava nada.
-- ---------------------------------------------------------------------------
create function public.lead_conversion_signals(p_lead_id uuid)
returns table (stationery_confirmed boolean, parent_confirmed boolean, pix_confirmed boolean, signal_count integer, confirmed boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status public.lead_status;
begin
  select status into v_status from public.leads where id = p_lead_id;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  stationery_confirmed := v_status = 'converted';
  parent_confirmed := exists (
    select 1 from public.lead_purchase_confirmations c where c.lead_id = p_lead_id and c.answer = 'bought_here'
  );
  pix_confirmed := false; -- sem fonte nesta fatia (S23); ver comentário no topo do arquivo.
  signal_count := (case when stationery_confirmed then 1 else 0 end)
                + (case when parent_confirmed then 1 else 0 end)
                + (case when pix_confirmed then 1 else 0 end);
  confirmed := signal_count >= 2;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_review_create: avaliação do pai (App23). Só o solicitante, uma vez por lead, sem dado pessoal no comentário.
-- ---------------------------------------------------------------------------
create function public.lead_review_create(p_lead_id uuid, p_actor_id uuid, p_rating integer, p_tags text[], p_comment text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads%rowtype;
  v_id uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_tags text[] := coalesce(p_tags, '{}');
  v_allowed constant text[] := array['entrega_rapida', 'bom_atendimento', 'preco_justo', 'estoque_completo', 'demorou_muito', 'sem_estoque'];
  v_sub text := public.conversion_jwt_sub();
  v_tag text;
begin
  if p_actor_id is null then
    raise exception 'ator ausente' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'nota inválida' using errcode = '22023', hint = 'invalid_input';
  end if;
  foreach v_tag in array v_tags loop
    if not (v_tag = any (v_allowed)) then
      raise exception 'etiqueta inválida: %', v_tag using errcode = '22023', hint = 'invalid_input';
    end if;
  end loop;
  if v_comment is not null then
    if length(v_comment) > 500 then
      raise exception 'comentário longo demais' using errcode = '22023', hint = 'invalid_input';
    end if;
    if public.lead_review_contains_personal_data(v_comment) then
      raise exception 'comentário com dado pessoal' using errcode = '22023', hint = 'personal_data_rejected';
    end if;
  end if;

  select * into l from public.leads where id = p_lead_id;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if l.requester_id is distinct from p_actor_id then
    raise exception 'ator não é o solicitante do lead' using errcode = '42501', hint = 'forbidden';
  end if;
  if exists (select 1 from public.lead_reviews r where r.lead_id = p_lead_id) then
    raise exception 'lead já avaliado' using errcode = '23514', hint = 'invalid_state';
  end if;

  insert into public.lead_reviews (lead_id, stationery_id, actor_id, rating, tags, comment, is_demo)
  values (p_lead_id, l.stationery_id, p_actor_id, p_rating, v_tags, v_comment, l.is_demo)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_dispute_open: contestação da papelaria, prazo de 72h da criação do lead.
-- ---------------------------------------------------------------------------
create function public.lead_dispute_open(p_lead_id uuid, p_actor_id uuid, p_reason text, p_detail text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads%rowtype;
  v_id uuid;
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  v_sub text := public.conversion_jwt_sub();
begin
  if p_actor_id is null then
    raise exception 'ator ausente' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_sub is not null and v_sub is distinct from p_actor_id::text then
    raise exception 'ator diferente do usuário autenticado' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_reason not in ('wrong_number', 'incomplete_list', 'duplicate', 'out_of_area') then
    raise exception 'motivo inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if v_detail is not null and length(v_detail) > 500 then
    raise exception 'detalhe longo demais' using errcode = '22023', hint = 'invalid_input';
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead não encontrado' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not exists (select 1 from public.stationery_members m where m.stationery_id = l.stationery_id and m.profile_id = p_actor_id) then
    raise exception 'ator não é membro da papelaria do lead' using errcode = '42501', hint = 'forbidden';
  end if;
  if now() > l.created_at + interval '72 hours' then
    raise exception 'prazo de 72h encerrado' using errcode = '23514', hint = 'dispute_expired';
  end if;
  if exists (select 1 from public.lead_disputes d where d.lead_id = p_lead_id) then
    raise exception 'lead já contestado' using errcode = '23514', hint = 'already_disputed';
  end if;

  insert into public.lead_disputes (lead_id, stationery_id, reason, detail, deadline_at, opened_by)
  values (p_lead_id, l.stationery_id, p_reason, v_detail, l.created_at + interval '72 hours', p_actor_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- lead_dispute_resolve: decisão do admin/system. Idempotente na decisão `accepted` (estorno único).
-- ---------------------------------------------------------------------------
create function public.lead_dispute_resolve(p_dispute_id uuid, p_actor_id uuid, p_actor_role text, p_decision text, p_resolution_reason text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.lead_disputes%rowtype;
  v_role public.user_role;
  v_reason text := nullif(btrim(coalesce(p_resolution_reason, '')), '');
  v_entry_id uuid;
  v_reversal_id uuid;
begin
  if p_actor_role is null or p_actor_role not in ('admin', 'system') then
    raise exception 'ator inválido' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_actor_role = 'admin' then
    if p_actor_id is null then
      raise exception 'ator ausente' using errcode = '42501', hint = 'forbidden';
    end if;
    select role into v_role from public.profiles where id = p_actor_id;
    if v_role is distinct from 'admin' then
      raise exception 'ator não é admin' using errcode = '42501', hint = 'forbidden';
    end if;
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'decisão inválida' using errcode = '22023', hint = 'invalid_input';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'motivo longo demais' using errcode = '22023', hint = 'invalid_input';
  end if;

  select * into d from public.lead_disputes where id = p_dispute_id for update;
  if not found then
    raise exception 'disputa não encontrada' using errcode = 'P0002', hint = 'not_found';
  end if;

  -- idempotência: mesma decisão já resolvida -> devolve sem gravar de novo (nenhum novo estorno).
  if d.status <> 'open' then
    if d.status = p_decision then
      return d.id;
    end if;
    raise exception 'disputa já resolvida com decisão diferente' using errcode = '23514', hint = 'invalid_state';
  end if;

  if p_decision = 'accepted' then
    select e.id into v_entry_id from public.credit_ledger e
     where e.lead_id = d.lead_id and e.entry_type in ('lead_debit', 'free_lead', 'pass_lead')
       and not exists (select 1 from public.credit_ledger r where r.reverses_entry_id = e.id)
     order by e.created_at limit 1;
    if v_entry_id is not null then
      v_reversal_id := public.billing_reverse_entry(v_entry_id, p_actor_id, p_actor_role, 'dispute:' || d.id::text);
    end if;
    update public.lead_disputes
       set status = 'accepted', resolved_at = now(), resolved_by = p_actor_id, resolution_reason = v_reason, reversed_entry_id = v_reversal_id
     where id = d.id;
  else
    update public.lead_disputes
       set status = 'rejected', resolved_at = now(), resolved_by = p_actor_id, resolution_reason = v_reason
     where id = d.id;
  end if;
  return d.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.conversion_jwt_sub() from public, anon, authenticated, service_role;
revoke execute on function public.lead_review_contains_personal_data(text) from public, anon, authenticated, service_role;

revoke execute on function public.lead_confirm_purchase(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.lead_confirm_purchase(uuid, uuid, text) to service_role;
revoke execute on function public.lead_conversion_signals(uuid) from public, anon, authenticated, service_role;
grant execute on function public.lead_conversion_signals(uuid) to service_role;
revoke execute on function public.lead_review_create(uuid, uuid, integer, text[], text) from public, anon, authenticated, service_role;
grant execute on function public.lead_review_create(uuid, uuid, integer, text[], text) to service_role;
revoke execute on function public.lead_dispute_open(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.lead_dispute_open(uuid, uuid, text, text) to service_role;
revoke execute on function public.lead_dispute_resolve(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.lead_dispute_resolve(uuid, uuid, text, text, text) to service_role;
revoke execute on function public.lead_dispute_guard() from public, anon, authenticated, service_role;

revoke all on public.lead_purchase_confirmations, public.lead_reviews, public.lead_disputes from public, anon, authenticated, service_role;

grant select (id, lead_id, answer, created_at, updated_at) on public.lead_purchase_confirmations to authenticated;
grant select on public.lead_purchase_confirmations to service_role;

grant select (id, lead_id, stationery_id, rating, tags, comment, status, created_at) on public.lead_reviews to anon, authenticated;
grant select on public.lead_reviews to service_role;

grant select (id, lead_id, stationery_id, reason, detail, status, deadline_at, resolved_at, resolution_reason, created_at, updated_at)
  on public.lead_disputes to authenticated;
grant select on public.lead_disputes to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lead_purchase_confirmations enable row level security;
alter table public.lead_reviews enable row level security;
alter table public.lead_disputes enable row level security;

-- lead_purchase_confirmations: o pai lê a própria confirmação (via lead_id, sem expor actor_id); a papelaria do
-- lead lê o sinal (é isso e nada mais que ela ganha desta fatia); admin/system leem tudo (authenticated).
create policy lead_purchase_confirmations_select_requester on public.lead_purchase_confirmations
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_purchase_confirmations.lead_id and l.requester_id = (select auth.uid())));
create policy lead_purchase_confirmations_select_member on public.lead_purchase_confirmations
  for select to authenticated
  using (exists (
    select 1 from public.leads l join public.stationery_members m on m.stationery_id = l.stationery_id
     where l.id = lead_purchase_confirmations.lead_id and m.profile_id = (select auth.uid())
  ));
create policy lead_purchase_confirmations_select_admin on public.lead_purchase_confirmations
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- lead_reviews: publicadas são públicas (perfil da papelaria, S13); a papelaria e o admin veem também as ocultas
-- das próprias avaliações (auditoria); o autor não precisa de política extra (já lê pela publicada, se pública).
create policy lead_reviews_select_published on public.lead_reviews
  for select to anon, authenticated using (status = 'published');
create policy lead_reviews_select_member on public.lead_reviews
  for select to authenticated
  using (exists (select 1 from public.stationery_members m where m.stationery_id = lead_reviews.stationery_id and m.profile_id = (select auth.uid())));
create policy lead_reviews_select_admin on public.lead_reviews
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));

-- lead_disputes: a papelaria do lead lê as próprias disputas; admin/system leem tudo.
create policy lead_disputes_select_member on public.lead_disputes
  for select to authenticated
  using (exists (select 1 from public.stationery_members m where m.stationery_id = lead_disputes.stationery_id and m.profile_id = (select auth.uid())));
create policy lead_disputes_select_admin on public.lead_disputes
  for select to authenticated using ((select public.auth_role()) in ('admin', 'system'));
