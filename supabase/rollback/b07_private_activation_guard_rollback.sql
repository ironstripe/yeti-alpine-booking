-- Rollback for b07_private_activation_guard.sql: restore the migration-0004 guard body, then drop the B07b objects.
-- Run only after deactivating any private product activated through it (the old guard would block re-activation).
CREATE OR REPLACE FUNCTION public.prevent_bc_draft_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active IS TRUE AND EXISTS
      (SELECT 1 FROM public.bc_product_tariff_sources WHERE product_id=NEW.id) THEN
    IF NEW.type NOT IN ('group','group_toddler')
       OR NOT EXISTS (SELECT 1 FROM public.bc_2627_course_product_variants v WHERE v.product_id=NEW.id)
       OR EXISTS (
         SELECT 1
           FROM public.bc_2627_course_product_variants v, unnest(v.eligible_day_counts) dc
          WHERE v.product_id=NEW.id
            AND (
              (SELECT count(*) FROM public.product_price_tiers t
                WHERE t.product_id=NEW.id AND t.day_count=dc AND t.cumulative_price>0) <> 1
              OR (SELECT count(*) FROM public.bc_product_tariff_sources s
                    JOIN public.product_price_tiers t ON t.product_id=NEW.id AND t.day_count=dc
                   WHERE s.product_id=NEW.id AND s.import_status='draft' AND s.day_count=dc
                     AND s.duration_minutes=NEW.duration_minutes AND s.persons_per_lesson=1
                     AND s.price_chf=t.cumulative_price) <> 1
            )) THEN
      RAISE EXCEPTION 'Booking-Corner draft cannot be activated before pricing release gate';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP FUNCTION IF EXISTS public.private_tariff_activation_ok(uuid);
DROP TABLE IF EXISTS public.private_tariff_required_coverage;
