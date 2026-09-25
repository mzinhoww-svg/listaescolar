-- Checagem somente leitura da migration 0600 (S11): contagem de órfãos por FK entre trilhas.
-- Rodar no staging ANTES de aplicar a 0600. orphans_real > 0 em qualquer linha = não aplicar.
-- Demo: is_demo na própria linha (submissions, leads), no carrinho pai (cart_items) ou na lista (versions).
select 'list_versions.submission_id -> list_submissions' as fk,
       count(*) filter (where coalesce(sl.is_demo, false)) as orphans_demo,
       count(*) filter (where not coalesce(sl.is_demo, false)) as orphans_real
  from public.list_versions v
  left join public.school_lists sl on sl.id = v.list_id
 where v.submission_id is not null
   and not exists (select 1 from public.list_submissions s where s.id = v.submission_id)
union all
select 'list_submissions.school_id -> schools',
       count(*) filter (where s.is_demo),
       count(*) filter (where not s.is_demo)
  from public.list_submissions s
 where s.school_id is not null
   and not exists (select 1 from public.schools c where c.id = s.school_id)
union all
select 'cart_items.list_item_id -> list_items',
       count(*) filter (where coalesce(k.is_demo, false)),
       count(*) filter (where not coalesce(k.is_demo, false))
  from public.cart_items i
  left join public.carts k on k.id = i.cart_id
 where i.list_item_id is not null
   and not exists (select 1 from public.list_items li where li.id = i.list_item_id)
union all
select 'leads.consent_id -> consents',
       count(*) filter (where l.is_demo),
       count(*) filter (where not l.is_demo)
  from public.leads l
 where l.consent_id is not null
   and not exists (select 1 from public.consents c where c.id = l.consent_id);
