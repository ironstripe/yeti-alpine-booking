REVOKE EXECUTE ON FUNCTION public.create_provisional_reservation(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_reservations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_customer_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_provisional_reservation(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_reservations() TO service_role;