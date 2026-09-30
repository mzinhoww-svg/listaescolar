-- S29 Task 16 (UX-089/J5): o aviso de pedido aprovado leva ao painel da escola (`/escola`), não à página do pedido.
-- A central já corrigia o destino na hora de mostrar (`resolveLinkPath`); push e e-mail abrem o `link_path` gravado, então o
-- caminho certo passa a ser gravado na origem. Os demais estados continuam levando à página do pedido.
create or replace function public.notify_claim_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_inep text;
  v_name text;
begin
  if new.claimant_id is distinct from auth.uid() then
    select s.inep, s.name into v_inep, v_name from public.schools s where s.id = new.school_id;
    perform public.notification_emit(
      new.claimant_id, 'claim_updated', 'claim_updated:' || new.id::text || ':' || new.status::text,
      jsonb_build_object('school_name', v_name, 'status_code', new.status::text),
      case new.status when 'approved' then '/escola' else '/escolas/' || v_inep || '/reivindicar' end, new.is_demo);
  end if;
  return null;
exception when others then
  insert into public.notification_emit_errors (event_type, sqlstate) values ('claim_updated', sqlstate);
  raise warning 'notification_emit_error %', sqlstate;
  return null;
end;
$$;
