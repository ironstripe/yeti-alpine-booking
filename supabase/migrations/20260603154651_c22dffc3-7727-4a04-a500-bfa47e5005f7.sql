CREATE TABLE IF NOT EXISTS public.ticket_number_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ticket_number_counters_last_number_nonnegative CHECK (last_number >= 0)
);
GRANT ALL ON public.ticket_number_counters TO service_role;
ALTER TABLE public.ticket_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage ticket number counters" ON public.ticket_number_counters;
CREATE POLICY "Service role can manage ticket number counters"
ON public.ticket_number_counters
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

WITH existing_year_max AS (
  SELECT
    CAST(SUBSTRING(ticket_number FROM '^T-(\d{4})-\d+$') AS integer) AS year,
    MAX(CAST(SUBSTRING(ticket_number FROM '^T-\d{4}-(\d+)$') AS integer)) AS last_number
  FROM public.tickets
  WHERE ticket_number ~ '^T-\d{4}-\d+$'
  GROUP BY 1
)
INSERT INTO public.ticket_number_counters AS counters (year, last_number)
SELECT year, last_number
FROM existing_year_max
WHERE year IS NOT NULL
ON CONFLICT (year) DO UPDATE
SET last_number = GREATEST(counters.last_number, EXCLUDED.last_number),
    updated_at = now();

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  year_num integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  year_str text := to_char(CURRENT_DATE, 'YYYY');
  max_existing integer := 0;
  next_num integer;
BEGIN
  INSERT INTO public.ticket_number_counters (year, last_number)
  VALUES (year_num, 0)
  ON CONFLICT (year) DO NOTHING;

  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '^T-' || year_str || '-(\d+)$') AS integer)), 0)
  INTO max_existing
  FROM public.tickets
  WHERE ticket_number ~ ('^T-' || year_str || '-\d+$');

  UPDATE public.ticket_number_counters
  SET last_number = GREATEST(last_number, max_existing) + 1,
      updated_at = now()
  WHERE year = year_num
  RETURNING last_number INTO next_num;

  RETURN 'T-' || year_str || '-' || LPAD(next_num::text, 5, '0');
END;
$function$;