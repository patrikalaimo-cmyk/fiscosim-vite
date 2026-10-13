-- SG-P0-04 LIVE class E hotfix — break RLS recursion (2026-10-13)
-- Preserve function semantics; only add SECURITY DEFINER + row_security=off.
BEGIN;

CREATE OR REPLACE FUNCTION public.current_utente_ruolo()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
  select coalesce(
    (
      select us.ruolo
      from public.utenti_studio us
      where us.auth_user_id = auth.uid()
        and us.attivo = true
      limit 1
    ),
    'collaboratore'
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
  select public.current_utente_ruolo() in ('owner', 'admin')
$function$;

CREATE OR REPLACE FUNCTION public.user_has_societa_access(target_societa uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
declare
  user_role text;
begin
  if auth.uid() is null or target_societa is null then
    return false;
  end if;

  user_role := public.current_utente_ruolo();
  if user_role in ('owner', 'admin') then
    return true;
  end if;

  return exists (
    select 1
    from public.utenti_studio_societa uss
    join public.utenti_studio us on us.id = uss.utente_id
    where uss.societa_id = target_societa
      and us.attivo = true
      and (
        uss.auth_user_id = auth.uid()
        or us.auth_user_id = auth.uid()
      )
  );
end;
$function$;

-- current_utente_studio_id used by user_can_access_scoped_row
DO $body$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'current_utente_studio_id' AND p.pronargs = 0
  LIMIT 1;
  IF def IS NULL THEN
    RETURN;
  END IF;
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.current_utente_studio_id()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    SET row_security = off
    AS $f$
      SELECT us.id
      FROM public.utenti_studio us
      WHERE us.auth_user_id = auth.uid()
        AND us.attivo = true
      LIMIT 1
    $f$;
  $sql$;
END
$body$;

CREATE OR REPLACE FUNCTION public.user_can_access_scoped_row(
  row_company_id uuid,
  row_created_by uuid,
  row_owner_user_id uuid,
  row_visibility text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
  select
    public.user_has_societa_access(row_company_id)
    and (
      public.is_owner_or_admin()
      or coalesce(row_visibility, 'shared') = 'shared'
      or row_created_by = public.current_utente_studio_id()
      or row_owner_user_id = public.current_utente_studio_id()
    )
$function$;

REVOKE ALL ON FUNCTION public.current_utente_ruolo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner_or_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_societa_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_can_access_scoped_row(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_utente_ruolo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_societa_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_scoped_row(uuid, uuid, uuid, text) TO authenticated, service_role;

DO $g$
BEGIN
  IF to_regprocedure('public.current_utente_studio_id()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.current_utente_studio_id() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_utente_studio_id() TO authenticated, service_role';
  END IF;
END
$g$;

COMMIT;
