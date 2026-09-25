-- S11 · FKs entre as trilhas Dados (01xx), Pipeline (02xx) e Comércio (03xx) (ADR-004, itens 2 e 9).
-- Colunas que nasceram como uuid solto ganham FK. Cada FK entra `not valid` e é validada em seguida.
-- Órfão demo em coluna anulável vira null; qualquer órfão real ABORTA a migration (nada é apagado nem corrigido).
-- Fora do escopo (polimórficas/históricas, sem FK): carts.list_id, leads.list_id, ai_decisions.*, *_events.actor_id,
-- list_versions.approved_by, claims.decided_by. Rollback: supabase/rollback/0600_cross_track_fks.down.sql.

do $$
declare
  v_ver_demo int; v_ver_real int;
  v_sub_demo int; v_sub_real int;
  v_cit_demo int; v_cit_real int;
  v_led_demo int; v_led_real int;
  v_msg text := '';
begin
  select count(*) filter (where coalesce(sl.is_demo, false)), count(*) filter (where not coalesce(sl.is_demo, false))
    into v_ver_demo, v_ver_real
    from public.list_versions v left join public.school_lists sl on sl.id = v.list_id
   where v.submission_id is not null
     and not exists (select 1 from public.list_submissions s where s.id = v.submission_id);
  select count(*) filter (where s.is_demo), count(*) filter (where not s.is_demo)
    into v_sub_demo, v_sub_real
    from public.list_submissions s
   where s.school_id is not null and not exists (select 1 from public.schools c where c.id = s.school_id);
  select count(*) filter (where coalesce(k.is_demo, false)), count(*) filter (where not coalesce(k.is_demo, false))
    into v_cit_demo, v_cit_real
    from public.cart_items i left join public.carts k on k.id = i.cart_id
   where i.list_item_id is not null and not exists (select 1 from public.list_items li where li.id = i.list_item_id);
  select count(*) filter (where l.is_demo), count(*) filter (where not l.is_demo)
    into v_led_demo, v_led_real
    from public.leads l
   where l.consent_id is not null and not exists (select 1 from public.consents c where c.id = l.consent_id);

  if v_ver_real + v_sub_real + v_cit_real + v_led_real > 0 then
    if v_ver_real > 0 then v_msg := v_msg || format(' list_versions.submission_id=%s', v_ver_real); end if;
    if v_sub_real > 0 then v_msg := v_msg || format(' list_submissions.school_id=%s', v_sub_real); end if;
    if v_cit_real > 0 then v_msg := v_msg || format(' cart_items.list_item_id=%s', v_cit_real); end if;
    if v_led_real > 0 then v_msg := v_msg || format(' leads.consent_id=%s', v_led_real); end if;
    raise exception '0600 abortada: órfãos não demo por FK:%', v_msg
      using errcode = '23503', hint = 'rodar supabase/checks/0600_orphans.sql e investigar; a migration não corrige dado real';
  end if;

  update public.list_versions v set submission_id = null
   where v.submission_id is not null and not exists (select 1 from public.list_submissions s where s.id = v.submission_id);
  update public.list_submissions s set school_id = null
   where s.school_id is not null and not exists (select 1 from public.schools c where c.id = s.school_id);
  update public.cart_items i set list_item_id = null
   where i.list_item_id is not null and not exists (select 1 from public.list_items li where li.id = i.list_item_id);
  update public.leads l set consent_id = null
   where l.consent_id is not null and not exists (select 1 from public.consents c where c.id = l.consent_id);

  raise notice '0600: órfãos demo anulados: list_versions.submission_id=%, list_submissions.school_id=%, cart_items.list_item_id=%, leads.consent_id=%',
    v_ver_demo, v_sub_demo, v_cit_demo, v_led_demo;
end;
$$;

-- Índices de apoio (o lado que referencia). O rollback remove estes quatro.
create index if not exists list_versions_submission_id_idx on public.list_versions (submission_id) where submission_id is not null;
create index if not exists list_submissions_school_id_idx on public.list_submissions (school_id) where school_id is not null;
create index if not exists cart_items_list_item_id_idx on public.cart_items (list_item_id) where list_item_id is not null;
create index if not exists leads_consent_id_idx on public.leads (consent_id) where consent_id is not null;

alter table public.list_versions
  add constraint list_versions_submission_id_fkey foreign key (submission_id) references public.list_submissions (id) on delete set null not valid;
alter table public.list_versions validate constraint list_versions_submission_id_fkey;
comment on constraint list_versions_submission_id_fkey on public.list_versions is
  'set null: a versão oficial sobrevive à exclusão da conta do remetente (cascata de profiles).';

alter table public.list_submissions
  add constraint list_submissions_school_id_fkey foreign key (school_id) references public.schools (id) on delete restrict not valid;
alter table public.list_submissions validate constraint list_submissions_school_id_fkey;
comment on constraint list_submissions_school_id_fkey on public.list_submissions is
  'restrict: escolas não são apagadas; apagar escola com envio é erro.';

alter table public.cart_items
  add constraint cart_items_list_item_id_fkey foreign key (list_item_id) references public.list_items (id) on delete set null not valid;
alter table public.cart_items validate constraint cart_items_list_item_id_fkey;
comment on constraint cart_items_list_item_id_fkey on public.cart_items is
  'set null: itens de versão publicada são imutáveis; o carrinho guarda nome e quantidade próprios.';

alter table public.leads
  add constraint leads_consent_id_fkey foreign key (consent_id) references public.consents (id) on delete set null not valid;
alter table public.leads validate constraint leads_consent_id_fkey;
comment on constraint leads_consent_id_fkey on public.leads is
  'set null: consents cascateia na exclusão de conta; o lead e o rastro de cobrança ficam (S14).';
