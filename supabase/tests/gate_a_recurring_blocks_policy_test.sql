-- Regression test for the post-Gate-A scheduler policy hotfix.
-- Run in the Lovable Cloud SQL editor as postgres AFTER the two Gate A migrations.
-- Creates two synthetic recurring blocks only inside a transaction; ROLLBACK always.
-- Requires existing teacher-only and super_admin user roles; refuses to pass vacuously.
BEGIN;
DO $test$
DECLARE
  teacher_uid uuid;
  staff_uid uuid;
  own_instructor uuid;
  other_instructor uuid;
  own_block uuid;
  other_block uuid;
  visible_count int;
  refused boolean := false;
BEGIN
  SELECT user_id INTO teacher_uid FROM public.user_roles
  GROUP BY user_id HAVING array_agg(role::text ORDER BY role::text) = ARRAY['teacher'] LIMIT 1;
  SELECT user_id INTO staff_uid FROM public.user_roles
  WHERE role::text = 'super_admin' LIMIT 1;
  own_instructor := public.get_instructor_for_user(teacher_uid);
  SELECT id INTO other_instructor FROM public.instructors WHERE id <> own_instructor LIMIT 1;
  IF teacher_uid IS NULL OR staff_uid IS NULL OR own_instructor IS NULL OR other_instructor IS NULL THEN
    RAISE EXCEPTION 'Missing teacher-only / super_admin account or distinct instructors: test not valid';
  END IF;

  INSERT INTO public.instructor_recurring_blocks(instructor_id, start_time, end_time, weekdays, valid_from, reason)
  VALUES (own_instructor, '01:00', '02:00', ARRAY[1], '2028-01-01', 'Gate A synthetic self')
  RETURNING id INTO own_block;
  INSERT INTO public.instructor_recurring_blocks(instructor_id, start_time, end_time, weekdays, valid_from, reason)
  VALUES (other_instructor, '01:00', '02:00', ARRAY[1], '2028-01-01', 'Gate A synthetic other')
  RETURNING id INTO other_block;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',teacher_uid,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT count(*) FROM public.instructor_recurring_blocks WHERE id IN (%L,%L)', own_block, other_block)
    INTO visible_count;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'teacher block visibility expected 1, got %', visible_count; END IF;
  BEGIN
    EXECUTE 'SELECT email FROM public.instructors LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'teacher can read protected instructors.email'; END IF;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',staff_uid,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT count(*) FROM public.instructor_recurring_blocks WHERE id IN (%L,%L)', own_block, other_block)
    INTO visible_count;
  IF visible_count <> 2 THEN RAISE EXCEPTION 'staff block visibility expected 2, got %', visible_count; END IF;
  EXECUTE 'RESET ROLE';
END $test$;
SELECT 'PASS: teacher only sees own block; protected email denied; staff sees both; all fixtures rolled back' AS result;
ROLLBACK;
