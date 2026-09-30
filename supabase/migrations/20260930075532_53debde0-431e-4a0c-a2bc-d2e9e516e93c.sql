-- logical name: pa_phase1c_fix_is_protected (typed array append)
CREATE OR REPLACE FUNCTION public.pa_is_protected(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE a record; reasons text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO a FROM public.private_appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('protected', false, 'reasons', '[]'::jsonb, 'found', false); END IF;
  IF a.date < public.pa_business_today() THEN reasons := array_append(reasons, 'past'::text); END IF;
  IF a.status = 'completed' THEN reasons := array_append(reasons, 'completed'::text); END IF;
  IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.ticket_id = a.ticket_id
             AND (i.issued_at IS NOT NULL OR coalesce(i.status,'draft') NOT IN ('draft','cancelled','void'))) THEN
    reasons := array_append(reasons, 'invoiced'::text);
  END IF;
  RETURN jsonb_build_object('protected', cardinality(reasons) > 0, 'reasons', to_jsonb(reasons), 'found', true);
END $$;
REVOKE ALL ON FUNCTION public.pa_is_protected(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_is_protected(uuid) TO service_role;