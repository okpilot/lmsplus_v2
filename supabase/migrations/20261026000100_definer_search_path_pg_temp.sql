-- Every public and private SECURITY DEFINER function ends search_path with pg_temp (PostgreSQL CREATE FUNCTION, "Writing SECURITY DEFINER Functions Safely"). #1611

DO $$
DECLARE
  fn record;
  altered int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid, p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER %s %s SET search_path = public, pg_temp',
      CASE fn.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
      fn.oid::regprocedure
    );
    altered := altered + 1;
  END LOOP;

  IF altered = 0 THEN
    RAISE EXCEPTION 'no public/private SECURITY DEFINER functions altered';
  END IF;
END
$$;
