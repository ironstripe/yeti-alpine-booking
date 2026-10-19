-- Restores the previous duration-equality check.
CREATE OR REPLACE FUNCTION public.product_offering_validate()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE p record; s record; total integer;
BEGIN
  SELECT type, duration_minutes, season_id INTO p FROM public.products WHERE id=NEW.product_id FOR UPDATE;
  IF NEW.schedule_kind='flexible_private' AND p.type<>'private' THEN RAISE EXCEPTION 'Flexible schedule requires private product'; END IF;
  IF NEW.schedule_kind<>'flexible_private' THEN
    SELECT sum(extract(epoch FROM ((v->>'end')::time-(v->>'start')::time))/60)::integer INTO total FROM jsonb_array_elements(NEW.time_blocks) v;
    IF p.duration_minutes>0 AND total<>p.duration_minutes THEN RAISE EXCEPTION 'Time blocks must match product duration'; END IF;
  END IF;
  IF NEW.schedule_kind='explicit_dates' AND p.season_id IS NOT NULL THEN
    SELECT start_date,end_date INTO s FROM public.seasons WHERE id=p.season_id;
    IF EXISTS (SELECT 1 FROM unnest(NEW.dates) d WHERE d<s.start_date OR d>s.end_date) THEN RAISE EXCEPTION 'Date outside season'; END IF;
  END IF;
  RETURN NEW;
END $function$;
