-- PREPARED ONLY. No backfill/seed. Activation is not a pricing/booking release.
-- Dependency discovery covers every FK to products, product-named UUID columns,
-- UUID arrays and persisted JSON (including history/consents). Unknown shapes fail closed.
CREATE TABLE public.product_lifecycle_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('update','delete')),
  actor uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb,
  dependencies jsonb NOT NULL DEFAULT '{}'
);
GRANT ALL ON public.product_lifecycle_log TO service_role;
REVOKE ALL ON public.product_lifecycle_log FROM PUBLIC,anon,authenticated;
ALTER TABLE public.product_lifecycle_log ENABLE ROW LEVEL SECURITY;

-- Replace only the import-marker activation prohibition. Quote/booking validators stay untouched.
-- Invoker trigger: authenticated clients cannot change activation directly; the service-only
-- SECURITY DEFINER lifecycle RPC runs as the trusted owner and validates its actor separately.
CREATE OR REPLACE FUNCTION public.prevent_bc_draft_activation() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'Use the staff product lifecycle API' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE DELETE ON public.products FROM anon,authenticated;

CREATE FUNCTION public.product_lifecycle_dependencies(p_product uuid, p_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r record; predicate text; n bigint; result jsonb := '{}';
BEGIN
  FOR r IN
    SELECT c.oid, c.relname, a.attname, format_type(a.atttypid,a.atttypmod) typ,
      EXISTS (SELECT 1 FROM pg_constraint f WHERE f.contype='f'
        AND f.conrelid=c.oid AND f.confrelid='public.products'::regclass AND a.attnum=ANY(f.conkey)) fk
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE ns.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname NOT IN ('products','product_lifecycle_log')
      AND (EXISTS (SELECT 1 FROM pg_constraint f WHERE f.contype='f'
        AND f.conrelid=c.oid AND f.confrelid='public.products'::regclass AND a.attnum=ANY(f.conkey))
        OR a.attname ILIKE '%product%' OR a.atttypid IN ('uuid[]'::regtype,'jsonb'::regtype,'json'::regtype))
    ORDER BY c.oid,a.attnum
  LOOP
    IF p_lock THEN EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',r.relname); END IF;
    IF r.typ='uuid' THEN predicate:=format('%I=$1',r.attname);
    ELSIF r.typ='uuid[]' THEN predicate:=format('$1=ANY(%I)',r.attname);
    ELSIF r.typ IN ('jsonb','json') THEN predicate:=format('position($1::text in %I::text)>0',r.attname);
    ELSIF r.typ='boolean' THEN CONTINUE; -- e.g. is_training_product, not an identity reference
    ELSE RAISE EXCEPTION 'Unclassified product dependency %.% (%)',r.relname,r.attname,r.typ;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s',r.relname,predicate) INTO n USING p_product;
    IF n>0 THEN result:=result || jsonb_build_object(r.relname||'.'||r.attname,n); END IF;
  END LOOP;
  RETURN result;
END $$;

CREATE FUNCTION public.product_lifecycle(p_product uuid,p_action text,p_expected jsonb,p_patch jsonb,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_row jsonb; after_row jsonb; deps jsonb; merged public.products; log_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id=p_actor AND role::text IN ('office','admin','super_admin')) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('dependencies','update','delete') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;
  IF p_action='dependencies' THEN
    RETURN jsonb_build_object('dependencies',public.product_lifecycle_dependencies(p_product));
  END IF;
  -- Lock dependency writers BEFORE the parent for deletion. SHARE excludes concurrent
  -- INSERT/UPDATE/DELETE, including non-FK JSON/array writers and cascading children.
  IF p_action='delete' THEN deps:=public.product_lifecycle_dependencies(p_product,true); END IF;
  SELECT to_jsonb(p) INTO before_row FROM public.products p WHERE id=p_product FOR UPDATE;
  IF before_row IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF p_expected IS NULL OR before_row IS DISTINCT FROM p_expected THEN
    RETURN jsonb_build_object('error','conflict');
  END IF;
  IF p_action='delete' THEN
    deps:=public.product_lifecycle_dependencies(p_product);
    IF deps<>'{}'::jsonb THEN RETURN jsonb_build_object('error','referenced','dependencies',deps); END IF;
    INSERT INTO public.product_lifecycle_log(product_id,action,actor,before_snapshot,dependencies)
      VALUES(p_product,'delete',p_actor,before_row,deps) RETURNING id INTO log_id;
    DELETE FROM public.products WHERE id=p_product;
    RETURN jsonb_build_object('ok',true,'deleted',true,'log_id',log_id);
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN
      ('name','type','description','duration_minutes','min_age','max_age','is_active',
       'is_training_product','show_on_website','discipline','audience','reporting_category','price','pricing_type'))
    OR (p_patch ? 'is_active' AND jsonb_typeof(p_patch->'is_active')<>'boolean') THEN
    RAISE EXCEPTION 'Invalid product patch';
  END IF;
  SELECT * INTO merged FROM jsonb_populate_record(NULL::public.products,before_row||p_patch);
  UPDATE public.products SET name=merged.name,type=merged.type,description=merged.description,
    duration_minutes=merged.duration_minutes,min_age=merged.min_age,max_age=merged.max_age,
    is_active=merged.is_active,is_training_product=merged.is_training_product,
    show_on_website=merged.show_on_website,discipline=merged.discipline,audience=merged.audience,
    reporting_category=merged.reporting_category,price=merged.price,pricing_type=merged.pricing_type
    WHERE id=p_product RETURNING to_jsonb(products.*) INTO after_row;
  INSERT INTO public.product_lifecycle_log(product_id,action,actor,before_snapshot,after_snapshot)
    VALUES(p_product,'update',p_actor,before_row,after_row) RETURNING id INTO log_id;
  RETURN jsonb_build_object('ok',true,'product',after_row,'log_id',log_id);
END $$;
REVOKE ALL ON FUNCTION public.product_lifecycle_dependencies(uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.product_lifecycle(uuid,text,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.product_lifecycle_dependencies(uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.product_lifecycle(uuid,text,jsonb,jsonb,uuid) TO service_role;