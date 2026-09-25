-- Reverte a 0600 (fora de supabase/migrations: não é aplicado pelo CLI). Não restaura órfãos demo anulados.
alter table public.list_versions drop constraint if exists list_versions_submission_id_fkey;
alter table public.list_submissions drop constraint if exists list_submissions_school_id_fkey;
alter table public.cart_items drop constraint if exists cart_items_list_item_id_fkey;
alter table public.leads drop constraint if exists leads_consent_id_fkey;
drop index if exists public.list_versions_submission_id_idx;
drop index if exists public.list_submissions_school_id_idx;
drop index if exists public.cart_items_list_item_id_idx;
drop index if exists public.leads_consent_id_idx;
