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
--
-- Correções da revisão de segurança/privacidade (Opus, rodada única sobre d405956 — ver ledger.md "S17 ·
-- correções da revisão de segurança"):
-- 6) `profiles_lgpd_erase` cancela ANTES de anonimizar toda reivindicação do titular que ainda não chegou a um
--    estado final (`submitted`/`awaiting_verification`/`insufficient_evidence`/`token_expired`), como ator
--    `system`, com motivo próprio (`claimant_account_deleted`), e ressincroniza `schools.verification_status`
--    (`claim_sync_school`) — nenhuma reivindicação fica "no limbo" sem reivindicante e sem decisão.
--    `claimant_role_title` também é anonimizado (cargo + outros dados públicos da escola poderiam re-identificar
--    a pessoa). `claims_guard` passa a usar `is distinct from` (não `<>`, que silencia em NULL por lógica de três
--    valores) e libera EXPLICITAMENTE só a transição de `claimant_id` de não-nulo para nulo; qualquer outra
--    mudança de `claimant_id` continua bloqueada. `claim_decide` recusa decidir reivindicação sem `claimant_id`
--    (conta já excluída) com erro claro, em vez de tentar promover papel de um perfil inexistente.
-- 7) `retention_candidates('claim_evidence', ...)` só considera `status in ('approved', 'rejected')`: uma
--    reivindicação em `insufficient_evidence` ainda pode ser retomada pelo reivindicante (`claim_transition_allowed`
--    permite `insufficient_evidence -> awaiting_verification`), então a evidência dela não é "definitiva" e não
--    deve entrar no expurgo mesmo que `decided_at` seja antigo.
-- 8) `account_deletion_blockers(p_profile_id)`: a exclusão de conta é recusada (com mensagem específica, nunca erro
--    genérico) quando o titular é dono de papelaria ATIVA, dono de parceiro B2B, ou tem histórico de curadoria
--    administrativa (`review_versions.actor_id`, sem `on delete` explícito = `no action`, e é append-only — nunca
--    poderia ser apagado nem anonimizado sem quebrar a trilha de auditoria da revisão humana). Chamada por
--    `features/privacy/repository.ts#deleteAccount` ANTES de tentar `auth.admin.deleteUser`.

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
-- claims_guard (0104): trocado `<>` por `is distinct from` (o `<>` original silencia quando um lado é NULL, por
-- lógica de três valores do SQL — funcionava "por acidente" para liberar a transição a NULL, mas deixaria de
-- funcionar, sem erro nenhum, se qualquer outra coluna comparada algum dia aceitasse NULL). Libera EXPLICITAMENTE
-- só `claimant_id`: não-nulo -> nulo (o `SET NULL` da FK acima); qualquer outra mudança de `claimant_id`
-- (inclusive nulo -> valor, ou valor -> outro valor) continua bloqueada, igual às outras colunas de identidade.
-- ---------------------------------------------------------------------------
create or replace function public.claims_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.school_id is distinct from old.school_id
     or new.method is distinct from old.method
     or new.privacy_ack_at is distinct from old.privacy_ack_at
     or new.privacy_text_version is distinct from old.privacy_text_version
     or (new.claimant_id is distinct from old.claimant_id and new.claimant_id is not null) then
    raise exception 'escola, reivindicante, método e aceite da reivindicação são imutáveis' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- claim_decide (0104): recusa decidir reivindicação sem claimant_id (titular já excluído) com erro claro, em vez
-- de seguir e tentar promover o papel de um perfil inexistente (erro genérico de NOT NULL em school_members).
-- Defesa em profundidade: `profiles_lgpd_erase` já cancela toda reivindicação não final do titular antes de
-- excluir a conta, então este caminho só dispara se algo escapar dessa varredura.
create or replace function public.claim_decide(p_claim_id uuid, p_to public.claim_status, p_actor_id uuid, p_reason text)
returns public.claim_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.claims;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_school_status public.verification_status;
  v_role public.user_role;
  v_other uuid;
begin
  if p_to not in ('approved', 'insufficient_evidence', 'rejected') then
    raise exception 'decisão inválida: %', p_to using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'admin') then
    raise exception 'só admin decide reivindicações' using errcode = '42501';
  end if;
  if p_to <> 'approved' and (v_reason is null or length(v_reason) < 3 or length(v_reason) > 500) then
    raise exception 'motivo de 3 a 500 caracteres é obrigatório' using errcode = '22023';
  end if;

  v_claim := public.claim_lock(p_claim_id);
  if v_claim.claimant_id is null then
    raise exception 'reivindicação sem reivindicante (conta excluída)' using errcode = '22023', hint = 'claimant_missing';
  end if;
  if not public.claim_transition_allowed(v_claim.status, p_to, 'admin') then
    raise exception 'transição de reivindicação inválida: % -> % (admin)', v_claim.status, p_to using errcode = '23514';
  end if;

  if p_to <> 'approved' then
    perform public.claim_apply(p_claim_id, p_to, 'admin', p_actor_id, v_reason);
    perform public.claim_sync_school(v_claim.school_id);
    return p_to;
  end if;

  if v_claim.method <> 'documents' and v_claim.channel_confirmed_at is null then
    raise exception 'aprovar exige canal confirmado' using errcode = '23514';
  end if;
  if v_claim.method = 'documents' and not exists (select 1 from public.claim_evidence e where e.claim_id = p_claim_id) then
    raise exception 'aprovar exige ao menos uma evidência' using errcode = '23514';
  end if;
  select s.verification_status into v_school_status from public.schools s where s.id = v_claim.school_id;
  if v_school_status in ('verified', 'suspended') then
    raise exception 'escola % não aceita aprovação', v_school_status using errcode = '23514';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_claim.claimant_id for no key update;
  if v_role not in ('parent', 'school_member') then
    raise exception 'papel do reivindicante não pode ser promovido' using errcode = '23514';
  end if;

  perform public.claim_apply(p_claim_id, 'approved', 'admin', p_actor_id, v_reason);
  update public.schools set verification_status = 'verified' where id = v_claim.school_id;
  insert into public.school_members (school_id, profile_id, member_role, claim_id)
  values (v_claim.school_id, v_claim.claimant_id, 'owner', p_claim_id);
  if v_role = 'parent' then
    update public.profiles set role = 'school_member' where id = v_claim.claimant_id;
  end if;

  for v_other in
    select c.id from public.claims c
     where c.school_id = v_claim.school_id and c.id <> p_claim_id and c.status not in ('approved', 'rejected')
     order by c.id for no key update
  loop
    perform public.claim_apply(v_other, 'rejected', 'system', null,
      'Outra reivindicação desta escola foi aprovada', 'school_verified_by_other_claim');
    update public.claim_tokens t set revoked_at = now()
     where t.claim_id = v_other and t.consumed_at is null and t.revoked_at is null;
  end loop;
  return p_to;
end;
$$;

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
declare
  v_claim record;
begin
  -- Reivindicações do titular ainda sem decisão final: cancela como 'system', com motivo próprio, ANTES de
  -- anonimizar (para o rastro imutável em claim_status_events registrar o motivo real) e ressincroniza a escola.
  -- Sem isto, uma reivindicação 'awaiting_verification'/'insufficient_evidence'/'token_expired' ficaria presa: o
  -- reivindicante nunca mais confirma nem reenviará evidência (a conta não existe mais).
  for v_claim in
    select id, school_id from public.claims
     where claimant_id = old.id and status not in ('approved', 'rejected')
  loop
    perform public.claim_apply(v_claim.id, 'rejected', 'system', null,
      'Conta do reivindicante excluída', 'claimant_account_deleted');
    perform public.claim_sync_school(v_claim.school_id);
  end loop;

  -- claims: mantém escola/status/datas/decisão (livro-razão de verificação de escola); remove o que é pessoal do
  -- reivindicante. `claimant_role_title` também é anonimizado (Ruling da revisão: cargo institucional combinado a
  -- outros dados públicos da escola poderia re-identificar a pessoa).
  update public.claims
     set claimant_name = '[conta excluída]',
         claimant_role_title = '[conta excluída]',
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
      -- só estado FINAL de verdade: 'insufficient_evidence' tem decided_at mas o reivindicante ainda pode
      -- retomar (claim_transition_allowed permite insufficient_evidence -> awaiting_verification) — a evidência
      -- dela não é definitiva e não entra no expurgo (Ruling da revisão).
      select ce.id, ce.storage_path
        from public.claim_evidence ce
        join public.claims c on c.id = ce.claim_id
       where c.status in ('approved', 'rejected')
         and c.decided_at is not null
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
-- account_deletion_blockers: recusa a exclusão (com mensagem específica, nunca erro genérico de FK) quando o
-- titular é dono de papelaria ATIVA, dono de parceiro B2B, ou tem histórico de curadoria administrativa
-- (`review_versions.actor_id`: sem `on delete` explícito = `no action`, e a tabela é append-only — nunca poderia
-- ser apagada nem anonimizada sem quebrar a trilha de auditoria da revisão humana). Chamada pelo Server Action
-- ANTES de `auth.admin.deleteUser`. SECURITY DEFINER, EXECUTE só service_role.
-- ---------------------------------------------------------------------------
create function public.account_deletion_blockers(p_profile_id uuid) returns text[]
language sql
security definer
set search_path = ''
stable
as $$
  select array_remove(array[
    (select 'stationery_owner_active' where exists (
      select 1 from public.stationery_members sm
        join public.stationeries s on s.id = sm.stationery_id
       where sm.profile_id = p_profile_id and sm.member_role = 'owner' and s.status = 'active'
    )),
    (select 'b2b_partner_owner' where exists (
      select 1 from public.b2b_partner_members bm where bm.profile_id = p_profile_id
    )),
    (select 'review_history' where exists (
      select 1 from public.review_versions rv where rv.actor_id = p_profile_id
    ))
  ], null);
$$;
revoke execute on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;

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
      select jsonb_build_object(
               'id', p.id, 'papel', p.role, 'nome_exibicao', p.display_name, 'e_mail', u.email, 'criado_em', p.created_at
             )
        from public.profiles p join auth.users u on u.id = p.id where p.id = p_profile_id
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
    ),
    'notificacoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'evento', n.event_type, 'link', n.link_path, 'lida_em', n.read_at, 'criado_em', n.created_at
             ) order by n.created_at), '[]'::jsonb)
        from public.notifications n where n.recipient_id = p_profile_id
    ),
    'listas_observadas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'escola_id', lw.school_id, 'serie_id', lw.grade_id, 'ano', lw.school_year, 'criado_em', lw.created_at
             ) order by lw.created_at), '[]'::jsonb)
        from public.list_watches lw where lw.profile_id = p_profile_id
    ),
    'copias_privadas_de_lista', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'envio_id', pc.submission_id, 'versao', pc.version, 'itens', pc.items, 'criado_em', pc.created_at
             ) order by pc.created_at), '[]'::jsonb)
        from public.parent_list_copies pc where pc.owner_id = p_profile_id
    ),
    'cliques_em_loja', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'carrinho_id', ac.cart_id, 'clicado_em', ac.clicked_at
             ) order by ac.clicked_at), '[]'::jsonb)
        from public.affiliate_clicks ac where ac.profile_id = p_profile_id
    ),
    'vinculos', (
      select coalesce(jsonb_agg(v), '[]'::jsonb) from (
        select jsonb_build_object('tipo', 'escola', 'entidade_id', sm.school_id, 'papel', sm.member_role, 'criado_em', sm.created_at) as v
          from public.school_members sm where sm.profile_id = p_profile_id
        union all
        select jsonb_build_object('tipo', 'papelaria', 'entidade_id', st.stationery_id, 'papel', st.member_role, 'criado_em', st.created_at)
          from public.stationery_members st where st.profile_id = p_profile_id
        union all
        select jsonb_build_object('tipo', 'parceiro_b2b', 'entidade_id', bm.partner_id, 'papel', bm.member_role, 'criado_em', bm.created_at)
          from public.b2b_partner_members bm where bm.profile_id = p_profile_id
      ) x
    )
  );
$$;

revoke execute on function public.account_export(uuid) from public, anon, authenticated;
grant execute on function public.account_export(uuid) to service_role;
