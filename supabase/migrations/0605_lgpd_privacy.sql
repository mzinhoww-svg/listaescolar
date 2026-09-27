-- 0605_lgpd_privacy: retenção, exportação e exclusão de conta (S17, fora de trilha; roda depois da S06/S11/S14/S15).
-- Ver Rulings completos em docs/superpowers/plans/2026-09-27-s17-lgpd-demo.md e docs/superpowers/ledger.md ("S17").
--
-- Resumo das decisões:
-- 1) `claims.claimant_id` e `claim_evidence.uploaded_by` passam de `on delete restrict` para `on delete set null`
--    (e ficam nullable): é o único jeito de a exclusão de conta apagar `profiles`/`auth.users` de verdade quando
--    o dono tem histórico de reivindicação. O registro da reivindicação (decisão, escola, datas) é o livro-razão
--    que fica (evidência de quem verificou a escola); o dado pessoal (nome, cargo, e-mail, nota, nome do arquivo)
--    é anonimizado por `profiles_lgpd_erase` (gatilho BEFORE DELETE em `profiles`) ANTES do SET NULL valer, na
--    mesma transação.
-- 2) `retention_policies` cobre o gap de D-012: `claim_evidence` (documento pessoal; contado de `claims.decided_at`,
--    só claims em estado final) e `claim_tokens` (hash sem PII; contado de `expires_at`, higiene). `retention_days`
--    é parâmetro de engenharia editável (não é fato jurídico inventado); revisão jurídica pendente, como o resto
--    da página de privacidade.
-- 3) `retention_candidates`/`retention_purge`: SECURITY DEFINER, EXECUTE só `service_role`, teto por execução,
--    idempotentes, NUNCA leem/escrevem `survey_*` (ADR-005 — a função só conhece `claim_evidence`/`claim_tokens`
--    por nome fixo, sem SQL dinâmico).
-- 4) `account_export`: SECURITY DEFINER, EXECUTE só `service_role`; recebe `p_profile_id` explícito (mesmo padrão
--    de `consents_revoke`) — a segurança vem do Server Action sempre passar `actor.userId` da sessão validada,
--    nunca um id de formulário. Cada subconsulta filtra por `p_profile_id` (a função roda como dono da tabela e
--    IGNORA RLS, então o filtro manual é obrigatório em cada uma).
-- 5) Exclusão de conta em si (apagar `auth.users`) é chamada pelo app via Admin API do Supabase Auth (cascade fecha
--    o resto pelas FKs já existentes); esta migration só garante que o cascade não trava mais em `claims`/
--    `claim_evidence` e que a anonimização roda antes. Sem função SQL própria para "excluir conta": o DELETE em
--    `auth.users` já é o contrato (testado aqui como tal).

-- ---------------------------------------------------------------------------
-- FKs: claims/claim_evidence deixam de travar a exclusão do perfil
-- ---------------------------------------------------------------------------
alter table public.claims alter column claimant_id drop not null;
alter table public.claims drop constraint claims_claimant_id_fkey;
alter table public.claims
  add constraint claims_claimant_id_fkey foreign key (claimant_id) references public.profiles (id) on delete set null;

alter table public.claim_evidence alter column uploaded_by drop not null;
alter table public.claim_evidence drop constraint claim_evidence_uploaded_by_fkey;
alter table public.claim_evidence
  add constraint claim_evidence_uploaded_by_fkey foreign key (uploaded_by) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Anonimização na exclusão do perfil (BEFORE DELETE; roda ANTES do SET NULL das FKs acima e do cascade de
-- `lead_events` não ter FK nenhuma). SECURITY DEFINER: só assim alcança linhas de `claims`/`claim_evidence`/
-- `lead_events` que não pertencem ao dono da sessão que disparou a exclusão (o app chama via service_role de
-- qualquer forma, mas o gatilho protege mesmo se o perfil for removido por outro caminho).
-- ---------------------------------------------------------------------------
create function public.profiles_lgpd_erase() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- claims: mantém escola/status/datas/decisão (livro-razão de verificação de escola); remove o que é pessoal do
  -- reivindicante. claimant_role_title fica (cargo institucional, não identifica sozinho).
  update public.claims
     set claimant_name = '[conta excluída]',
         contact_email = 'conta-excluida@invalido.local',
         evidence_note = null
   where claimant_id = old.id;

  -- claim_evidence: o nome do arquivo enviado pode conter PII (ex.: "RG_Maria.pdf"); o arquivo em si é apagado
  -- pelo job de retenção (D-012), não aqui (a evidência pode ainda estar em análise de outra reivindicação ligada
  -- à mesma escola, mesmo sem o perfil original).
  update public.claim_evidence
     set original_name = '[removido]'
   where uploaded_by = old.id;

  -- lead_events.actor_id (D-014), claim_status_events.actor_id, invoices.actor_id e credit_ledger.actor_id não
  -- têm FK e são tabelas IMUTÁVEIS (append-only; UPDATE bloqueado pelo próprio gatilho de imutabilidade — testado
  -- na tentativa, não só suposto): não há como (nem se poderia, sem quebrar a garantia de imutabilidade do
  -- livro-razão) apagar ou trocar esse valor aqui. A anonimização delas é a ausência de FK em si: depois que o
  -- perfil é apagado, o uuid em `actor_id` nunca mais resolve a um perfil de verdade (nenhum outro perfil nasce
  -- com o mesmo id) e vira um valor órfão e não religável — mesmo padrão já usado nessas quatro tabelas desde
  -- que foram criadas. Nada a fazer aqui além de documentar (Ruling, ver ledger "S17").

  return old;
end;
$$;
create trigger profiles_lgpd_erase before delete on public.profiles
  for each row execute function public.profiles_lgpd_erase();
alter table public.profiles enable always trigger profiles_lgpd_erase;
revoke execute on function public.profiles_lgpd_erase() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- retention_policies: parâmetro editável por recurso (D-012). Sem policy (só service_role, via bypassrls, lê ou
-- escreve) — nenhuma tela de usuário final depende disto nesta fatia.
-- ---------------------------------------------------------------------------
create table public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  resource text not null unique check (resource in ('claim_evidence', 'claim_tokens')),
  retention_days integer not null check (retention_days between 1 and 3650),
  description text not null check (length(btrim(description)) between 3 and 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger retention_policies_set_updated_at before update on public.retention_policies
  for each row execute function public.set_updated_at();

insert into public.retention_policies (resource, retention_days, description) values
  ('claim_evidence', 180, 'Documentos de evidência de reivindicação de escola, contados da decisão final (aprovada, rejeitada ou evidência insuficiente). Prazo técnico provisório, sujeito a revisão jurídica.'),
  ('claim_tokens', 90, 'Tokens de confirmação de reivindicação (guardados só como hash), contados do vencimento. Higiene de dado, sem conteúdo pessoal legível.');

alter table public.retention_policies enable row level security;
revoke all on public.retention_policies from anon, authenticated;
grant select, update (retention_days, is_active, description) on public.retention_policies to service_role;

-- ---------------------------------------------------------------------------
-- Job de retenção: candidatos e exclusão. SECURITY DEFINER, EXECUTE só service_role. Nunca referenciam `survey_*`
-- (ADR-005): as únicas tabelas tocadas são as dadas por nome fixo abaixo.
-- ---------------------------------------------------------------------------
create function public.retention_candidates(p_resource text, p_limit integer default 200)
returns table (id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500); -- teto por execução
  v_days integer;
  v_active boolean;
begin
  select rp.retention_days, rp.is_active into v_days, v_active
    from public.retention_policies rp where rp.resource = p_resource;
  if v_days is null or not v_active then
    return; -- recurso desconhecido ou política desativada: sem candidatos (nunca erro, o cron segue idempotente)
  end if;

  if p_resource = 'claim_evidence' then
    return query
      select ce.id, ce.storage_path
        from public.claim_evidence ce
        join public.claims c on c.id = ce.claim_id
       where c.decided_at is not null
         and c.decided_at < now() - (v_days || ' days')::interval
       order by c.decided_at
       limit v_limit;
  elsif p_resource = 'claim_tokens' then
    return query
      select ct.id, null::text
        from public.claim_tokens ct
       where ct.expires_at < now() - (v_days || ' days')::interval
       order by ct.expires_at
       limit v_limit;
  end if;
  -- qualquer outro valor de p_resource (inclusive algo como 'survey_responses'): cai no `if/elsif` e não devolve
  -- nada, por construção — não existe ramo que leia `survey_*`.
end;
$$;

create function public.retention_purge(p_resource text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  if p_resource = 'claim_evidence' then
    delete from public.claim_evidence where id = any(p_ids);
    get diagnostics v_deleted = row_count;
  elsif p_resource = 'claim_tokens' then
    delete from public.claim_tokens where id = any(p_ids);
    get diagnostics v_deleted = row_count;
  else
    raise exception 'recurso de retenção desconhecido' using errcode = '22023';
  end if;
  return v_deleted; -- idempotente: id já apagado não conta de novo, sem erro
end;
$$;

revoke execute on function public.retention_candidates(text, integer) from public, anon, authenticated;
grant execute on function public.retention_candidates(text, integer) to service_role;
revoke execute on function public.retention_purge(text, uuid[]) from public, anon, authenticated;
grant execute on function public.retention_purge(text, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- account_export: só os dados do PRÓPRIO p_profile_id (o Server Action sempre passa o id da sessão validada,
-- nunca um valor de formulário — mesmo modelo de confiança de `consents_revoke`/`notifications_mark_read`).
-- SECURITY DEFINER ignora RLS: por isso toda subconsulta abaixo filtra manualmente por p_profile_id.
-- ---------------------------------------------------------------------------
create function public.account_export(p_profile_id uuid) returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'gerado_em', now(),
    'perfil', (
      select jsonb_build_object('id', p.id, 'papel', p.role, 'nome_exibicao', p.display_name, 'criado_em', p.created_at)
        from public.profiles p where p.id = p_profile_id
    ),
    'consentimentos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'finalidade', c.purpose, 'versao_do_texto', c.text_version,
               'concedido_em', c.granted_at, 'revogado_em', c.revoked_at
             ) order by c.granted_at), '[]'::jsonb)
        from public.consents c where c.profile_id = p_profile_id
    ),
    'estudantes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'apelido', s.nickname, 'serie_id', s.grade_id, 'criado_em', s.created_at
             ) order by s.created_at), '[]'::jsonb)
        from public.students s where s.owner_id = p_profile_id
    ),
    'listas_salvas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', sl.id, 'estudante_id', sl.student_id, 'lista_id', sl.list_id, 'criado_em', sl.created_at
             ) order by sl.created_at), '[]'::jsonb)
        from public.saved_lists sl where sl.owner_id = p_profile_id
    ),
    'carrinhos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', ca.id, 'estrategia', ca.strategy, 'demonstracao', ca.is_demo, 'criado_em', ca.created_at,
               'itens', (
                 select coalesce(jsonb_agg(jsonb_build_object('nome', ci.name, 'quantidade', ci.quantity)), '[]'::jsonb)
                   from public.cart_items ci where ci.cart_id = ca.id
               )
             ) order by ca.created_at), '[]'::jsonb)
        from public.carts ca where ca.owner_id = p_profile_id
    ),
    'envios_de_lista', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', ls.id, 'nome_do_arquivo', ls.file_name, 'tipo', ls.mime_type, 'status', ls.status,
               'demonstracao', ls.is_demo, 'criado_em', ls.created_at
             ) order by ls.created_at), '[]'::jsonb)
        from public.list_submissions ls where ls.submitted_by = p_profile_id
    ),
    'cotacoes_solicitadas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'codigo', l.code, 'escola', l.school_name, 'serie', l.grade_label, 'status', l.status,
               'demonstracao', l.is_demo, 'criado_em', l.created_at
             ) order by l.created_at), '[]'::jsonb)
        from public.leads l where l.requester_id = p_profile_id
    ),
    'reivindicacoes_de_escola', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'escola_id', c.school_id, 'metodo', c.method, 'status', c.status,
               'decidido_em', c.decided_at, 'criado_em', c.created_at
             ) order by c.created_at), '[]'::jsonb)
        from public.claims c where c.claimant_id = p_profile_id
    ),
    'assinaturas_push', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'revogada_em', ps.revoked_at, 'criada_em', ps.created_at
             ) order by ps.created_at), '[]'::jsonb)
        from public.push_subscriptions ps where ps.profile_id = p_profile_id
    ),
    'preferencias_de_notificacao', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'evento', np.event_type, 'canal', np.channel, 'ativa', np.enabled
             ) order by np.event_type, np.channel), '[]'::jsonb)
        from public.notification_preferences np where np.profile_id = p_profile_id
    )
  );
$$;

revoke execute on function public.account_export(uuid) from public, anon, authenticated;
grant execute on function public.account_export(uuid) to service_role;
