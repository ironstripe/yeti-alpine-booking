BEGIN;
-- First revert catalog/function/frontend to the previous contract.
-- Restore original save operation; keep the nullable column and entered text intact.
-- No table/column drops or business-data deletion. Re-activation requires reviewed RPC replacement, not rerunning the single-apply migration.
CREATE OR REPLACE FUNCTION public.save_product_public_offering(p_product_id uuid, p_offering jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w smallint[]; d date[]; b jsonb; k text; r jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p_offering IS NULL OR p_offering='null'::jsonb THEN
    DELETE FROM public.product_public_offerings WHERE product_id=p_product_id;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_offering)<>'object' OR jsonb_typeof(p_offering->'weekdays') IS DISTINCT FROM 'array' OR jsonb_typeof(p_offering->'dates') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid offering'; END IF;
  k:=p_offering->>'schedule_kind'; b:=p_offering->'time_blocks';
  SELECT coalesce(array_agg(value::smallint ORDER BY ord),'{}') INTO w FROM jsonb_array_elements_text(p_offering->'weekdays') WITH ORDINALITY AS x(value,ord);
  SELECT coalesce(array_agg(value::date ORDER BY ord),'{}') INTO d FROM jsonb_array_elements_text(p_offering->'dates') WITH ORDINALITY AS x(value,ord);
  IF NOT public.product_offering_shape_ok(k,w,d,b) THEN RAISE EXCEPTION 'Invalid offering shape or overlapping blocks'; END IF;
  INSERT INTO public.product_public_offerings(product_id,schedule_kind,weekdays,dates,time_blocks,updated_by)
  VALUES(p_product_id,k,w,d,b,p_actor)
  ON CONFLICT(product_id) DO UPDATE SET schedule_kind=EXCLUDED.schedule_kind,weekdays=EXCLUDED.weekdays,dates=EXCLUDED.dates,time_blocks=EXCLUDED.time_blocks,updated_at=now(),updated_by=EXCLUDED.updated_by;
  SELECT jsonb_build_object('schedule_kind',schedule_kind,'weekdays',weekdays,'dates',dates,'time_blocks',time_blocks) INTO r FROM public.product_public_offerings WHERE product_id=p_product_id;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.save_product_public_offering(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_public_offering(uuid,jsonb,uuid) TO service_role;

COMMIT;
