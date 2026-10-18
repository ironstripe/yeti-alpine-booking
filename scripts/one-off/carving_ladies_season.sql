-- ONE-OFF DATA PLAN ONLY. NOT A MIGRATION. Not executed on production.
-- Dedicated privileged psql session: psql -X -v ON_ERROR_STOP=1 -f this-file
-- No permanent function, no global generator, no offering/price/history updates.
-- max_participants=8 is the existing schema default (planning only, not a sales limit).
-- is_internal=false matches ordinary teaching courses; true is reserved for office work.
-- Scope marker / deterministic ID makes retries fail closed and supports guarded recovery.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- NOWAIT prevents racing edits or missing-row/duplicate phantoms. Brief write-blocking
-- locks cover these tables, but the script only writes the four target course tables.
LOCK TABLE public.products, public.seasons, public.product_price_tiers,
 public.product_public_offerings, public.user_roles, public.group_courses,
 public.group_course_schedules, public.group_course_instances, public.training_groups
 IN SHARE ROW EXCLUSIVE MODE NOWAIT;
DO $plan$
DECLARE
 p constant uuid := '8fe2a11e-362d-4f05-8964-87d6b214fc3e';
 c constant uuid := '5029b32f-3bfb-4c2d-93b9-b8ac81d6bce7';
 actor constant uuid := 'd27b11a0-c8fc-46f6-a38b-edf2980221fc';
 marker constant text := 'ivo-carving-ladies-2026-10-18-one-off';
 schedule uuid;
 expected date[] := ARRAY['2026-12-06','2026-12-13','2026-12-20','2026-12-27',
 '2027-01-03','2027-01-10','2027-01-17','2027-01-24','2027-01-31',
 '2027-02-07','2027-02-14','2027-02-21','2027-02-28','2027-03-07',
 '2027-03-14','2027-03-21','2027-03-28','2027-04-04','2027-04-11']::date[];
 actual date[]; before_rows jsonb := '{}'::jsonb; after_rows jsonb := '{}'::jsonb;
 t text; rows_json jsonb; n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role IN ('admin','super_admin'))
 THEN RAISE EXCEPTION 'Verified Ivo admin actor required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products pr JOIN public.seasons s ON s.id=pr.season_id
 WHERE pr.id=p AND pr.name='Carving Ladies' AND pr.type='group' AND pr.discipline='ski'
 AND pr.audience='adults' AND pr.min_age=16 AND pr.max_age IS NULL
 AND pr.is_active IS TRUE AND pr.show_on_website IS TRUE AND pr.price=99
 AND pr.currency='CHF' AND pr.pricing_type='fixed' AND pr.duration_minutes=120
 AND s.id='f185b448-e6aa-46b8-94ae-0875a7a6c166' AND s.start_date='2026-12-01' AND s.end_date='2027-04-15')
 THEN RAISE EXCEPTION 'Reviewed product or season changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_price_tiers WHERE product_id=p)
 THEN RAISE EXCEPTION 'Reviewed fixed product tiers changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.product_public_offerings WHERE product_id=p
 AND schedule_kind='weekly' AND weekdays=ARRAY[3,7]::smallint[] AND dates='{}'::date[]
 AND display_schedule_text='Immer Sonntags' AND time_blocks='[{"start":"14:00","end":"16:00"}]'::jsonb
 AND series='[]'::jsonb AND updated_at='2026-10-18T13:05:40.65099+00:00'::timestamptz AND updated_by=actor)
 THEN RAISE EXCEPTION 'Reviewed offering changed; do not overwrite user edits'; END IF;
 IF EXISTS(SELECT 1 FROM public.group_courses WHERE product_id=p OR id=c OR name='Ski · Carving Ladies')
 THEN RAISE EXCEPTION 'Course already exists; rerun rejected'; END IF;
 SELECT array_agg(d::date ORDER BY d) INTO actual FROM generate_series(date '2026-12-01',date '2027-04-15',interval '1 day') d WHERE extract(isodow FROM d)=7;
 IF actual IS DISTINCT FROM expected OR cardinality(actual)<>19 THEN RAISE EXCEPTION 'Season Sundays mismatch'; END IF;
 -- Exact snapshots, emitted after success. These comparisons include all unrelated
 -- rows of the four destination tables plus sources, billing and notification queues.
 FOREACH t IN ARRAY ARRAY['products','seasons','product_price_tiers','product_public_offerings',
 'group_courses','group_course_schedules','group_course_instances','training_groups',
 'tickets','ticket_items','invoices','payments','instructor_notification_queue','notification_queue','email_logs','whatsapp_notifications'] LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]''::jsonb) FROM public.%I x',t) INTO rows_json;
 before_rows:=before_rows||jsonb_build_object(t,rows_json);
 END LOOP;
 INSERT INTO public.group_courses(id,name,product_id,discipline,course_type,skill_level_id,
 min_age,max_age,min_participants,price_per_day,is_active,is_internal,period_start_date,period_end_date,description)
 VALUES(c,'Ski · Carving Ladies',p,'ski','weekly',NULL,16,NULL,1,99,true,false,'2026-12-06','2027-04-11',marker);
 INSERT INTO public.group_course_schedules(course_id,day_of_week,start_time,end_time,is_active)
 VALUES(c,0,'14:00','16:00',true) RETURNING id INTO schedule;
 INSERT INTO public.group_course_instances(course_id,schedule_id,date,start_time,end_time,instructor_id,assistant_instructor_id,status,current_participants,notes)
 SELECT c,schedule,d,'14:00','16:00',NULL,NULL,'scheduled',0,marker FROM unnest(expected) d;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>19 THEN RAISE EXCEPTION 'Instance count mismatch'; END IF;
 INSERT INTO public.training_groups(course_id,week_start,group_number,instructor_id,assistant_instructor_id,status,notes)
 SELECT c,d-6,1,NULL,NULL,'active',marker FROM unnest(expected) d;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>19 THEN RAISE EXCEPTION 'Group shell count mismatch'; END IF;
 IF (SELECT array_agg(date ORDER BY date) FROM public.group_course_instances WHERE course_id=c) IS DISTINCT FROM expected
 OR EXISTS(SELECT 1 FROM public.group_course_instances i LEFT JOIN public.training_groups g ON g.course_id=i.course_id AND g.week_start=i.date-6 AND g.group_number=1
 WHERE i.course_id=c AND (g.id IS NULL OR i.schedule_id<>schedule OR i.instructor_id IS NOT NULL OR i.assistant_instructor_id IS NOT NULL))
 THEN RAISE EXCEPTION 'Postflight relation mismatch'; END IF;
 FOREACH t IN ARRAY ARRAY['products','seasons','product_price_tiers','product_public_offerings',
 'group_courses','group_course_schedules','group_course_instances','training_groups',
 'tickets','ticket_items','invoices','payments','instructor_notification_queue','notification_queue','email_logs','whatsapp_notifications'] LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]''::jsonb) FROM public.%I x %s',t,
 CASE WHEN t='group_courses' THEN format('WHERE id<>%L::uuid',c)
 WHEN t IN ('group_course_schedules','group_course_instances','training_groups') THEN format('WHERE course_id<>%L::uuid',c) ELSE '' END) INTO rows_json;
 after_rows:=after_rows||jsonb_build_object(t,rows_json);
 END LOOP;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Unrelated rows changed; rolling back'; END IF;
 RAISE NOTICE 'Verified target course %, schedule %, 19 instances, 19 shells; actor %',c,schedule,actor;
 -- Only checksums are emitted: do not expose historic customer rows in execution logs.
 RAISE NOTICE 'Unchanged sources/history fingerprint: %',md5(before_rows::text);
END $plan$;
SELECT c.id,c.name,c.product_id,c.skill_level_id,c.min_age,c.max_age,c.min_participants,c.max_participants,c.price_per_day,
 s.day_of_week,s.start_time,s.end_time,(SELECT count(*) FROM public.group_course_instances WHERE course_id=c.id) instances,
 (SELECT count(*) FROM public.training_groups WHERE course_id=c.id) shells
 FROM public.group_courses c JOIN public.group_course_schedules s ON s.course_id=c.id WHERE c.id='5029b32f-3bfb-4c2d-93b9-b8ac81d6bce7';
COMMIT;
