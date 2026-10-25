-- B07b release prerequisite (PENDING, NOT INSTALLED). Requires product_private_tariff_rules.sql.
-- Extends prevent_bc_draft_activation minimally: a Booking-Corner-sourced PRIVATE product may be
-- activated only when it has a tariff revision AND exactly one configured rule for every decided
-- window in private_tariff_required_coverage (data; structural windows only, no money values).
-- The group branch is byte-identical to migration 0004. BC sources stay untouched. No trigger disabling.

CREATE TABLE public.private_tariff_required_coverage (
  rule_kind text NOT NULL CHECK (rule_kind IN ('exact_block','hourly')),
  window_start time NOT NULL,
  window_end time NOT NULL,
  office_only boolean NOT NULL,
  max_block_minutes integer,
  provenance text NOT NULL CHECK (length(trim(provenance)) > 0),
  PRIMARY KEY (rule_kind, window_start, window_end)
);
COMMENT ON TABLE public.private_tariff_required_coverage IS
  'B07b: decided private tariff windows a BC private product must fully configure before activation (no prices).';
GRANT SELECT ON public.private_tariff_required_coverage TO authenticated;
GRANT ALL ON public.private_tariff_required_coverage TO service_role;
ALTER TABLE public.private_tariff_required_coverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read private tariff coverage" ON public.private_tariff_required_coverage
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

INSERT INTO public.private_tariff_required_coverage VALUES
  ('exact_block','10:00','12:00',false,NULL,'Ivo 2026-10-25 standard double'),
  ('exact_block','14:00','16:00',false,NULL,'Ivo DECISIONS standard double'),
  ('exact_block','12:00','14:00',false,NULL,'Ivo DECISIONS standard double'),
  ('exact_block','09:00','11:00',true ,NULL,'Ivo DECISIONS office exception'),
  ('exact_block','13:00','15:00',true ,NULL,'Ivo DECISIONS office exception'),
  ('hourly','09:00','10:00',false,NULL,'Ivo 2026-10-25 off-peak hourly'),
  ('hourly','12:00','14:00',false,NULL,'Ivo 2026-10-25 off-peak hourly'),
  ('hourly','10:00','12:00',true ,60  ,'Ivo 2026-10-25 office single hour'),
  ('hourly','14:00','16:00',true ,60  ,'Ivo 2026-10-25 office single hour');

CREATE OR REPLACE FUNCTION public.private_tariff_activation_ok(p_product uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.product_private_tariff_revisions r WHERE r.product_id = p_product AND r.revision > 0)
     AND EXISTS (SELECT 1 FROM public.private_tariff_required_coverage)
     AND NOT EXISTS (
       SELECT 1 FROM public.private_tariff_required_coverage c
        WHERE (SELECT count(*) FROM public.product_private_tariff_rules t
                WHERE t.product_id = p_product AND t.rule_kind = c.rule_kind AND t.window_start = c.window_start
                  AND t.window_end = c.window_end AND t.office_only = c.office_only
                  AND t.max_block_minutes IS NOT DISTINCT FROM c.max_block_minutes
                  AND t.price_chf > 0 AND length(trim(t.provenance)) > 0) <> 1)
$$;
REVOKE ALL ON FUNCTION public.private_tariff_activation_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_tariff_activation_ok(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_bc_draft_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active IS TRUE AND EXISTS
      (SELECT 1 FROM public.bc_product_tariff_sources WHERE product_id=NEW.id) THEN
    IF NEW.type = 'private' THEN
      IF NOT public.private_tariff_activation_ok(NEW.id) THEN
        RAISE EXCEPTION 'Booking-Corner private product cannot be activated before its product tariff covers every decided window';
      END IF;
      RETURN NEW;
    END IF;
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
