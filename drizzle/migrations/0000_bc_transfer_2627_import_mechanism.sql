-- Controlled 26/27 lab transfer (package lab-v4-7a9b66d): additive, import-scoped.
-- 1) Unknown birth date is expressed as NULL.
ALTER TABLE public.customer_participants ALTER COLUMN birth_date DROP NOT NULL;
COMMENT ON COLUMN public.customer_participants.birth_date IS 'NULL = birth date unknown (e.g. Booking-Corner import without DOB).';

-- 2) Protected transfer tables (schema already restricted to postgres/service_role).
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.runs (
  run_id text PRIMARY KEY, package_id text NOT NULL, status text NOT NULL DEFAULT 'prepared',
  pre_snapshot jsonb, post_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now(), notes text);
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.map_teacher (
  lab_instructor_id uuid PRIMARY KEY, bc_source_id text NOT NULL, target_instructor_id uuid NOT NULL);
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.map_course (
  lab_course_id uuid PRIMARY KEY, target_course_id uuid NOT NULL, target_product_id uuid NOT NULL, rule text NOT NULL);
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.map_instance (
  lab_instance_id uuid PRIMARY KEY, target_instance_id uuid NOT NULL);
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.map_customer (
  lab_customer_id uuid PRIMARY KEY, action text NOT NULL CHECK (action IN ('insert','reuse','ambiguous')),
  target_customer_id uuid, candidates integer NOT NULL);
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.map_participant (
  lab_participant_id uuid PRIMARY KEY, canonical_lab_id uuid NOT NULL, action text NOT NULL CHECK (action IN ('insert','alias')));
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.sale_status (
  sale_code text PRIMARY KEY, run_id text NOT NULL, status text NOT NULL, source_hash text NOT NULL,
  lab_ticket_id uuid NOT NULL, applied_at timestamptz, rolled_back_at timestamptz);
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.crosswalk (
  entity text NOT NULL, source_id uuid NOT NULL, target_id uuid NOT NULL, action text NOT NULL,
  run_id text NOT NULL, sale_code text NOT NULL, after_hash text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, source_id));
CREATE INDEX IF NOT EXISTS crosswalk_sale_idx ON bc_transfer_20261003.crosswalk (sale_code);
CREATE INDEX IF NOT EXISTS crosswalk_target_idx ON bc_transfer_20261003.crosswalk (entity, target_id);
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.ledger (
  id bigserial PRIMARY KEY, run_id text NOT NULL, sale_code text, entity text, target_id uuid,
  kind text NOT NULL, data jsonb, data_hash text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS bc_transfer_20261003.active_tx (
  txid bigint NOT NULL, target_ticket_id uuid NOT NULL, run_id text NOT NULL, sale_code text NOT NULL,
  PRIMARY KEY (txid, target_ticket_id));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['runs','map_teacher','map_course','map_instance','map_customer','map_participant','sale_status','crosswalk','ledger','active_tx'] LOOP
    EXECUTE format('ALTER TABLE bc_transfer_20261003.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON bc_transfer_20261003.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON bc_transfer_20261003.%I TO service_role', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE bc_transfer_20261003.ledger_id_seq TO service_role;

-- 3) Transaction-scoped, import-gated suppression of the "lesson assigned" notification.
-- Only rows of tickets registered in active_tx for the CURRENT transaction id are skipped;
-- active_tx is writable only by owner/service_role and the row vanishes with the transaction.
CREATE OR REPLACE FUNCTION public.handle_ticket_item_instructor_notification()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_product_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM bc_transfer_20261003.active_tx a
             WHERE a.txid = txid_current() AND a.target_ticket_id = NEW.ticket_id) THEN
    RETURN NEW;
  END IF;

  -- Skip if no instructor assigned
  IF NEW.instructor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get product name
  SELECT name INTO v_product_name 
  FROM public.products 
  WHERE id = NEW.product_id;

  -- Case 1: New Assignment (instructor_id was NULL, now has value)
  IF (TG_OP = 'INSERT' AND NEW.instructor_id IS NOT NULL) OR 
     (TG_OP = 'UPDATE' AND OLD.instructor_id IS NULL AND NEW.instructor_id IS NOT NULL) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.assigned',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'booking_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'booking_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, ''),
        'meeting_point', COALESCE(NEW.meeting_point, 'Nicht angegeben'),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/confirmations'
      )
    );

  -- Case 2: Booking Cancelled
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'storno' AND NEW.status = 'storno' THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.cancelled',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'booking_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'booking_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, '')
      )
    );

  -- Case 3: Booking Details Changed (date or time) - same instructor
  ELSIF TG_OP = 'UPDATE' AND 
        OLD.instructor_id = NEW.instructor_id AND
        (OLD.date IS DISTINCT FROM NEW.date OR OLD.time_start IS DISTINCT FROM NEW.time_start OR OLD.time_end IS DISTINCT FROM NEW.time_end) THEN
    
    INSERT INTO public.instructor_notification_queue (
      instructor_id, notification_type, ticket_item_id, template_data
    ) VALUES (
      NEW.instructor_id,
      'instructor.lesson.changed',
      NEW.id,
      jsonb_build_object(
        'product_name', COALESCE(v_product_name, 'Privatstunde'),
        'old_date', to_char(OLD.date, 'DD.MM.YYYY'),
        'old_time', COALESCE(OLD.time_start::text, '') || ' - ' || COALESCE(OLD.time_end::text, ''),
        'new_date', to_char(NEW.date, 'DD.MM.YYYY'),
        'new_time', COALESCE(NEW.time_start::text, '') || ' - ' || COALESCE(NEW.time_end::text, ''),
        'portal_url', 'https://yeti-alpine-booking.lovable.app/instructor/schedule'
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Helpers (schema bc_transfer_20261003 is not exposed via the Data API).
CREATE OR REPLACE FUNCTION bc_transfer_20261003.pkg() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT payload FROM bc_transfer_20261003.source_packages WHERE id = 'lab-v4-7a9b66d'
$$;

CREATE OR REPLACE FUNCTION bc_transfer_20261003.row_hash(p_table text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE h text; BEGIN
  EXECUTE format('SELECT md5(to_jsonb(t)::text) FROM public.%I t WHERE t.id = $1', p_table) INTO h USING p_id;
  RETURN h;
END $$;

CREATE OR REPLACE FUNCTION bc_transfer_20261003.sale_bundle(p_sale text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := bc_transfer_20261003.pkg(); v_tid text; v_n int; v_ticket jsonb; v_cust text;
BEGIN
  SELECT count(*), min(x->>'entity_id') INTO v_n, v_tid FROM jsonb_array_elements(j->'journal') x
   WHERE x->>'entity' = 'tickets' AND x->>'sale_code' = p_sale;
  IF v_n <> 1 THEN RETURN NULL; END IF;
  SELECT x INTO v_ticket FROM jsonb_array_elements(j->'tickets') x WHERE x->>'id' = v_tid;
  v_cust := v_ticket->>'customer_id';
  RETURN jsonb_build_object(
    'sale_code', p_sale,
    'ticket', v_ticket,
    'sale', (SELECT x FROM jsonb_array_elements(j->'sales') x WHERE x->>'sale_code' = p_sale),
    'customer', (SELECT x FROM jsonb_array_elements(j->'customers') x WHERE x->>'id' = v_cust),
    'participants', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(j->'participants') x WHERE x->>'customer_id' = v_cust), '[]'),
    'items', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(j->'items') x WHERE x->>'ticket_id' = v_tid), '[]'),
    'appointments', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(j->'appointments') x WHERE x->>'ticket_id' = v_tid), '[]'),
    'appointment_participants', COALESCE((SELECT jsonb_agg(ap ORDER BY ap->>'id') FROM jsonb_array_elements(j->'appointment_participants') ap
        WHERE ap->>'appointment_id' IN (SELECT a->>'id' FROM jsonb_array_elements(j->'appointments') a WHERE a->>'ticket_id' = v_tid)), '[]'),
    'enrollments', COALESCE((SELECT jsonb_agg(e ORDER BY e->>'id') FROM jsonb_array_elements(j->'enrollments') e
        WHERE e->>'ticket_item_id' IN (SELECT i->>'id' FROM jsonb_array_elements(j->'items') i WHERE i->>'ticket_id' = v_tid)), '[]'),
    'positions', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'source_position_id') FROM jsonb_array_elements(j->'positions') x WHERE x->>'sale_code' = p_sale), '[]'),
    'unresolved_tickets', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'csv_ticket_number') FROM jsonb_array_elements(j->'unresolved_tickets') x WHERE x->>'sale_code' = p_sale), '[]')
  );
END $$;

-- 5) Prepare: build mapping tables (writes only to the protected schema).
CREATE OR REPLACE FUNCTION bc_transfer_20261003.prepare(p_run text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := bc_transfer_20261003.pkg(); v_season uuid;
BEGIN
  IF j IS NULL THEN RAISE EXCEPTION 'package missing'; END IF;
  IF EXISTS (SELECT 1 FROM bc_transfer_20261003.sale_status WHERE status = 'applied') THEN
    RAISE EXCEPTION 'prepare refused: sales already applied; mappings are frozen';
  END IF;
  INSERT INTO bc_transfer_20261003.runs (run_id, package_id) VALUES (p_run, 'lab-v4-7a9b66d')
    ON CONFLICT (run_id) DO NOTHING;
  SELECT id INTO v_season FROM public.seasons WHERE name = 'Winter 26/27';
  DELETE FROM bc_transfer_20261003.map_teacher; DELETE FROM bc_transfer_20261003.map_course;
  DELETE FROM bc_transfer_20261003.map_instance; DELETE FROM bc_transfer_20261003.map_customer;
  DELETE FROM bc_transfer_20261003.map_participant;

  -- Teachers: lab id -> Booking-Corner id (lab journal) -> existing YETI source link (unique, active).
  INSERT INTO bc_transfer_20261003.map_teacher
  SELECT (x->>'entity_id')::uuid, split_part(x->>'source_key', ':', 2), l.instructor_id
    FROM jsonb_array_elements(j->'journal') x
    JOIN public.instructor_source_links l ON l.source_system = 'booking_corner' AND l.source_id = split_part(x->>'source_key', ':', 2)
    JOIN public.instructors i ON i.id = l.instructor_id AND i.status = 'active'
   WHERE x->>'entity' = 'instructors'
     AND (SELECT count(DISTINCT l2.instructor_id) FROM public.instructor_source_links l2
           WHERE l2.source_system = 'booking_corner' AND l2.source_id = split_part(x->>'source_key', ':', 2)) = 1;

  -- Courses: exact type + discipline + level identity to the existing 26/27 course (no shells copied).
  WITH lc AS (
    SELECT (x->>'id')::uuid id, x->>'course_type' ct, x->>'discipline' d,
           trim(split_part(regexp_replace(x->>'name', '^BC-Import (Ski|Snowboard) ', ''), ' · ', 1)) lvl
      FROM jsonb_array_elements(j->'courses') x),
  tc AS (
    SELECT lc.id lab_id,
      CASE WHEN lc.ct = 'weekly' AND lc.d = 'ski' AND lc.lvl = 'Schwarzer Prinz/Prinzessin'
           THEN (SELECT g.id FROM public.group_courses g WHERE g.name LIKE '26/27 %' AND g.course_type = 'weekly'
                   AND g.discipline = 'ski' AND g.skill_level_id = 'ski_schwarzer_prinz' AND g.name NOT LIKE '%Altvariante%')
           ELSE (SELECT g.id FROM public.group_courses g WHERE g.course_type = lc.ct AND g.discipline = lc.d
                   AND g.name = CASE lc.ct WHEN 'saturday_course' THEN '26/27 Samstag ' ELSE '26/27 ' END
                                || initcap(lc.d) || ' ' || lc.lvl)
      END tgt,
      CASE WHEN lc.lvl = 'Schwarzer Prinz/Prinzessin' THEN 'level_identity:ski_schwarzer_prinz' ELSE 'exact_type_discipline_level' END rule
    FROM lc)
  INSERT INTO bc_transfer_20261003.map_course
  SELECT tc.lab_id, tc.tgt,
    (SELECT v.product_id FROM public.bc_2627_course_product_variants v JOIN public.products p ON p.id = v.product_id
      WHERE v.course_id = tc.tgt AND p.duration_minutes = 120
        AND ((g.name ILIKE '%Windel%') = (p.name ILIKE '%Windel%'))),
    tc.rule
  FROM tc JOIN public.group_courses g ON g.id = tc.tgt;

  -- Instances: same mapped course, date, start and end time; must be exactly one.
  INSERT INTO bc_transfer_20261003.map_instance
  SELECT (i->>'id')::uuid, gi.id
    FROM jsonb_array_elements(j->'instances') i
    JOIN bc_transfer_20261003.map_course mc ON mc.lab_course_id = (i->>'course_id')::uuid
    JOIN public.group_course_instances gi ON gi.course_id = mc.target_course_id AND gi.date = (i->>'date')::date
         AND gi.start_time = (i->>'start_time')::time AND gi.end_time = (i->>'end_time')::time
   WHERE (SELECT count(*) FROM public.group_course_instances g2 WHERE g2.course_id = mc.target_course_id
            AND g2.date = (i->>'date')::date AND g2.start_time = (i->>'start_time')::time AND g2.end_time = (i->>'end_time')::time) = 1;

  -- Customers: evidence-backed unique identity (email, phone >= 9 digits, exact name + zip).
  INSERT INTO bc_transfer_20261003.map_customer
  SELECT (x->>'id')::uuid,
    CASE cardinality(ids) WHEN 0 THEN 'insert' WHEN 1 THEN 'reuse' ELSE 'ambiguous' END,
    CASE WHEN cardinality(ids) = 1 THEN ids[1] END, cardinality(ids)
  FROM (SELECT x, array(SELECT DISTINCT c.id FROM public.customers c WHERE c.merged_into_id IS NULL AND (
          (coalesce(x->>'email','') <> '' AND lower(c.email) = lower(x->>'email')) OR
          (length(public.yeti_digits(x->>'phone')) >= 9 AND public.yeti_digits(c.phone) = public.yeti_digits(x->>'phone')) OR
          (lower(c.first_name) = lower(x->>'first_name') AND lower(c.last_name) = lower(x->>'last_name') AND c.zip = x->>'zip'))) ids
        FROM jsonb_array_elements(j->'customers') x) s;

  -- Participants: active canonical rows are imported; merged rows become aliases only
  -- (same customer, exact name, non-empty equal DOB, single hop).
  INSERT INTO bc_transfer_20261003.map_participant
  SELECT (x->>'id')::uuid, (x->>'id')::uuid, 'insert' FROM jsonb_array_elements(j->'participants') x WHERE x->>'merged_into_id' IS NULL;
  INSERT INTO bc_transfer_20261003.map_participant
  SELECT (x->>'id')::uuid, (y->>'id')::uuid, 'alias'
    FROM jsonb_array_elements(j->'participants') x
    JOIN jsonb_array_elements(j->'participants') y ON y->>'id' = x->>'merged_into_id'
   WHERE y->>'merged_into_id' IS NULL AND y->>'customer_id' = x->>'customer_id'
     AND lower(y->>'first_name') = lower(x->>'first_name') AND lower(coalesce(y->>'last_name','')) = lower(coalesce(x->>'last_name',''))
     AND x->>'birth_date' IS NOT NULL AND x->>'birth_date' = y->>'birth_date';

  RETURN jsonb_build_object(
    'teachers', (SELECT count(*) FROM bc_transfer_20261003.map_teacher),
    'courses_mapped', (SELECT count(*) FROM bc_transfer_20261003.map_course WHERE target_course_id IS NOT NULL AND target_product_id IS NOT NULL),
    'courses_total', jsonb_array_length(j->'courses'),
    'distinct_target_courses', (SELECT count(DISTINCT target_course_id) FROM bc_transfer_20261003.map_course),
    'instances_mapped', (SELECT count(*) FROM bc_transfer_20261003.map_instance),
    'instances_total', jsonb_array_length(j->'instances'),
    'distinct_target_instances', (SELECT count(DISTINCT target_instance_id) FROM bc_transfer_20261003.map_instance),
    'customers', (SELECT jsonb_object_agg(action, n) FROM (SELECT action, count(*) n FROM bc_transfer_20261003.map_customer GROUP BY 1) s),
    'participants', (SELECT jsonb_object_agg(action, n) FROM (SELECT action, count(*) n FROM bc_transfer_20261003.map_participant GROUP BY 1) s),
    'participants_total', jsonb_array_length(j->'participants'),
    'season_2627', v_season);
END $$;

-- 6) Snapshot of target tables excluding rows created by this import (count + row hash).
CREATE OR REPLACE FUNCTION bc_transfer_20261003.snapshot() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t text; n bigint; h text; r jsonb := '{}';
BEGIN
  FOREACH t IN ARRAY ARRAY['tickets','ticket_items','customers','customer_participants','private_appointments',
    'private_appointment_participants','group_course_enrollments','group_course_instances','group_courses','products',
    'instructors','instructor_source_links','instructor_absences','training_course_dates','invoices','payments',
    'instructor_notification_queue','notification_queue','notifications','email_logs','booking_email_deliveries',
    'whatsapp_notifications','ticket_history','ticket_comments','seasons','product_price_tiers'] LOOP
    EXECUTE format($q$SELECT count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), ''))
                     FROM public.%I t WHERE NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.crosswalk c
                     WHERE c.entity = %L AND c.target_id = t.id)$q$, t, t) INTO n, h;
    r := r || jsonb_build_object(t, jsonb_build_object('count', n, 'hash', h));
  END LOOP;
  RETURN r;
END $$;

-- 7) Dry run: read-only per-sale validation against the current target.
CREATE OR REPLACE FUNCTION bc_transfer_20261003.dry_run() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := bc_transfer_20261003.pkg(); s record; b jsonb; probs jsonb := '[]'; ok int := 0;
  n_items int := 0; n_pa int := 0; n_pap int := 0; n_enr int := 0; n_pos int := 0; n_people int := 0; n_alias int := 0;
  n_sat int := 0; n_week int := 0; total numeric := 0; pos_total bigint := 0; nodob int := 0; p text[];
BEGIN
  FOR s IN SELECT x->>'sale_code' sale FROM jsonb_array_elements(j->'sales') x ORDER BY 1 LOOP
    p := ARRAY[]::text[];
    b := bc_transfer_20261003.sale_bundle(s.sale);
    IF b IS NULL OR b->'ticket' IS NULL OR b->'customer' IS NULL THEN
      probs := probs || jsonb_build_object('sale', s.sale, 'problems', '["no unique ticket/customer"]'::jsonb); CONTINUE;
    END IF;
    IF (SELECT action FROM bc_transfer_20261003.map_customer WHERE lab_customer_id = (b->'customer'->>'id')::uuid) IS DISTINCT FROM 'insert'
       AND (SELECT action FROM bc_transfer_20261003.map_customer WHERE lab_customer_id = (b->'customer'->>'id')::uuid) IS DISTINCT FROM 'reuse' THEN
      p := p || 'customer ambiguous/unmapped'; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(j->'tickets') t WHERE t->>'customer_id' = b->'customer'->>'id') <> 1 THEN
      p := p || 'customer shared by several sales'; END IF;
    IF EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = (b->'ticket'->>'id')::uuid)
       AND NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.sale_status ss WHERE ss.sale_code = s.sale AND ss.status = 'applied') THEN
      p := p || 'ticket id already exists in target'; END IF;
    -- participants referenced must be canonical members of the same customer
    IF EXISTS (SELECT 1 FROM (
         SELECT i->>'participant_id' pid FROM jsonb_array_elements(b->'items') i WHERE i->>'participant_id' IS NOT NULL
         UNION SELECT ap->>'participant_id' FROM jsonb_array_elements(b->'appointment_participants') ap
         UNION SELECT e->>'participant_id' FROM jsonb_array_elements(b->'enrollments') e) r
       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b->'participants') x JOIN bc_transfer_20261003.map_participant mp
               ON mp.lab_participant_id = (x->>'id')::uuid AND mp.action = 'insert' WHERE x->>'id' = r.pid)) THEN
      p := p || 'participant reference not canonical/same customer'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(b->'participants') x WHERE x->>'merged_into_id' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.map_participant mp WHERE mp.lab_participant_id = (x->>'id')::uuid AND mp.action = 'alias')) THEN
      p := p || 'merged participant violates alias rule'; END IF;
    -- teachers
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(b->'appointments') a WHERE a->>'instructor_id' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.map_teacher mt WHERE mt.lab_instructor_id = (a->>'instructor_id')::uuid)) THEN
      p := p || 'teacher unmapped'; END IF;
    -- teacher conflicts (existing non-import work, absences)
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(b->'appointments') a
        JOIN bc_transfer_20261003.map_teacher mt ON mt.lab_instructor_id = (a->>'instructor_id')::uuid
       WHERE EXISTS (SELECT 1 FROM public.ticket_items ti WHERE ti.instructor_id = mt.target_instructor_id AND ti.date = (a->>'date')::date
                AND coalesce(ti.status,'') NOT IN ('cancelled','storno') AND ti.time_start < (a->>'time_end')::time AND ti.time_end > (a->>'time_start')::time
                AND NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.crosswalk c WHERE c.entity = 'ticket_items' AND c.target_id = ti.id))
          OR EXISTS (SELECT 1 FROM public.group_course_instances gi WHERE gi.instructor_id = mt.target_instructor_id AND gi.date = (a->>'date')::date
                AND gi.start_time < (a->>'time_end')::time AND gi.end_time > (a->>'time_start')::time)
          OR EXISTS (SELECT 1 FROM public.instructor_absences ab WHERE ab.instructor_id = mt.target_instructor_id
                AND (a->>'date')::date BETWEEN ab.start_date AND ab.end_date)) THEN
      p := p || 'teacher schedule conflict'; END IF;
    -- products / instances
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(b->'items') i WHERE i->>'item_type' = 'group' AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(b->'enrollments') e
           JOIN jsonb_array_elements(j->'instances') li ON li->>'id' = e->>'instance_id'
           JOIN bc_transfer_20261003.map_instance mi ON mi.lab_instance_id = (li->>'id')::uuid
           JOIN bc_transfer_20261003.map_course mc ON mc.lab_course_id = (li->>'course_id')::uuid AND mc.target_product_id IS NOT NULL
          WHERE e->>'ticket_item_id' = i->>'id')) THEN
      p := p || 'group line without mapped instance/product'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(b->'items') i
         JOIN jsonb_array_elements(j->'products') lp ON lp->>'id' = i->>'product_id'
        WHERE i->>'item_type' = 'private' AND coalesce(lp->>'discipline','') NOT IN ('ski','snowboard')) THEN
      p := p || 'private line without discipline'; END IF;
    -- money
    IF (SELECT coalesce(sum((i->>'line_total')::numeric), 0) FROM jsonb_array_elements(b->'items') i) <> (b->'ticket'->>'total_amount')::numeric
       OR (SELECT coalesce(sum((x->>'amount_minor_units')::bigint), 0) FROM jsonb_array_elements(b->'positions') x) <> round((b->'ticket'->>'total_amount')::numeric * 100) THEN
      p := p || 'amount mismatch lines/ticket/positions'; END IF;
    IF jsonb_array_length(b->'positions') = 0 THEN p := p || 'no source positions'; END IF;

    IF cardinality(p) > 0 THEN probs := probs || jsonb_build_object('sale', s.sale, 'problems', to_jsonb(p)); ELSE ok := ok + 1; END IF;
    n_items := n_items + jsonb_array_length(b->'items'); n_pa := n_pa + jsonb_array_length(b->'appointments');
    n_pap := n_pap + jsonb_array_length(b->'appointment_participants'); n_enr := n_enr + jsonb_array_length(b->'enrollments');
    n_pos := n_pos + jsonb_array_length(b->'positions');
    n_people := n_people + (SELECT count(*) FROM jsonb_array_elements(b->'participants') x WHERE x->>'merged_into_id' IS NULL);
    n_alias := n_alias + (SELECT count(*) FROM jsonb_array_elements(b->'participants') x WHERE x->>'merged_into_id' IS NOT NULL);
    nodob := nodob + (SELECT count(*) FROM jsonb_array_elements(b->'participants') x WHERE x->>'merged_into_id' IS NULL AND x->>'birth_date' IS NULL);
    n_sat := n_sat + (SELECT count(*) FROM jsonb_array_elements(b->'enrollments') e JOIN jsonb_array_elements(j->'instances') li ON li->>'id' = e->>'instance_id'
                       JOIN jsonb_array_elements(j->'courses') lc ON lc->>'id' = li->>'course_id' WHERE lc->>'course_type' = 'saturday_course');
    total := total + (b->'ticket'->>'total_amount')::numeric;
    pos_total := pos_total + (SELECT coalesce(sum((x->>'amount_minor_units')::bigint), 0) FROM jsonb_array_elements(b->'positions') x);
  END LOOP;
  n_week := n_enr - n_sat;
  RETURN jsonb_build_object('sales_total', jsonb_array_length(j->'sales'), 'sales_ok', ok, 'problems', probs,
    'positions', n_pos, 'positions_total', jsonb_array_length(j->'positions'), 'lines', n_items, 'private_appointments', n_pa,
    'appointment_participants', n_pap, 'enrollments', n_enr, 'enrollments_weekly', n_week, 'enrollments_saturday', n_sat,
    'people_active', n_people, 'people_aliases', n_alias, 'people_without_dob', nodob,
    'ticket_total', total, 'positions_total_minor', pos_total,
    'saturday_dates_present', (SELECT count(*) FROM jsonb_array_elements(j->'saturday_dates') sd
        JOIN bc_transfer_20261003.map_course mc ON mc.lab_course_id = (sd->>'training_id')::uuid
       WHERE EXISTS (SELECT 1 FROM public.training_course_dates t WHERE t.training_id = mc.target_course_id AND t.date = (sd->>'date')::date)),
    'saturday_dates_total', jsonb_array_length(j->'saturday_dates'));
END $$;

-- 8) Apply one sale atomically and idempotently.
CREATE OR REPLACE FUNCTION bc_transfer_20261003.apply_sale(p_run text, p_sale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := bc_transfer_20261003.pkg(); b jsonb; v_hash text; st record; v_tid uuid; v_cust_lab uuid; mcu record;
  v_cust uuid; x jsonb; c public.customers; pr public.customer_participants; ti public.ticket_items; pa public.private_appointments;
  v_season uuid; v_num text; v_changed text[]; v_pre jsonb; f text; cw record; n_ins int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bc_transfer_20261003:' || p_sale));
  IF NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.runs WHERE run_id = p_run) THEN RAISE EXCEPTION 'unknown run %', p_run; END IF;
  b := bc_transfer_20261003.sale_bundle(p_sale);
  IF b IS NULL THEN RAISE EXCEPTION 'sale % not found / not unique', p_sale; END IF;
  v_hash := md5(b::text);
  SELECT * INTO st FROM bc_transfer_20261003.sale_status WHERE sale_code = p_sale;
  IF FOUND AND st.status = 'applied' THEN
    IF st.source_hash <> v_hash THEN RAISE EXCEPTION 'source changed for already applied sale %', p_sale; END IF;
    RETURN jsonb_build_object('sale', p_sale, 'status', 'already_applied');
  END IF;

  v_tid := (b->'ticket'->>'id')::uuid; v_cust_lab := (b->'customer'->>'id')::uuid;
  SELECT id INTO v_season FROM public.seasons WHERE name = 'Winter 26/27';
  INSERT INTO bc_transfer_20261003.active_tx VALUES (txid_current(), v_tid, p_run, p_sale);

  -- Customer
  SELECT * INTO mcu FROM bc_transfer_20261003.map_customer WHERE lab_customer_id = v_cust_lab;
  IF NOT FOUND OR mcu.action NOT IN ('insert','reuse') THEN RAISE EXCEPTION 'customer not uniquely mapped for sale %', p_sale; END IF;
  IF mcu.action = 'reuse' THEN
    v_cust := mcu.target_customer_id;
    SELECT * INTO c FROM public.customers WHERE id = v_cust FOR UPDATE;
    v_pre := to_jsonb(c); v_changed := ARRAY[]::text[];
    FOREACH f IN ARRAY ARRAY['phone','first_name','street','house_number','zip','city'] LOOP
      IF coalesce(v_pre->>f, '') = '' AND coalesce(b->'customer'->>f, '') <> '' THEN v_changed := v_changed || f; END IF;
    END LOOP;
    INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, entity, target_id, kind, data, data_hash)
      VALUES (p_run, p_sale, 'customers', v_cust, 'preimage', jsonb_build_object('row', v_pre, 'filled_fields', to_jsonb(v_changed)), md5(v_pre::text));
    IF cardinality(v_changed) > 0 THEN
      UPDATE public.customers SET
        phone = CASE WHEN 'phone' = ANY(v_changed) THEN b->'customer'->>'phone' ELSE phone END,
        first_name = CASE WHEN 'first_name' = ANY(v_changed) THEN b->'customer'->>'first_name' ELSE first_name END,
        street = CASE WHEN 'street' = ANY(v_changed) THEN b->'customer'->>'street' ELSE street END,
        house_number = CASE WHEN 'house_number' = ANY(v_changed) THEN b->'customer'->>'house_number' ELSE house_number END,
        zip = CASE WHEN 'zip' = ANY(v_changed) THEN b->'customer'->>'zip' ELSE zip END,
        city = CASE WHEN 'city' = ANY(v_changed) THEN b->'customer'->>'city' ELSE city END
      WHERE id = v_cust;
    END IF;
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('customers', v_cust_lab, v_cust, 'reuse', p_run, p_sale);
  ELSE
    c := jsonb_populate_record(NULL::public.customers, b->'customer');
    c.customer_number := NULL; c.merged_into_id := NULL; c.merged_at := NULL; c.merged_by := NULL;
    c.is_archived := false; c.created_at := now(); c.holiday_address := coalesce(c.holiday_address, '');
    c.kulanz_score := coalesce(c.kulanz_score, 0); c.additional_phones := coalesce(c.additional_phones, '[]');
    c.additional_emails := coalesce(c.additional_emails, '[]');
    INSERT INTO public.customers SELECT c.*;
    v_cust := c.id;
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('customers', v_cust_lab, v_cust, 'insert', p_run, p_sale);
  END IF;

  -- People: canonical rows inserted, merged rows recorded as aliases only
  FOR x IN SELECT * FROM jsonb_array_elements(b->'participants') LOOP
    IF x->>'merged_into_id' IS NULL THEN
      pr := jsonb_populate_record(NULL::public.customer_participants, x);
      pr.customer_id := v_cust; pr.merged_into_id := NULL; pr.merged_at := NULL; pr.merged_by := NULL;
      pr.current_ski_training_id := NULL; pr.current_snowboard_training_id := NULL; pr.is_archived := false; pr.created_at := now();
      INSERT INTO public.customer_participants SELECT pr.*;
      INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
        VALUES ('customer_participants', pr.id, pr.id, 'insert', p_run, p_sale);
    ELSE
      INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
        SELECT 'participant_alias', mp.lab_participant_id, mp.canonical_lab_id, 'alias', p_run, p_sale
          FROM bc_transfer_20261003.map_participant mp WHERE mp.lab_participant_id = (x->>'id')::uuid AND mp.action = 'alias';
      IF NOT FOUND THEN RAISE EXCEPTION 'merged participant without valid alias in sale %', p_sale; END IF;
    END IF;
  END LOOP;

  -- Ticket (native number allocator, season set explicitly, payment unknown)
  v_num := public.generate_ticket_number();
  INSERT INTO public.tickets (id, ticket_number, customer_id, status, total_amount, paid_amount, payment_method, notes, internal_notes,
      created_by, ticket_type, skip_documents, notes_for_instructors, season_id, source, reservation_token, participant_count, total_participants)
  VALUES (v_tid, v_num, v_cust, 'confirmed', (b->'ticket'->>'total_amount')::numeric, NULL, NULL, b->'ticket'->>'notes',
      concat_ws(E'\n', nullif(b->'ticket'->>'internal_notes', ''), 'Booking-Corner-Übernahme 26/27, Verkauf ' || p_sale || ' – Zahlungsstatus unbekannt.'),
      NULL, coalesce(b->'ticket'->>'ticket_type', 'standard'), true, b->'ticket'->>'notes_for_instructors', v_season, 'office', NULL,
      (b->'ticket'->>'participant_count')::int, (b->'ticket'->>'total_participants')::int);
  INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
    VALUES ('tickets', v_tid, v_tid, 'insert', p_run, p_sale);
  INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
    SELECT 'ticket_history', h.id, h.id, 'insert', p_run, p_sale FROM public.ticket_history h WHERE h.ticket_id = v_tid;

  -- Private appointments (teacher mapped by verified source id; confirmation pending)
  FOR x IN SELECT * FROM jsonb_array_elements(b->'appointments') LOOP
    pa := jsonb_populate_record(NULL::public.private_appointments, x);
    pa.instructor_id := (SELECT target_instructor_id FROM bc_transfer_20261003.map_teacher WHERE lab_instructor_id = (x->>'instructor_id')::uuid);
    IF x->>'instructor_id' IS NOT NULL AND pa.instructor_id IS NULL THEN RAISE EXCEPTION 'teacher unmapped in sale %', p_sale; END IF;
    pa.instructor_confirmation := CASE WHEN pa.instructor_id IS NULL THEN NULL ELSE 'pending' END;
    pa.confirmed_at := NULL; pa.confirmed_by := NULL; pa.created_at := now(); pa.updated_at := now();
    INSERT INTO public.private_appointments SELECT pa.*;
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('private_appointments', pa.id, pa.id, 'insert', p_run, p_sale);
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(b->'appointment_participants') LOOP
    INSERT INTO public.private_appointment_participants (id, appointment_id, participant_id)
      VALUES ((x->>'id')::uuid, (x->>'appointment_id')::uuid, (x->>'participant_id')::uuid);
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('private_appointment_participants', (x->>'id')::uuid, (x->>'id')::uuid, 'insert', p_run, p_sale);
  END LOOP;

  -- Billing lines (recorded source prices kept)
  FOR x IN SELECT * FROM jsonb_array_elements(b->'items') LOOP
    ti := jsonb_populate_record(NULL::public.ticket_items, x);
    ti.created_at := now(); ti.instructor_confirmed_at := NULL; ti.instructor_declined_at := NULL; ti.instructor_decline_reason := NULL;
    ti.confirmation_reset_at := NULL; ti.confirmation_reset_reason := NULL;
    IF x->>'item_type' = 'private' THEN
      SELECT p.id INTO ti.product_id FROM public.products p JOIN jsonb_array_elements(j->'products') lp ON lp->>'id' = x->>'product_id'
       WHERE p.season_id = v_season AND p.type = 'private' AND p.discipline = lp->>'discipline';
      SELECT a.instructor_id, a.instructor_confirmation INTO ti.instructor_id, ti.instructor_confirmation
        FROM public.private_appointments a WHERE a.id = ti.appointment_id;
    ELSE
      SELECT mc.target_product_id, g.name INTO ti.product_id, ti.group_name
        FROM jsonb_array_elements(b->'enrollments') e
        JOIN jsonb_array_elements(j->'instances') li ON li->>'id' = e->>'instance_id'
        JOIN bc_transfer_20261003.map_course mc ON mc.lab_course_id = (li->>'course_id')::uuid
        JOIN public.group_courses g ON g.id = mc.target_course_id
       WHERE e->>'ticket_item_id' = x->>'id';
      ti.instructor_id := NULL; ti.instructor_confirmation := NULL;
    END IF;
    IF ti.product_id IS NULL THEN RAISE EXCEPTION 'product unmapped for line % in sale %', ti.id, p_sale; END IF;
    INSERT INTO public.ticket_items SELECT ti.*;
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('ticket_items', ti.id, ti.id, 'insert', p_run, p_sale);
  END LOOP;

  -- Enrollments on existing course days (no new days)
  FOR x IN SELECT * FROM jsonb_array_elements(b->'enrollments') LOOP
    INSERT INTO public.group_course_enrollments (id, instance_id, ticket_item_id, participant_id, attendance_status, notes)
    SELECT (x->>'id')::uuid, mi.target_instance_id, (x->>'ticket_item_id')::uuid, (x->>'participant_id')::uuid, 'registered', x->>'notes'
      FROM bc_transfer_20261003.map_instance mi WHERE mi.lab_instance_id = (x->>'instance_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'instance unmapped in sale %', p_sale; END IF;
    INSERT INTO bc_transfer_20261003.crosswalk (entity, source_id, target_id, action, run_id, sale_code)
      VALUES ('group_course_enrollments', (x->>'id')::uuid, (x->>'id')::uuid, 'insert', p_run, p_sale);
  END LOOP;

  -- Assertions
  IF (SELECT coalesce(sum(line_total), 0) FROM public.ticket_items WHERE ticket_id = v_tid) <> (b->'ticket'->>'total_amount')::numeric
     OR (SELECT coalesce(sum((p->>'amount_minor_units')::bigint), 0) FROM jsonb_array_elements(b->'positions') p) <> round((b->'ticket'->>'total_amount')::numeric * 100) THEN
    RAISE EXCEPTION 'amount mismatch in sale %', p_sale;
  END IF;
  IF EXISTS (SELECT 1 FROM public.instructor_notification_queue q JOIN public.ticket_items t ON t.id = q.ticket_item_id WHERE t.ticket_id = v_tid) THEN
    RAISE EXCEPTION 'notification would be queued for sale %', p_sale;
  END IF;

  -- After-images and evidence
  FOR cw IN SELECT * FROM bc_transfer_20261003.crosswalk WHERE sale_code = p_sale AND entity <> 'participant_alias' LOOP
    UPDATE bc_transfer_20261003.crosswalk SET after_hash = bc_transfer_20261003.row_hash(cw.entity, cw.target_id)
     WHERE entity = cw.entity AND source_id = cw.source_id;
    IF cw.action = 'insert' THEN n_ins := n_ins + 1; END IF;
  END LOOP;
  IF mcu.action = 'reuse' THEN
    INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, entity, target_id, kind, data, data_hash)
      SELECT p_run, p_sale, 'customers', v_cust, 'afterimage', to_jsonb(cu), md5(to_jsonb(cu)::text) FROM public.customers cu WHERE cu.id = v_cust;
  END IF;
  INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, entity, target_id, kind, data, data_hash)
    VALUES (p_run, p_sale, 'tickets', v_tid, 'evidence', jsonb_build_object('sale', b->'sale', 'positions', b->'positions',
            'unresolved_tickets', b->'unresolved_tickets', 'lab_ticket_number', b->'ticket'->>'ticket_number', 'source_hash', v_hash,
            'payment', 'unknown – paid_amount NULL, no settlement implied'), v_hash);
  INSERT INTO bc_transfer_20261003.sale_status (sale_code, run_id, status, source_hash, lab_ticket_id, applied_at)
    VALUES (p_sale, p_run, 'applied', v_hash, v_tid, now())
    ON CONFLICT (sale_code) DO UPDATE SET status = 'applied', run_id = p_run, source_hash = v_hash, applied_at = now(), rolled_back_at = NULL;
  DELETE FROM bc_transfer_20261003.active_tx WHERE txid = txid_current();
  RETURN jsonb_build_object('sale', p_sale, 'status', 'applied', 'ticket_number', v_num, 'inserted_rows', n_ins, 'customer', mcu.action);
END $$;

-- 9) Scoped rollback of one sale: refuses on later edits or foreign references.
CREATE OR REPLACE FUNCTION bc_transfer_20261003.rollback_sale(p_run text, p_sale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cw record; fk record; conflicts jsonb := '[]'; n bigint; pre jsonb; aft text; fields jsonb; ent text; v_cust uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bc_transfer_20261003:' || p_sale));
  IF NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.sale_status WHERE sale_code = p_sale AND status = 'applied' AND run_id = p_run) THEN
    RETURN jsonb_build_object('sale', p_sale, 'status', 'not_applied');
  END IF;
  FOR cw IN SELECT * FROM bc_transfer_20261003.crosswalk WHERE sale_code = p_sale AND entity <> 'participant_alias' LOOP
    IF bc_transfer_20261003.row_hash(cw.entity, cw.target_id) IS DISTINCT FROM cw.after_hash THEN
      conflicts := conflicts || jsonb_build_object('entity', cw.entity, 'id', cw.target_id, 'reason', 'changed_after_import');
    END IF;
  END LOOP;
  -- any row outside this sale's import that references an inserted row blocks the rollback
  FOR fk IN SELECT c.conrelid::regclass::text src, a.attname col, c.confrelid::regclass::text dst
              FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
             WHERE c.contype = 'f' AND cardinality(c.conkey) = 1
               AND c.confrelid::regclass::text IN ('tickets','customers','customer_participants','ticket_items','private_appointments') LOOP
    EXECUTE format($q$SELECT count(*) FROM public.%I r WHERE r.%I IN (SELECT target_id FROM bc_transfer_20261003.crosswalk
                       WHERE sale_code = %L AND entity = %L AND action = 'insert')
                     AND NOT EXISTS (SELECT 1 FROM bc_transfer_20261003.crosswalk x WHERE x.sale_code = %L AND x.entity = %L AND x.target_id = r.id)$q$,
                   fk.src, fk.col, p_sale, fk.dst, p_sale, fk.src) INTO n;
    IF n > 0 THEN conflicts := conflicts || jsonb_build_object('entity', fk.src, 'references', fk.dst, 'rows', n, 'reason', 'foreign_reference'); END IF;
  END LOOP;
  SELECT target_id INTO v_cust FROM bc_transfer_20261003.crosswalk WHERE sale_code = p_sale AND entity = 'customers' AND action = 'reuse';
  IF jsonb_array_length(conflicts) > 0 THEN
    INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, kind, data) VALUES (p_run, p_sale, 'rollback_refused', conflicts);
    RETURN jsonb_build_object('sale', p_sale, 'status', 'refused', 'conflicts', conflicts);
  END IF;
  FOREACH ent IN ARRAY ARRAY['group_course_enrollments','private_appointment_participants','ticket_items','private_appointments',
                             'ticket_history','tickets','customer_participants','customers'] LOOP
    EXECUTE format($q$DELETE FROM public.%I t USING bc_transfer_20261003.crosswalk c
                     WHERE c.sale_code = %L AND c.entity = %L AND c.action = 'insert' AND c.target_id = t.id$q$, ent, p_sale, ent);
  END LOOP;
  IF v_cust IS NOT NULL THEN
    SELECT data->'row', data->'filled_fields' INTO pre, fields FROM bc_transfer_20261003.ledger
     WHERE sale_code = p_sale AND entity = 'customers' AND kind = 'preimage' ORDER BY id DESC LIMIT 1;
    UPDATE public.customers SET
      phone = CASE WHEN fields ? 'phone' THEN pre->>'phone' ELSE phone END,
      first_name = CASE WHEN fields ? 'first_name' THEN pre->>'first_name' ELSE first_name END,
      street = CASE WHEN fields ? 'street' THEN pre->>'street' ELSE street END,
      house_number = CASE WHEN fields ? 'house_number' THEN pre->>'house_number' ELSE house_number END,
      zip = CASE WHEN fields ? 'zip' THEN pre->>'zip' ELSE zip END,
      city = CASE WHEN fields ? 'city' THEN pre->>'city' ELSE city END
    WHERE id = v_cust;
    IF md5(to_jsonb((SELECT cu FROM public.customers cu WHERE cu.id = v_cust))::text) IS DISTINCT FROM md5(pre::text) THEN
      RAISE EXCEPTION 'reused customer % could not be restored exactly', v_cust;
    END IF;
  END IF;
  DELETE FROM bc_transfer_20261003.crosswalk WHERE sale_code = p_sale;
  UPDATE bc_transfer_20261003.sale_status SET status = 'rolled_back', rolled_back_at = now() WHERE sale_code = p_sale;
  INSERT INTO bc_transfer_20261003.ledger (run_id, sale_code, kind, data) VALUES (p_run, p_sale, 'rolled_back', NULL);
  RETURN jsonb_build_object('sale', p_sale, 'status', 'rolled_back');
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['pkg()','row_hash(text,uuid)','sale_bundle(text)','prepare(text)','snapshot()','dry_run()',
                           'apply_sale(text,text)','rollback_sale(text,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION bc_transfer_20261003.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION bc_transfer_20261003.%s TO service_role', f);
  END LOOP;
END $$;
