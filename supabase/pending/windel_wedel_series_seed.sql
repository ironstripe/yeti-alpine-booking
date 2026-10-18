-- DATA SEED ONLY, NOT A MIGRATION. DO NOT EXECUTE during implementation.
-- Requires independently reviewed clock times and a verified staff actor; none invented.
-- psql variables reviewed_time_blocks (JSON) and staff_actor (UUID) must be supplied.
-- Uses one existing product and existing Core tiers; writes no products/prices/courses.
BEGIN;
SELECT 1 FROM public.products WHERE id='e25c5f7c-939a-54d5-b355-102ad585dd54' FOR UPDATE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.product_public_offerings WHERE product_id='e25c5f7c-939a-54d5-b355-102ad585dd54') THEN RAISE EXCEPTION 'Offering now exists; inspect user edits before seeding'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(day_count,cumulative_price) ORDER BY day_count) FROM public.product_price_tiers WHERE product_id='e25c5f7c-939a-54d5-b355-102ad585dd54') IS DISTINCT FROM '[[1,70],[2,110],[3,140]]'::jsonb THEN RAISE EXCEPTION 'Reviewed tiers changed'; END IF;
END $$;
SELECT public.save_product_public_offering('e25c5f7c-939a-54d5-b355-102ad585dd54',jsonb_build_object('schedule_kind','weekly','weekdays',jsonb_build_array(6),'dates','[]'::jsonb,'time_blocks',:'reviewed_time_blocks'::jsonb,'display_schedule_text',NULL,'series','[{"sequence":1,"label":null,"start_date":"2027-01-09","end_date":"2027-02-06","max_selected_days":3},{"sequence":2,"label":null,"start_date":"2027-02-20","end_date":"2027-03-20","max_selected_days":3}]'::jsonb),:'staff_actor'::uuid);
COMMIT;
