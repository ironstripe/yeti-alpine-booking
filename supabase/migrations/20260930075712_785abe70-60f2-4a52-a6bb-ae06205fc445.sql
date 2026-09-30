-- logical name: pa_phase1d_tighten_grants (remove default-privilege extras that bypass RLS)
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.private_appointment_participants FROM authenticated;
REVOKE ALL ON public.private_appointment_participants FROM anon;
REVOKE ALL ON public.private_appointment_backfill_log FROM anon, authenticated;