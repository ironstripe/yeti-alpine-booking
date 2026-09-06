REVOKE EXECUTE ON FUNCTION public.create_provisional_reservation(jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.finalize_provisional_reservation(uuid, text, jsonb, jsonb, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.create_provisional_reservation(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_provisional_reservation(uuid, text, jsonb, jsonb, text) TO service_role;