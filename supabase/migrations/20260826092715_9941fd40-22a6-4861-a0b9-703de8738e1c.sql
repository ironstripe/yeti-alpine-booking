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

  RETURN 'T-' || year_str || '-' || LPAD(next_num::text, 6, '0');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_ticket_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_ticket_number() TO service_role;