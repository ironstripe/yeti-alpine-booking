-- logical name: pa_phase1b_functions (private appointments Phase 1, read-only helpers + guard)

-- Explicit deny for browser roles on the server-only backfill log (documents intent; service_role bypasses RLS)
CREATE POLICY "No browser access to backfill log" ON public.private_appointment_backfill_log
  AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.pa_business_today()
RETURNS date LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'Europe/Zurich')::date $$;

-- Mirrors src/lib/pricing/private-lesson-pricing.ts calculatePrivateLessonPrice (totalPrice)
CREATE OR REPLACE FUNCTION public.pa_price(p_date date, p_start time, p_end time, p_persons integer)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_start_h int; v_end_h int; v_hours int; v_base numeric := 0; v_rate numeric; v_persons int; h int;
BEGIN
  IF p_date IS NULL OR p_start IS NULL OR p_end IS NULL THEN RETURN 0; END IF;
  v_start_h := extract(hour FROM p_start)::int;
  v_end_h := extract(hour FROM p_end)::int;
  v_hours := v_end_h - v_start_h;
  IF v_hours <= 0 THEN RETURN 0; END IF;
  v_persons := least(greatest(coalesce(p_persons, 1), 1), 4);
  FOR h IN v_start_h .. v_end_h - 1 LOOP
    SELECT r.rate_per_hour INTO v_rate
    FROM public.private_lesson_rates r
    WHERE (h * 60) >= (extract(hour FROM r.start_time)::int * 60 + extract(minute FROM r.start_time)::int)
      AND (h * 60) <  (extract(hour FROM r.end_time)::int * 60 + extract(minute FROM r.end_time)::int)
    ORDER BY r.start_time
    LIMIT 1;
    IF FOUND AND v_rate IS NOT NULL THEN v_base := v_base + v_rate; END IF;
  END LOOP;
  RETURN v_base + (v_persons - 1) * v_hours * 20;
END $$;

CREATE OR REPLACE FUNCTION public.pa_is_protected(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE a record; reasons text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('protected', false, 'reasons', '[]'::jsonb, 'found', false); END IF;
  IF a.date < public.pa_business_today() THEN reasons := reasons || 'past'; END IF;
  IF a.status = 'completed' THEN reasons := reasons || 'completed'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.ticket_id = a.ticket_id
             AND (i.issued_at IS NOT NULL OR coalesce(i.status,'draft') NOT IN ('draft','cancelled','void'))) THEN
    reasons := reasons || 'invoiced';
  END IF;
  RETURN jsonb_build_object('protected', cardinality(reasons) > 0, 'reasons', to_jsonb(reasons), 'found', true);
END $$;

CREATE OR REPLACE FUNCTION public.pa_slot_conflicts(p_instructor uuid, p_date date, p_start time, p_end time, p_exclude_appointment uuid DEFAULT NULL)
RETURNS TABLE(kind text, ref_id uuid, time_start time, time_end time)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT 'booking'::text, ti.id, ti.time_start::time, ti.time_end::time
  FROM public.ticket_items ti
  WHERE ti.instructor_id = p_instructor AND ti.date = p_date
    AND coalesce(ti.status,'') <> 'cancelled'
    AND ti.time_start IS NOT NULL AND ti.time_end IS NOT NULL
    AND ti.time_start::time < p_end AND ti.time_end::time > p_start
    AND (p_exclude_appointment IS NULL OR ti.appointment_id IS DISTINCT FROM p_exclude_appointment)
  UNION ALL
  SELECT 'appointment', pa.id, pa.time_start, pa.time_end
  FROM public.private_appointments pa
  WHERE pa.instructor_id = p_instructor AND pa.date = p_date AND pa.status <> 'cancelled'
    AND pa.time_start < p_end AND pa.time_end > p_start
    AND (p_exclude_appointment IS NULL OR pa.id <> p_exclude_appointment)
  UNION ALL
  SELECT 'absence', ab.id, ab.time_start, ab.time_end
  FROM public.instructor_absences ab
  WHERE ab.instructor_id = p_instructor
    AND p_date BETWEEN ab.start_date AND ab.end_date
    AND coalesce(ab.status,'confirmed') NOT IN ('rejected','cancelled')
    AND (coalesce(ab.is_full_day, true) OR ab.time_start IS NULL OR ab.time_end IS NULL
         OR (ab.time_start < p_end AND ab.time_end > p_start))
  UNION ALL
  SELECT 'recurring_block', rb.id, rb.start_time, rb.end_time
  FROM public.instructor_recurring_blocks rb
  WHERE rb.instructor_id = p_instructor
    AND coalesce(rb.is_active, true)
    AND coalesce(rb.status,'approved') NOT IN ('rejected','cancelled')
    AND p_date >= rb.valid_from AND (rb.valid_until IS NULL OR p_date <= rb.valid_until)
    AND extract(dow FROM p_date)::int = ANY(rb.weekdays)
    AND rb.start_time < p_end AND rb.end_time > p_start
$$;

CREATE OR REPLACE FUNCTION public.pa_slot_is_free(p_instructor uuid, p_date date, p_start time, p_end time, p_exclude_appointment uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT NOT EXISTS (SELECT 1 FROM public.pa_slot_conflicts(p_instructor, p_date, p_start, p_end, p_exclude_appointment)) $$;

-- Read-only reconciliation report. Never writes.
CREATE OR REPLACE FUNCTION public.pa_reconcile_report()
RETURNS TABLE(ticket_id uuid, item_total_before numeric, item_total_after numeric, ticket_total numeric, planned_action text, skip_reason text)
LANGUAGE sql STABLE SET search_path = public
AS $$
  WITH items AS (
    SELECT ti.* FROM public.ticket_items ti
    WHERE ti.item_type = 'private' AND ti.appointment_id IS NULL
  ),
  groups AS (
    SELECT i.ticket_id, i.date, i.time_start, i.time_end, i.instructor_id,
           count(*) AS n_rows,
           count(DISTINCT i.participant_id) AS n_participants,
           count(*) FILTER (WHERE i.participant_id IS NULL) AS n_null_participants,
           count(DISTINCT coalesce(i.status,'')) AS n_status,
           count(DISTINCT coalesce(i.instructor_confirmation,'')) AS n_conf
    FROM items i GROUP BY 1,2,3,4,5
  ),
  per_ticket AS (
    SELECT t.id AS ticket_id, t.total_amount, t.status AS ticket_status,
      (SELECT sum(coalesce(i.unit_price,0) * coalesce(i.quantity,1)) FROM items i WHERE i.ticket_id = t.id) AS before_total,
      (SELECT sum(public.pa_price(g.date, g.time_start::time, g.time_end::time, g.n_participants::int)) FROM groups g WHERE g.ticket_id = t.id) AS after_total,
      EXISTS (SELECT 1 FROM items i WHERE i.ticket_id = t.id AND i.date < public.pa_business_today()) AS is_past,
      EXISTS (SELECT 1 FROM items i WHERE i.ticket_id = t.id AND coalesce(i.status,'booked') NOT IN ('booked','scheduled','confirmed'))
        OR coalesce(t.status,'') IN ('cancelled','draft') AS not_scheduled,
      EXISTS (SELECT 1 FROM public.invoices v WHERE v.ticket_id = t.id
              AND (v.issued_at IS NOT NULL OR coalesce(v.status,'draft') NOT IN ('draft','cancelled','void'))) AS invoiced,
      EXISTS (SELECT 1 FROM groups g WHERE g.ticket_id = t.id
              AND (g.n_null_participants > 0 OR g.n_participants <> g.n_rows OR g.n_status > 1 OR g.n_conf > 1
                   OR g.instructor_id IS NULL OR g.time_start IS NULL OR g.time_end IS NULL)) AS ambiguous,
      EXISTS (SELECT 1 FROM items i WHERE i.ticket_id = t.id AND coalesce(i.is_period_override,false))
        OR EXISTS (SELECT 1 FROM public.ticket_item_overrides o JOIN items i ON i.id = o.ticket_item_id WHERE i.ticket_id = t.id) AS has_overrides
    FROM public.tickets t
    WHERE EXISTS (SELECT 1 FROM items i WHERE i.ticket_id = t.id)
  )
  SELECT p.ticket_id, p.before_total, p.after_total, p.total_amount,
         CASE WHEN r.reason IS NULL THEN 'backfill' ELSE 'skip' END,
         r.reason
  FROM per_ticket p
  CROSS JOIN LATERAL (SELECT CASE
      WHEN p.is_past THEN 'past'
      WHEN p.not_scheduled THEN 'not_scheduled'
      WHEN p.invoiced THEN 'invoiced'
      WHEN p.ambiguous THEN 'ambiguous_slot'
      WHEN p.has_overrides THEN 'has_overrides'
      WHEN p.before_total IS DISTINCT FROM p.after_total THEN 'total_mismatch'
      ELSE NULL END AS reason) r
$$;

-- Guard: appointment-linked billing lines must mirror their appointment (payroll no-bypass)
CREATE OR REPLACE FUNCTION public.pa_ticket_item_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE a record;
BEGIN
  IF NEW.appointment_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM public.private_appointments WHERE id = NEW.appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pa_guard: appointment % not found', NEW.appointment_id USING ERRCODE = '23503';
  END IF;
  IF NEW.date IS DISTINCT FROM a.date
     OR NEW.time_start::time IS DISTINCT FROM a.time_start
     OR NEW.time_end::time IS DISTINCT FROM a.time_end
     OR NEW.instructor_id IS DISTINCT FROM a.instructor_id
     OR NEW.instructor_confirmation IS DISTINCT FROM a.instructor_confirmation THEN
    RAISE EXCEPTION 'pa_guard: ticket item must mirror its private appointment (date, time, instructor, confirmation)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pa_ticket_item_guard
  BEFORE INSERT OR UPDATE ON public.ticket_items
  FOR EACH ROW EXECUTE FUNCTION public.pa_ticket_item_guard();

REVOKE ALL ON FUNCTION public.pa_business_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_price(date, time, time, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_is_protected(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_slot_conflicts(uuid, date, time, time, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_slot_is_free(uuid, date, time, time, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_reconcile_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pa_ticket_item_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_business_today() TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_price(date, time, time, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_is_protected(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_slot_conflicts(uuid, date, time, time, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_slot_is_free(uuid, date, time, time, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_reconcile_report() TO service_role;