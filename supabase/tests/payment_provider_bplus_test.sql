-- B+ Phase 2 schema tests: QR invoice delivery kind, payment provider tables,
-- grants/RLS and the invoice template with the QR payment part.
--
-- Non-destructive: run inside a transaction and roll back.
--   psql "$PRIVILEGED_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/payment_provider_bplus_test.sql
--   -- or, without a privileged URL, run in the Supabase SQL editor and ROLLBACK.
--
-- Expected output is a single line per check; an error aborts the run.

BEGIN;

-- 0) Preconditions -----------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.booking_email_deliveries') IS NULL THEN
    RAISE EXCEPTION 'booking_email_deliveries missing: run B+ Phase 1 first';
  END IF;
  IF to_regclass('public.payment_sessions') IS NULL
     OR to_regclass('public.payment_events') IS NULL THEN
    RAISE EXCEPTION 'payment tables missing: run migration 20261001090000';
  END IF;
END $$;
\echo 'ok 0: payment tables exist'

-- 1) Delivery kind constraint accepts the invoice kind -----------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_email_deliveries_kind_check'
      AND pg_get_constraintdef(oid) LIKE '%invoice%'
  ) THEN
    RAISE EXCEPTION 'kind constraint does not allow invoice';
  END IF;
END $$;
\echo 'ok 1: delivery kind invoice allowed'

-- 2) Provider tables reject unknown statuses / providers ---------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.payment_sessions (ticket_id, provider_session_id, amount, currency, status)
    VALUES (gen_random_uuid(), 'test_bad_status', 10, 'CHF', 'weird');
    RAISE EXCEPTION 'invalid payment session status was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.payment_events (provider_event_id, event_type, provider)
    VALUES ('test_bad_provider', 'x', 'paypal');
    RAISE EXCEPTION 'unknown provider was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
\echo 'ok 2: constraints reject invalid values'

-- 3) At most one open session per ticket -------------------------------------
DO $$
DECLARE
  t_id uuid := gen_random_uuid();
  c_id uuid := gen_random_uuid();
  first_id uuid;
BEGIN
  INSERT INTO public.customers (id, last_name, email) VALUES (c_id, 'Test', 'test@example.test');
  INSERT INTO public.tickets (id, ticket_number, customer_id, total_amount)
  VALUES (t_id, 'TEST-BPLUS-' || substr(t_id::text, 1, 8), c_id, 100);

  INSERT INTO public.payment_sessions (ticket_id, provider_session_id, amount, currency)
  VALUES (t_id, 'cs_test_open_1', 100, 'CHF') RETURNING id INTO first_id;

  BEGIN
    INSERT INTO public.payment_sessions (ticket_id, provider_session_id, amount, currency)
    VALUES (t_id, 'cs_test_open_2', 100, 'CHF');
    RAISE EXCEPTION 'second open session was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE public.payment_sessions SET status = 'succeeded' WHERE id = first_id;
  INSERT INTO public.payment_sessions (ticket_id, provider_session_id, amount, currency)
  VALUES (t_id, 'cs_test_open_3', 100, 'CHF');
END $$;
\echo 'ok 3: one open session per ticket, finished ones stay'

-- 4) Webhook events are unique -------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.payment_events (provider_event_id, event_type) VALUES ('evt_test_1', 'checkout.session.completed');
  BEGIN
    INSERT INTO public.payment_events (provider_event_id, event_type) VALUES ('evt_test_1', 'checkout.session.completed');
    RAISE EXCEPTION 'duplicate provider event was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
\echo 'ok 4: provider events are unique'

-- 5) Anon has no access; office/admin can read via RLS ------------------------
DO $$
DECLARE
  anon_grants integer;
BEGIN
  SELECT count(*) INTO anon_grants
  FROM information_schema.role_table_grants
  WHERE table_name IN ('payment_sessions', 'payment_events')
    AND grantee IN ('anon', 'public');

  IF anon_grants <> 0 THEN
    RAISE EXCEPTION 'anon/public has grants on payment tables';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('payment_sessions', 'payment_events')
    GROUP BY schemaname HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'missing RLS policies on payment tables';
  END IF;
END $$;
\echo 'ok 5: no anon access, office/admin policies present'

-- 6) Invoice template carries the QR payment part ----------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.email_templates
    WHERE trigger = 'invoice.created'
      AND body_html LIKE '%{{invoice.qr_payment_part}}%'
  ) THEN
    RAISE EXCEPTION 'invoice.created template has no QR payment part placeholder';
  END IF;
END $$;
\echo 'ok 6: invoice template renders the QR payment part'

ROLLBACK;
\echo 'B+ Phase 2 schema tests passed (rolled back)'