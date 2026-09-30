-- 0804_s29_audit_actor (S29 · UX-108): a trilha de auditoria passa a dizer QUEM da equipe decidiu.
--
-- Problema: as decisões da equipe rodam por `createAdminClient()` (chave secreta, sem sessão de usuário), então
-- `audit_row_change` gravava `auth.uid()` = null e ator "system". As funções de decisão já recebem `p_actor_id` e
-- conferem que ele é admin; faltava levá-lo até o gatilho.
--
-- Desenho (aditivo; nenhuma linha de audit_log é reescrita; audit_log segue append-only):
--  * `audit_trusted_context()`: só é verdadeiro para chamada com JWT service_role E role de banco service_role
--    (mesma regra de `auth_role()`); sessão anon/authenticated nunca é confiável.
--  * `audit_set_actor(uuid)`: SECURITY DEFINER, só service_role. Confere que o id é um profile com role admin/system e
--    grava `app.actor_id` LOCAL À TRANSAÇÃO; id inválido, de outro papel ou contexto não confiável limpa o ajuste
--    e devolve false (o ator segue "system"). Nunca lança erro: a autorização da decisão é da função de decisão.
--  * `audit_row_change`: `auth.uid()` continua prevalecendo. Sem ele, usa `app.actor_id` SÓ em contexto confiável e SÓ
--    se o profile ainda for admin/system (revalida no gatilho); grava o role real do profile em `actor_role`.
--  * As 17 funções de decisão são renomeadas para `<nome>__core` (sem EXECUTE para ninguém; só o dono chama) e
--    recriadas com a MESMA assinatura como invólucros SECURITY DEFINER que chamam `audit_set_actor(p_actor_id)`,
--    executam o núcleo e restauram o ajuste anterior (chamadas encadeadas mantêm o ator externo). Corpo e regras de negócio do núcleo não mudam.
-- Ator "owner" (dono da papelaria) não é admin/system: continua sem atribuição (registro "system"), ver Ruling.

create function public.audit_trusted_context() returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  jwt_role text;
begin
  begin
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    jwt_role := null;
  end;
  return jwt_role = 'service_role' and current_setting('role') = 'service_role';
end;
$$;

revoke execute on function public.audit_trusted_context() from public, anon, authenticated, service_role;

create function public.audit_set_actor(p_actor uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is not null and public.audit_trusted_context()
     and exists (select 1 from public.profiles p where p.id = p_actor and p.role in ('admin', 'system')) then
    perform pg_catalog.set_config('app.actor_id', p_actor::text, true);
    return true;
  end if;
  perform pg_catalog.set_config('app.actor_id', '', true);
  return false;
end;
$$;

revoke execute on function public.audit_set_actor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.audit_set_actor(uuid) to service_role;

-- Corpo igual ao da 0601 (pepper do GUC ou do Vault); muda só a origem do ator.
create or replace function public.audit_row_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  fwd text;
  ip text;
  hashed text;
  pepper text := nullif(current_setting('app.audit_ip_pepper', true), '');
  i int;
  v_actor uuid := auth.uid();
  v_role text;
  v_claimed uuid;
begin
  -- colunas sensíveis (argumentos do trigger) nunca entram no audit_log, que é imutável.
  for i in 0 .. tg_nargs - 1 loop
    old_j := old_j - tg_argv[i];
    new_j := new_j - tg_argv[i];
  end loop;

  begin
    fwd := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then
    fwd := null;
  end;
  -- último valor: o acrescentado pelo proxy confiável (o primeiro é forjável pelo cliente).
  ip := nullif(btrim((string_to_array(coalesce(fwd, ''), ','))[cardinality(string_to_array(coalesce(fwd, ''), ','))]), '');
  -- o hospedado não permite o GUC no banco: o pepper vem do Vault (só lido quando há IP e o GUC não existe; D-059).
  if ip is not null and pepper is null then
    begin
      pepper := nullif((select decrypted_secret from vault.decrypted_secrets where name = 'audit_ip_pepper'), '');
    exception when others then
      pepper := null;
    end;
  end if;
  -- sem pepper não há hash (sha256 puro de IPv4 é reversível por força bruta).
  if ip is not null and pepper is not null then
    hashed := encode(sha256(convert_to(ip || pepper, 'utf8')), 'hex');
  end if;

  if v_actor is not null then
    v_role := public.auth_role()::text;
  else
    -- ator da equipe informado por uma função de decisão (audit_set_actor): só vale em contexto service_role e
    -- se o profile for admin/system agora. Qualquer outra coisa segue como "system".
    v_role := public.auth_role()::text;
    begin
      v_claimed := nullif(current_setting('app.actor_id', true), '')::uuid;
    exception when others then
      v_claimed := null;
    end;
    if v_claimed is not null and public.audit_trusted_context() then
      select p.role::text into v_role from public.profiles p where p.id = v_claimed and p.role in ('admin', 'system');
      if found then
        v_actor := v_claimed;
      else
        v_role := public.auth_role()::text;
      end if;
    end if;
  end if;

  insert into public.audit_log (action, entity_table, entity_id, before, after, actor_id, actor_role, ip_hash,
                                created_at, updated_at)
  values (
    tg_op, tg_table_name,
    coalesce(new_j ->> 'id', old_j ->> 'id')::uuid,
    old_j, new_j,
    v_actor, v_role, hashed,
    clock_timestamp(), clock_timestamp()
  );
  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated, service_role;

-- stationery_transition
alter function public.stationery_transition(uuid, public.stationery_status, uuid, text, text) rename to stationery_transition__core;
revoke execute on function public.stationery_transition__core(uuid, public.stationery_status, uuid, text, text) from public, anon, authenticated, service_role;

create function public.stationery_transition(p_id uuid, p_to public.stationery_status, p_actor_id uuid, p_actor_role text, p_reason text default null)
returns public.stationery_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result public.stationery_status;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.stationery_transition__core(p_id, p_to, p_actor_id, p_actor_role, p_reason);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.stationery_transition(uuid, public.stationery_status, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.stationery_transition(uuid, public.stationery_status, uuid, text, text) to service_role;

comment on function public.stationery_transition(uuid, public.stationery_status, uuid, text, text) is 'S29 (UX-108): invólucro de stationery_transition; grava o ator da equipe na auditoria e chama stationery_transition__core.';
comment on function public.stationery_transition__core(uuid, public.stationery_status, uuid, text, text) is 'Interno (S29): núcleo de stationery_transition; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- lead_dispute_resolve
alter function public.lead_dispute_resolve(uuid, uuid, text, text, text) rename to lead_dispute_resolve__core;
revoke execute on function public.lead_dispute_resolve__core(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

create function public.lead_dispute_resolve(p_dispute_id uuid, p_actor_id uuid, p_actor_role text, p_decision text, p_resolution_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result uuid;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.lead_dispute_resolve__core(p_dispute_id, p_actor_id, p_actor_role, p_decision, p_resolution_reason);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.lead_dispute_resolve(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.lead_dispute_resolve(uuid, uuid, text, text, text) to service_role;

comment on function public.lead_dispute_resolve(uuid, uuid, text, text, text) is 'S29 (UX-108): invólucro de lead_dispute_resolve; grava o ator da equipe na auditoria e chama lead_dispute_resolve__core.';
comment on function public.lead_dispute_resolve__core(uuid, uuid, text, text, text) is 'Interno (S29): núcleo de lead_dispute_resolve; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- claim_decide
alter function public.claim_decide(uuid, public.claim_status, uuid, text) rename to claim_decide__core;
revoke execute on function public.claim_decide__core(uuid, public.claim_status, uuid, text) from public, anon, authenticated, service_role;

create function public.claim_decide(p_claim_id uuid, p_to public.claim_status, p_actor_id uuid, p_reason text)
returns public.claim_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result public.claim_status;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.claim_decide__core(p_claim_id, p_to, p_actor_id, p_reason);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.claim_decide(uuid, public.claim_status, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_decide(uuid, public.claim_status, uuid, text) to service_role;

comment on function public.claim_decide(uuid, public.claim_status, uuid, text) is 'S29 (UX-108): invólucro de claim_decide; grava o ator da equipe na auditoria e chama claim_decide__core.';
comment on function public.claim_decide__core(uuid, public.claim_status, uuid, text) is 'Interno (S29): núcleo de claim_decide; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- review_approve
alter function public.review_approve(uuid, uuid, integer, jsonb) rename to review_approve__core;
revoke execute on function public.review_approve__core(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;

create function public.review_approve(p_submission_id uuid, p_actor_id uuid, p_expected_version integer, p_reasons jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result text;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.review_approve__core(p_submission_id, p_actor_id, p_expected_version, p_reasons);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.review_approve(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.review_approve(uuid, uuid, integer, jsonb) to service_role;

comment on function public.review_approve(uuid, uuid, integer, jsonb) is 'S10: aprovação humana (human_review -> approved) com linha review/approved.';
comment on function public.review_approve__core(uuid, uuid, integer, jsonb) is 'Interno (S29): núcleo de review_approve; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- review_reject
alter function public.review_reject(uuid, uuid, integer, text) rename to review_reject__core;
revoke execute on function public.review_reject__core(uuid, uuid, integer, text) from public, anon, authenticated, service_role;

create function public.review_reject(p_submission_id uuid, p_actor_id uuid, p_expected_version integer, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result text;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.review_reject__core(p_submission_id, p_actor_id, p_expected_version, p_reason);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.review_reject(uuid, uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.review_reject(uuid, uuid, integer, text) to service_role;

comment on function public.review_reject(uuid, uuid, integer, text) is 'S10: recusa humana com motivo de lista fechada (human_review -> rejected).';
comment on function public.review_reject__core(uuid, uuid, integer, text) is 'Interno (S29): núcleo de review_reject; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- list_transition
alter function public.list_transition(uuid, public.list_status, uuid, text) rename to list_transition__core;
revoke execute on function public.list_transition__core(uuid, public.list_status, uuid, text) from public, anon, authenticated, service_role;

create function public.list_transition(p_list_id uuid, p_to public.list_status, p_actor_id uuid, p_reason text default null)
returns public.list_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result public.list_status;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.list_transition__core(p_list_id, p_to, p_actor_id, p_reason);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.list_transition(uuid, public.list_status, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.list_transition(uuid, public.list_status, uuid, text) to service_role;

comment on function public.list_transition(uuid, public.list_status, uuid, text) is 'S29 (UX-108): invólucro de list_transition; grava o ator da equipe na auditoria e chama list_transition__core.';
comment on function public.list_transition__core(uuid, public.list_status, uuid, text) is 'Interno (S29): núcleo de list_transition; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- list_publish_version
alter function public.list_publish_version(uuid, uuid, uuid) rename to list_publish_version__core;
revoke execute on function public.list_publish_version__core(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create function public.list_publish_version(p_list_id uuid, p_version_id uuid, p_actor_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result integer;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.list_publish_version__core(p_list_id, p_version_id, p_actor_id);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.list_publish_version(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_publish_version(uuid, uuid, uuid) to service_role;

comment on function public.list_publish_version(uuid, uuid, uuid) is 'S29 (UX-108): invólucro de list_publish_version; grava o ator da equipe na auditoria e chama list_publish_version__core.';
comment on function public.list_publish_version__core(uuid, uuid, uuid) is 'Interno (S29): núcleo de list_publish_version; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- list_approve_version
alter function public.list_approve_version(uuid, uuid, uuid) rename to list_approve_version__core;
revoke execute on function public.list_approve_version__core(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create function public.list_approve_version(p_list_id uuid, p_version_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
begin
  perform public.audit_set_actor(p_actor_id);
  perform public.list_approve_version__core(p_list_id, p_version_id, p_actor_id);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return;
end;
$$;

revoke execute on function public.list_approve_version(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_approve_version(uuid, uuid, uuid) to service_role;

comment on function public.list_approve_version(uuid, uuid, uuid) is 'S29 (UX-108): invólucro de list_approve_version; grava o ator da equipe na auditoria e chama list_approve_version__core.';
comment on function public.list_approve_version__core(uuid, uuid, uuid) is 'Interno (S29): núcleo de list_approve_version; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- b2b_partner_decide
alter function public.b2b_partner_decide(uuid, uuid, text, jsonb) rename to b2b_partner_decide__core;
revoke execute on function public.b2b_partner_decide__core(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;

create function public.b2b_partner_decide(p_partner_id uuid, p_actor_id uuid, p_to text, p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result text;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.b2b_partner_decide__core(p_partner_id, p_actor_id, p_to, p_payload);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.b2b_partner_decide(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.b2b_partner_decide(uuid, uuid, text, jsonb) to service_role;

comment on function public.b2b_partner_decide(uuid, uuid, text, jsonb) is 'S29 (UX-108): invólucro de b2b_partner_decide; grava o ator da equipe na auditoria e chama b2b_partner_decide__core.';
comment on function public.b2b_partner_decide__core(uuid, uuid, text, jsonb) is 'Interno (S29): núcleo de b2b_partner_decide; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- b2b_campaign_transition
alter function public.b2b_campaign_transition(uuid, uuid, text, text) rename to b2b_campaign_transition__core;
revoke execute on function public.b2b_campaign_transition__core(uuid, uuid, text, text) from public, anon, authenticated, service_role;

create function public.b2b_campaign_transition(p_actor_id uuid, p_campaign_id uuid, p_to text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result text;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.b2b_campaign_transition__core(p_actor_id, p_campaign_id, p_to, p_reason);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.b2b_campaign_transition(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.b2b_campaign_transition(uuid, uuid, text, text) to service_role;

comment on function public.b2b_campaign_transition(uuid, uuid, text, text) is 'S29 (UX-108): invólucro de b2b_campaign_transition; grava o ator da equipe na auditoria e chama b2b_campaign_transition__core.';
comment on function public.b2b_campaign_transition__core(uuid, uuid, text, text) is 'Interno (S29): núcleo de b2b_campaign_transition; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- billing_plan_publish
alter function public.billing_plan_publish(uuid, jsonb) rename to billing_plan_publish__core;
revoke execute on function public.billing_plan_publish__core(uuid, jsonb) from public, anon, authenticated, service_role;

create function public.billing_plan_publish(p_actor_id uuid, p_plan jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result uuid;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.billing_plan_publish__core(p_actor_id, p_plan);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.billing_plan_publish(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.billing_plan_publish(uuid, jsonb) to service_role;

comment on function public.billing_plan_publish(uuid, jsonb) is 'S29 (UX-108): invólucro de billing_plan_publish; grava o ator da equipe na auditoria e chama billing_plan_publish__core.';
comment on function public.billing_plan_publish__core(uuid, jsonb) is 'Interno (S29): núcleo de billing_plan_publish; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- payout_settings_publish
alter function public.payout_settings_publish(uuid, integer, integer, integer) rename to payout_settings_publish__core;
revoke execute on function public.payout_settings_publish__core(uuid, integer, integer, integer) from public, anon, authenticated, service_role;

create function public.payout_settings_publish(p_actor_id uuid, p_commission_bps integer, p_grace_days integer, p_block_days integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result uuid;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.payout_settings_publish__core(p_actor_id, p_commission_bps, p_grace_days, p_block_days);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.payout_settings_publish(uuid, integer, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.payout_settings_publish(uuid, integer, integer, integer) to service_role;

comment on function public.payout_settings_publish(uuid, integer, integer, integer) is 'S29 (UX-108): invólucro de payout_settings_publish; grava o ator da equipe na auditoria e chama payout_settings_publish__core.';
comment on function public.payout_settings_publish__core(uuid, integer, integer, integer) is 'Interno (S29): núcleo de payout_settings_publish; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- billing_reverse_entry
alter function public.billing_reverse_entry(uuid, uuid, text, text) rename to billing_reverse_entry__core;
revoke execute on function public.billing_reverse_entry__core(uuid, uuid, text, text) from public, anon, authenticated, service_role;

create function public.billing_reverse_entry(p_entry_id uuid, p_actor_id uuid, p_actor_role text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result uuid;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.billing_reverse_entry__core(p_entry_id, p_actor_id, p_actor_role, p_reason);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.billing_reverse_entry(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.billing_reverse_entry(uuid, uuid, text, text) to service_role;

comment on function public.billing_reverse_entry(uuid, uuid, text, text) is 'S29 (UX-108): invólucro de billing_reverse_entry; grava o ator da equipe na auditoria e chama billing_reverse_entry__core.';
comment on function public.billing_reverse_entry__core(uuid, uuid, text, text) is 'Interno (S29): núcleo de billing_reverse_entry; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- payout_reverse_entry
alter function public.payout_reverse_entry(uuid, uuid, text) rename to payout_reverse_entry__core;
revoke execute on function public.payout_reverse_entry__core(uuid, uuid, text) from public, anon, authenticated, service_role;

create function public.payout_reverse_entry(p_entry_id uuid, p_actor_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result uuid;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.payout_reverse_entry__core(p_entry_id, p_actor_id, p_reason);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.payout_reverse_entry(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.payout_reverse_entry(uuid, uuid, text) to service_role;

comment on function public.payout_reverse_entry(uuid, uuid, text) is 'S29 (UX-108): invólucro de payout_reverse_entry; grava o ator da equipe na auditoria e chama payout_reverse_entry__core.';
comment on function public.payout_reverse_entry__core(uuid, uuid, text) is 'Interno (S29): núcleo de payout_reverse_entry; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- payout_batch_create
alter function public.payout_batch_create(uuid, uuid, text) rename to payout_batch_create__core;
revoke execute on function public.payout_batch_create__core(uuid, uuid, text) from public, anon, authenticated, service_role;

create function public.payout_batch_create(p_actor_id uuid, p_school_id uuid, p_beneficiary_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result uuid;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.payout_batch_create__core(p_actor_id, p_school_id, p_beneficiary_type);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.payout_batch_create(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.payout_batch_create(uuid, uuid, text) to service_role;

comment on function public.payout_batch_create(uuid, uuid, text) is 'S29 (UX-108): invólucro de payout_batch_create; grava o ator da equipe na auditoria e chama payout_batch_create__core.';
comment on function public.payout_batch_create__core(uuid, uuid, text) is 'Interno (S29): núcleo de payout_batch_create; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- payout_batch_mark_executed
alter function public.payout_batch_mark_executed(uuid, uuid) rename to payout_batch_mark_executed__core;
revoke execute on function public.payout_batch_mark_executed__core(uuid, uuid) from public, anon, authenticated, service_role;

create function public.payout_batch_mark_executed(p_actor_id uuid, p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result uuid;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.payout_batch_mark_executed__core(p_actor_id, p_batch_id);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.payout_batch_mark_executed(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.payout_batch_mark_executed(uuid, uuid) to service_role;

comment on function public.payout_batch_mark_executed(uuid, uuid) is 'S29 (UX-108): invólucro de payout_batch_mark_executed; grava o ator da equipe na auditoria e chama payout_batch_mark_executed__core.';
comment on function public.payout_batch_mark_executed__core(uuid, uuid) is 'Interno (S29): núcleo de payout_batch_mark_executed; só o invólucro chama (sem EXECUTE para os papéis da API).';

-- payout_admin_validate_sale
alter function public.payout_admin_validate_sale(uuid, uuid, uuid) rename to payout_admin_validate_sale__core;
revoke execute on function public.payout_admin_validate_sale__core(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create function public.payout_admin_validate_sale(p_actor_id uuid, p_lead_id uuid, p_school_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
  v_result uuid;
begin
  perform public.audit_set_actor(p_actor_id);
  v_result := public.payout_admin_validate_sale__core(p_actor_id, p_lead_id, p_school_id);
  -- restaura o ajuste anterior (chamada encadeada mantém o ator da função externa).
  perform pg_catalog.set_config('app.actor_id', coalesce(v_prev, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.payout_admin_validate_sale(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.payout_admin_validate_sale(uuid, uuid, uuid) to service_role;

comment on function public.payout_admin_validate_sale(uuid, uuid, uuid) is 'S29 (UX-108): invólucro de payout_admin_validate_sale; grava o ator da equipe na auditoria e chama payout_admin_validate_sale__core.';
comment on function public.payout_admin_validate_sale__core(uuid, uuid, uuid) is 'Interno (S29): núcleo de payout_admin_validate_sale; só o invólucro chama (sem EXECUTE para os papéis da API).';

