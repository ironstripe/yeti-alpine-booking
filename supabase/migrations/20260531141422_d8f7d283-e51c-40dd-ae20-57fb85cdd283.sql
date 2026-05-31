CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  -- Serialize concurrent calls to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext('generate_ticket_number'));

  year_str := to_char(CURRENT_DATE, 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(ticket_number FROM 'T-' || year_str || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.tickets
  WHERE ticket_number LIKE 'T-' || year_str || '-%'
    AND ticket_number ~ ('^T-' || year_str || '-\d+$');
  RETURN 'T-' || year_str || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$function$;