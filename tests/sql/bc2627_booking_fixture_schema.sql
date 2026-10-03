-- Minimal synthetic copy of the production columns the 26/27 booking RPCs touch.
-- Used only by tests/bc2627Booking.integration.mjs in a throwaway local database.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION public.is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

CREATE TABLE public.seasons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, start_date date NOT NULL,
  end_date date NOT NULL, is_current boolean DEFAULT false);
CREATE TABLE public.skill_levels(id text PRIMARY KEY, name text);
CREATE TABLE public.products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL, type text NOT NULL, duration_minutes int, price numeric NOT NULL DEFAULT 0, currency text DEFAULT 'CHF',
  is_active boolean DEFAULT true, pricing_type text DEFAULT 'fixed', min_age int, max_age int, season_id uuid NOT NULL REFERENCES public.seasons(id),
  discipline text, show_on_website boolean NOT NULL DEFAULT false);
CREATE TABLE public.product_price_tiers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL, day_count int NOT NULL,
  cumulative_price numeric NOT NULL);
CREATE TABLE public.bc_product_tariff_sources(source_id text PRIMARY KEY, season_id uuid NOT NULL, product_id uuid,
  source_sha256 text NOT NULL DEFAULT 'sha', source_family text NOT NULL, import_status text NOT NULL, day_count int NOT NULL,
  duration_minutes int NOT NULL, persons_per_lesson int NOT NULL, price_chf numeric NOT NULL, source_payload jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.instructors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, roles text[]);
CREATE TABLE public.instructor_absences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instructor_id uuid, start_date date, end_date date,
  status text, time_start time, time_end time, is_full_day boolean);
CREATE TABLE public.group_courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, discipline text NOT NULL DEFAULT 'ski',
  min_age int NOT NULL, max_age int NOT NULL, max_participants int NOT NULL DEFAULT 8, price_per_day numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true, product_id uuid, course_type text DEFAULT 'weekly', skill_level_id text);
CREATE TABLE public.training_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL, week_start date NOT NULL,
  group_number int, status text);
CREATE TABLE public.training_course_dates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), training_id uuid, date date, is_cancelled boolean);
CREATE TABLE public.group_course_instances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL, date date NOT NULL,
  start_time time NOT NULL, end_time time NOT NULL, instructor_id uuid, assistant_instructor_id uuid, status text DEFAULT 'scheduled',
  current_participants int DEFAULT 0);
CREATE TABLE public.bc_2627_course_period_sources(source_key text PRIMARY KEY, course_id uuid NOT NULL REFERENCES public.group_courses(id),
  training_group_id uuid NOT NULL REFERENCES public.training_groups(id), source_sha256 text NOT NULL, tariff_source_ids text[] NOT NULL,
  teaching_dates date[] NOT NULL, eligible_variants jsonb NOT NULL);
CREATE TABLE public.bc_2627_course_product_variants(course_id uuid NOT NULL, product_id uuid NOT NULL, eligible_day_counts int[] NOT NULL,
  PRIMARY KEY(course_id,product_id));
CREATE TABLE public.customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), email text NOT NULL,
  phone text, first_name text, last_name text NOT NULL, street text, zip text, city text, country text DEFAULT 'LI',
  holiday_address text NOT NULL DEFAULT '', customer_type text DEFAULT 'private', merged_into_id uuid, is_archived boolean NOT NULL DEFAULT false);
CREATE TABLE public.customer_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id),
  first_name text NOT NULL, last_name text, birth_date date, sport text DEFAULT 'ski', level_current_season text, merged_into_id uuid);
CREATE TABLE public.ticket_number_counters(year int PRIMARY KEY, last_number int NOT NULL DEFAULT 0, updated_at timestamptz);
CREATE TABLE public.tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), ticket_number text NOT NULL UNIQUE, customer_id uuid REFERENCES public.customers(id),
  status text, total_amount numeric, paid_amount numeric, payment_method text, payment_due_date date, notes text, ticket_type text,
  is_initiator boolean NOT NULL DEFAULT false, season_id uuid, source text NOT NULL DEFAULT 'office', reservation_expires_at timestamptz,
  reservation_token text, participant_count int, finalized_at timestamptz);
CREATE TABLE public.private_appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid, date date, time_start time,
  time_end time, instructor_id uuid, status text);
CREATE TABLE public.ticket_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES public.products(id),
  participant_id uuid REFERENCES public.customer_participants(id), instructor_id uuid REFERENCES public.instructors(id),
  date date NOT NULL, time_start time, time_end time, unit_price numeric NOT NULL, quantity int, line_total numeric, status text,
  instructor_confirmation text, internal_notes text, item_type text, group_name text, group_participant_count int, skill_level text,
  end_date date, appointment_id uuid);
CREATE TABLE public.group_course_enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.group_course_instances(id) ON DELETE CASCADE,
  ticket_item_id uuid REFERENCES public.ticket_items(id) ON DELETE SET NULL,
  participant_id uuid REFERENCES public.customer_participants(id) ON DELETE SET NULL,
  attendance_status text DEFAULT 'registered', created_at timestamptz DEFAULT now(),
  training_group_id uuid REFERENCES public.training_groups(id), original_course_id uuid);
CREATE TABLE public.invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL UNIQUE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL, customer_id uuid, subtotal numeric NOT NULL, total numeric NOT NULL,
  currency text DEFAULT 'CHF', due_date date NOT NULL, status text DEFAULT 'draft', created_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX invoices_open_ticket_unique ON public.invoices(ticket_id) WHERE status='open';
CREATE TABLE public.booking_email_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE, kind text NOT NULL, idempotency_key text NOT NULL UNIQUE,
  recipient_email text NOT NULL, status text NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0,
  CONSTRAINT booking_email_deliveries_kind_check CHECK (kind='booking_confirmation'), UNIQUE(ticket_id,kind));

-- Same body as production generate_ticket_number (counter row lock).
CREATE OR REPLACE FUNCTION public.generate_ticket_number() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE year_num int := EXTRACT(YEAR FROM CURRENT_DATE)::int; year_str text := to_char(CURRENT_DATE,'YYYY'); next_num int;
BEGIN
  INSERT INTO public.ticket_number_counters(year,last_number) VALUES (year_num,0) ON CONFLICT (year) DO NOTHING;
  UPDATE public.ticket_number_counters SET last_number=last_number+1, updated_at=now() WHERE year=year_num RETURNING last_number INTO next_num;
  RETURN 'T-'||year_str||'-'||lpad(next_num::text,4,'0');
END; $f$;
