-- 0607_security_advisors: revisão dos achados de advisor D-093/D-094/D-096 (S19). Sem mudança de schema para
-- D-093 e D-096 (ver Ruling no ledger, seção S19) — este arquivo só documenta a verificação (sem SQL efetivo).
--
-- D-093 (view `public.stationery_public` "SECURITY DEFINER"): verificado o SQL da 0302 — a view já seleciona só
-- colunas públicas (id, slug, trade_name, municipality_id, neighborhood, offers_pickup, offers_delivery,
-- service_radius_km, opening_hours, payment_methods, whatsapp, is_demo, updated_at) de papelaria
-- `status = 'active'`, sem nenhuma coluna de contato privado (e-mail/telefone interno/CNPJ) nem de menor. Trocar
-- para `security_invoker = true` quebraria a leitura pública: a tabela `stationeries` não tem policy nem grant
-- para `anon` (comentário original da 0302: "view definer + sem grant algum de anon na base... RLS filtra
-- linhas, não colunas"). A segunda alternativa que o próprio D-093 já admite ("garantir que só expõe colunas
-- públicas da papelaria ativa") está satisfeita. Resolvida por verificação; nenhuma linha de SQL necessária.
--
-- D-096 (`auth_role()`, `rls_auto_enable()`, `stationery_is_active(uuid)` SECURITY DEFINER executáveis por
-- anon/authenticated): `auth_role()` (0001) e `stationery_is_active(uuid)` (0302) são concedidas a
-- anon/authenticated DE PROPÓSITO — a primeira roda dentro de policies RLS que precisam ser avaliadas com o
-- papel de quem consulta; a segunda gateia visibilidade pública sem expor a tabela toda. Nenhuma das duas
-- devolve dado sensível (papel do próprio chamador; booleano de status). `rls_auto_enable()` é função DA
-- PLATAFORMA Supabase — não existe em nenhuma migration deste repositório, então não pode ser alterada por uma
-- migration nossa; ação real (revogar EXECUTE de anon) fica para o humano/sessão com acesso ao Supabase Studio
-- do projeto de staging. D-096 permanece `aberta`, rebaixada: verificada, só falta a ação em `rls_auto_enable()`.
--
-- D-094 (`pg_net` no schema `public`): NO-OP DE PROPÓSITO (revisão de segurança da S19, I6). A extensão não é criada
-- por NENHUMA migration deste repositório (instalada manualmente no staging) e o `pg_net` NÃO é relocável:
-- `ALTER EXTENSION pg_net SET SCHEMA` falha ("extension ... does not support SET SCHEMA"), e `DROP/CREATE EXTENSION`
-- destruiria o schema `net` de que depende o job `ocr-worker-tick` do staging (`net.http_post`). O advisor
-- "extension in public" é da plataforma Supabase para o `pg_net`; D-094 fica ACEITA como advisor conhecido (ver
-- Ruling na seção S19 do ledger e DEBT.md). Nenhuma mudança de schema aqui.
do $$
begin
  null;
end;
$$;
