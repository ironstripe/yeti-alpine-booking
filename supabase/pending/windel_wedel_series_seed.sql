-- DATA SEED ONLY, NOT A MIGRATION. DO NOT EXECUTE during implementation.
-- Run with psql ON_ERROR_STOP=1 in a privileged, dedicated session after schema review.
-- Requires SELECT/row-lock rights on products, courses, schedules, tiers and user_roles,
-- table-lock rights on schedules/tiers/offerings, and permission to SET ROLE service_role.
-- psql variables reviewed_time_blocks (JSON) and staff_actor (UUID) must be supplied.
-- No product/price/course/history writes. All guards and the sole RPC write are atomic.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('yeti.seed_time_blocks', :'reviewed_time_blocks', true),
       set_config('yeti.seed_actor', :'staff_actor', true);
SELECT id FROM public.products WHERE id='e25c5f7c-939a-54d5-b355-102ad585dd54' FOR UPDATE;
SELECT id FROM public.group_courses WHERE id='45688ab3-2253-b796-bdfb-545ccb3bec4d' FOR UPDATE;
-- Row locks alone cannot lock a missing offering or prevent child-row phantoms.
-- Brief table locks prevent INSERT/UPDATE/DELETE (including inactive->active schedules).
-- NOWAIT aborts rather than proceeding during concurrent editing; locks last to COMMIT.
LOCK TABLE public.group_course_schedules, public.product_price_tiers,
           public.product_public_offerings IN SHARE ROW EXCLUSIVE MODE NOWAIT;
SELECT id FROM public.group_course_schedules
 WHERE course_id='45688ab3-2253-b796-bdfb-545ccb3bec4d' ORDER BY id FOR UPDATE;
SELECT id FROM public.product_price_tiers
 WHERE product_id='e25c5f7c-939a-54d5-b355-102ad585dd54' ORDER BY id FOR UPDATE;
SELECT product_id FROM public.product_public_offerings
 WHERE product_id='e25c5f7c-939a-54d5-b355-102ad585dd54' FOR UPDATE;
SELECT id FROM public.user_roles
 WHERE user_id='d27b11a0-c8fc-46f6-a38b-edf2980221fc' ORDER BY id FOR SHARE;
DO $$
DECLARE actor uuid := current_setting('yeti.seed_actor')::uuid;
BEGIN
 IF actor IS DISTINCT FROM 'd27b11a0-c8fc-46f6-a38b-edf2980221fc'::uuid
    OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role IN ('admin','super_admin'))
    OR NOT public.is_staff(actor) THEN RAISE EXCEPTION 'Verified Ivo admin actor required'; END IF;
 IF current_setting('yeti.seed_time_blocks')::jsonb IS DISTINCT FROM '[{"start":"10:00","end":"12:00"}]'::jsonb THEN RAISE EXCEPTION 'Reviewed time blocks changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id='e25c5f7c-939a-54d5-b355-102ad585dd54' AND type='group_toddler' AND duration_minutes=120) THEN RAISE EXCEPTION 'Reviewed product missing or changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.group_courses WHERE id='45688ab3-2253-b796-bdfb-545ccb3bec4d' AND product_id='e25c5f7c-939a-54d5-b355-102ad585dd54' AND is_active IS TRUE AND course_type='saturday_course') THEN RAISE EXCEPTION 'Reviewed Saturday course missing or changed'; END IF;
 -- Internal schedules use JS weekday 6; public offerings use ISO weekday 6 (Saturday).
 IF (SELECT jsonb_agg(jsonb_build_array(day_of_week,start_time::text,end_time::text) ORDER BY id) FROM public.group_course_schedules WHERE course_id='45688ab3-2253-b796-bdfb-545ccb3bec4d' AND is_active IS TRUE)
    IS DISTINCT FROM '[[6,"10:00:00","12:00:00"]]'::jsonb THEN RAISE EXCEPTION 'Reviewed active Saturday schedule changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_public_offerings WHERE product_id='e25c5f7c-939a-54d5-b355-102ad585dd54') THEN RAISE EXCEPTION 'Offering now exists; inspect user edits before seeding'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(day_count,cumulative_price) ORDER BY day_count) FROM public.product_price_tiers WHERE product_id='e25c5f7c-939a-54d5-b355-102ad585dd54') IS DISTINCT FROM '[[1,70],[2,110],[3,140]]'::jsonb THEN RAISE EXCEPTION 'Reviewed tiers changed'; END IF;
 IF public.product_series_dates('2027-01-09','2027-02-06',ARRAY[6]::smallint[]) IS DISTINCT FROM ARRAY['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06']::date[]
    OR public.product_series_dates('2027-02-20','2027-03-20',ARRAY[6]::smallint[]) IS DISTINCT FROM ARRAY['2027-02-20','2027-02-27','2027-03-06','2027-03-13','2027-03-20']::date[] THEN RAISE EXCEPTION 'Reviewed Saturday occurrences changed'; END IF;
END $$;
SET LOCAL ROLE service_role;
SELECT public.save_product_public_offering('e25c5f7c-939a-54d5-b355-102ad585dd54',jsonb_build_object('schedule_kind','weekly','weekdays',jsonb_build_array(6),'dates','[]'::jsonb,'time_blocks',current_setting('yeti.seed_time_blocks')::jsonb,'display_schedule_text',NULL,'series','[{"sequence":1,"label":null,"start_date":"2027-01-09","end_date":"2027-02-06","max_selected_days":3},{"sequence":2,"label":null,"start_date":"2027-02-20","end_date":"2027-03-20","max_selected_days":3}]'::jsonb),current_setting('yeti.seed_actor')::uuid);
COMMIT;
