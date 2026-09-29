DO $$
DECLARE p record; remaining name[];
BEGIN
  FOR p IN SELECT tablename, policyname, roles FROM pg_policies
           WHERE schemaname='public' AND roles && ARRAY['anon','public']::name[]
  LOOP
    remaining := ARRAY(SELECT r FROM unnest(p.roles) r WHERE r NOT IN ('anon','public'));
    IF 'public' = ANY(p.roles) AND NOT ('authenticated' = ANY(remaining)) THEN
      remaining := remaining || 'authenticated'::name;
    END IF;
    IF cardinality(remaining) = 0 THEN
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I TO %s', p.policyname, p.tablename,
        (SELECT string_agg(quote_ident(r), ', ') FROM unnest(remaining) r));
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;