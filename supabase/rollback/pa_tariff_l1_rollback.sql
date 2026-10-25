-- Rollback for supabase/pending/pa_tariff_l1.sql (B07 L1), consumer-first:
-- 0. Redeploy the previous private-appointments function and publish the previous client first
--    (they never send acknowledged_quote_digest), then:
-- 1. Restore the replaced bodies (same signatures), in this order:
--    a. pa_move_appointment(uuid,date,time,time,uuid,uuid) and pa_period_update(uuid,jsonb,uuid):
--       the definitions in tests/sql/production_schema_baseline.sql (current production bodies).
--    b. pa_apply_slot + pa_tariff_transition_guard: their blocks in supabase/pending/product_private_tariff_rules.sql.
--    c. pa_edit_booking: supabase/pending/pa_edit_booking.sql.
-- 2. Export evidence first: \copy public.private_appointment_pricing TO 'pricing_l1.csv' CSV HEADER
--    (L1 replaced pricing rows of moved/edited lessons; their before/after values are in ticket_history
--    PRIVATE_APPOINTMENT_CHANGED events, change moved/period_updated/edited, key "pricing").
-- 3. Then drop the L1-only objects:
BEGIN;
DROP FUNCTION IF EXISTS public.pa_move_appointment(uuid, date, time, time, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.pa_period_update(uuid, jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.pa_l1_requote(jsonb);
DROP FUNCTION IF EXISTS public.pa_l1_write_pricing(jsonb);
DROP FUNCTION IF EXISTS public.pa_l1_line_net(uuid);
DROP FUNCTION IF EXISTS public.pa_lock_days(uuid[], date[]);
COMMIT;
-- Lines already requoted by L1 keep their acknowledged prices (no automatic re-repricing on rollback).
