-- S28 (M02) · Custo de IA por lista: uso real informado pelo provedor, taxa de câmbio do operador e leitura agregada.
--
-- Aditiva. Nada é inventado:
--  * `ai_decisions` ganha tokens e custo em micros de dólar (1 US$ = 1.000.000 micros), todos NULOS quando o provedor não
--    informou; zero informado (grátis) é diferente de desconhecido (nulo). `ai_decisions` continua append-only: só
--    `ADD COLUMN`, o gatilho de imutabilidade bloqueia `update`/`delete`.
--  * `ai_settings.usd_brl_rate` é dado do operador (nunca do código, nunca de um preço de modelo); nulo = "BRL
--    indisponível" no relatório. Só administrador atualiza (política e grant da 0202, inalterados).
--  * `public.ai_record_decision(jsonb)` é recriada com a MESMA assinatura e quatro chaves opcionais novas no JSON
--    (compatível com quem não as envia). Continua SECURITY DEFINER, `search_path = ''`, EXECUTE só do service_role.
--  * `public.ai_cost_per_entity` (view `security_invoker`) soma por entidade e devolve `unknown_cost_rows`, para que um
--    custo parcial nunca apareça como total. Herda a política de leitura de `ai_decisions` (admin e system).

alter table public.ai_decisions
  add column prompt_tokens int check (prompt_tokens is null or prompt_tokens >= 0),
  add column completion_tokens int check (completion_tokens is null or completion_tokens >= 0),
  add column total_tokens int check (total_tokens is null or total_tokens >= 0),
  add column provider_cost_usd_micros bigint check (provider_cost_usd_micros is null or provider_cost_usd_micros >= 0);

alter table public.ai_settings
  add column usd_brl_rate numeric(8, 4) check (usd_brl_rate is null or usd_brl_rate > 0);

comment on column public.ai_decisions.provider_cost_usd_micros is
  'S28: custo em micros de dólar devolvido pelo provedor; nulo = não informado (nunca zero fictício).';
comment on column public.ai_settings.usd_brl_rate is
  'S28: taxa BRL por USD informada pelo operador; nula = conversão para reais indisponível.';

-- ---------------------------------------------------------------------------
-- ai_record_decision: corpo da 0203 + tokens e custo opcionais (mesma assinatura).
-- ---------------------------------------------------------------------------
create or replace function public.ai_record_decision(p_decision jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'entity_type', 'entity_id', 'kind', 'provider', 'model', 'prompt_key', 'prompt_version', 'pipeline_version',
    'overall_score', 'item_scores', 'alerts', 'decision', 'justification', 'actor_id', 'previous_version_id',
    'new_version_id', 'attempt', 'started_at', 'finished_at', 'latency_ms',
    'prompt_tokens', 'completion_tokens', 'total_tokens', 'provider_cost_usd_micros'
  ];
  required constant text[] := array[
    'entity_type', 'entity_id', 'kind', 'provider', 'model', 'prompt_key', 'prompt_version', 'pipeline_version', 'decision'
  ];
  k text;
  new_id uuid;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'decisão inválida: esperado objeto' using errcode = '22023';
  end if;
  if octet_length(p_decision::text) > 100000 then
    raise exception 'decisão inválida: JSON grande demais' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_decision) loop
    if not (k = any (allowed)) then
      raise exception 'decisão inválida: campo não permitido' using errcode = '22023';
    end if;
  end loop;
  -- publication nunca entra por aqui: pularia a transição do envio (use publication_record_verdict/complete/fail).
  if p_decision ->> 'kind' is distinct from 'extraction' then
    raise exception 'decisão inválida: só kind extraction' using errcode = '22023';
  end if;
  foreach k in array required loop
    if not (p_decision ? k) or jsonb_typeof(p_decision -> k) <> 'string' and k <> 'prompt_version' then
      raise exception 'decisão inválida: campo obrigatório ausente ou com tipo errado (%)', k using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_decision -> 'prompt_version') <> 'number' then
    raise exception 'decisão inválida: prompt_version' using errcode = '22023';
  end if;
  if p_decision ? 'overall_score' and jsonb_typeof(p_decision -> 'overall_score') not in ('number', 'null') then
    raise exception 'decisão inválida: overall_score' using errcode = '22023';
  end if;
  if p_decision ? 'attempt' and jsonb_typeof(p_decision -> 'attempt') <> 'number' then
    raise exception 'decisão inválida: attempt' using errcode = '22023';
  end if;
  if p_decision ? 'latency_ms' and jsonb_typeof(p_decision -> 'latency_ms') not in ('number', 'null') then
    raise exception 'decisão inválida: latency_ms' using errcode = '22023';
  end if;
  -- S28: uso do provedor. Inteiro não negativo ou nulo; texto, objeto e fração são recusados (o CHECK cobre o sinal).
  foreach k in array array['prompt_tokens', 'completion_tokens', 'total_tokens', 'provider_cost_usd_micros'] loop
    if p_decision ? k and jsonb_typeof(p_decision -> k) not in ('number', 'null') then
      raise exception 'decisão inválida: % deve ser número inteiro ou nulo', k using errcode = '22023';
    end if;
    if jsonb_typeof(p_decision -> k) = 'number'
       and (p_decision ->> k)::numeric <> trunc((p_decision ->> k)::numeric) then
      raise exception 'decisão inválida: % deve ser inteiro', k using errcode = '22023';
    end if;
  end loop;
  if p_decision ? 'item_scores' and not public.ai_item_scores_valid(p_decision -> 'item_scores') then
    raise exception 'decisão inválida: item_scores' using errcode = '22023';
  end if;
  if p_decision ? 'alerts' and not public.ai_alerts_valid(p_decision -> 'alerts') then
    raise exception 'decisão inválida: alerts' using errcode = '22023';
  end if;
  foreach k in array array['justification', 'actor_id', 'previous_version_id', 'new_version_id', 'started_at', 'finished_at'] loop
    if p_decision ? k and jsonb_typeof(p_decision -> k) not in ('string', 'null') then
      raise exception 'decisão inválida: % deve ser texto', k using errcode = '22023';
    end if;
  end loop;

  -- demais limites (faixas, enums, tamanhos) são CHECKs da tabela.
  insert into public.ai_decisions (
    entity_type, entity_id, kind, provider, model, prompt_key, prompt_version, pipeline_version,
    overall_score, item_scores, alerts, decision, justification, actor_id, previous_version_id, new_version_id,
    attempt, started_at, finished_at, latency_ms,
    prompt_tokens, completion_tokens, total_tokens, provider_cost_usd_micros
  ) values (
    p_decision ->> 'entity_type', (p_decision ->> 'entity_id')::uuid, p_decision ->> 'kind',
    p_decision ->> 'provider', p_decision ->> 'model', p_decision ->> 'prompt_key',
    (p_decision ->> 'prompt_version')::int, p_decision ->> 'pipeline_version',
    (p_decision ->> 'overall_score')::numeric,
    coalesce(p_decision -> 'item_scores', '[]'::jsonb), coalesce(p_decision -> 'alerts', '[]'::jsonb),
    p_decision ->> 'decision', p_decision ->> 'justification', (p_decision ->> 'actor_id')::uuid,
    (p_decision ->> 'previous_version_id')::uuid, (p_decision ->> 'new_version_id')::uuid,
    coalesce((p_decision ->> 'attempt')::int, 1),
    coalesce((p_decision ->> 'started_at')::timestamptz, now()),
    coalesce((p_decision ->> 'finished_at')::timestamptz, now()),
    (p_decision ->> 'latency_ms')::int,
    (p_decision ->> 'prompt_tokens')::int, (p_decision ->> 'completion_tokens')::int,
    (p_decision ->> 'total_tokens')::int, (p_decision ->> 'provider_cost_usd_micros')::bigint
  ) returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.ai_record_decision(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ai_record_decision(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Leitura agregada por entidade (envio de lista). security_invoker: a política de `ai_decisions` (admin e system)
-- vale para quem consulta; responsável autenticado enxerga zero linhas e anon nem chega (sem GRANT).
-- ---------------------------------------------------------------------------
create view public.ai_cost_per_entity with (security_invoker = true) as
select
  entity_type,
  entity_id,
  count(*)::int as decisions,
  sum(prompt_tokens)::bigint as prompt_tokens,
  sum(completion_tokens)::bigint as completion_tokens,
  sum(total_tokens)::bigint as total_tokens,
  coalesce(sum(provider_cost_usd_micros), 0)::bigint as provider_cost_usd_micros,
  (count(*) filter (where provider_cost_usd_micros is null))::int as unknown_cost_rows,
  min(created_at) as first_at
from public.ai_decisions
group by entity_type, entity_id;

revoke all on public.ai_cost_per_entity from public, anon, authenticated, service_role;
grant select on public.ai_cost_per_entity to authenticated, service_role;
comment on view public.ai_cost_per_entity is
  'S28: custo de IA por entidade. `unknown_cost_rows` > 0 significa custo parcial: nunca apresentar como total.';
