-- P0.2 Step 2B: targeted anon hardening. Whitelist measured from the published bundle:
-- anon needs only INSERT + SELECT on public.booking_requests.
DROP POLICY IF EXISTS "Public can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public can view customer_participants" ON public.customer_participants;
DROP POLICY IF EXISTS "Public can view groups" ON public.groups;
DROP POLICY IF EXISTS "Public can view instructors" ON public.instructors;
DROP POLICY IF EXISTS "Public can view ticket_items" ON public.ticket_items;
DROP POLICY IF EXISTS "Public can view tickets" ON public.tickets;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

GRANT SELECT, INSERT ON public.booking_requests TO anon;