-- P0.2 Stage 2.1: re-assert that anon has no direct access to named PII/business tables.
REVOKE ALL ON public.tickets, public.ticket_items, public.customers,
  public.customer_participants, public.conversations, public.groups,
  public.instructors FROM anon;
DROP POLICY IF EXISTS "Public can view tickets" ON public.tickets;
DROP POLICY IF EXISTS "Public can view ticket_items" ON public.ticket_items;
DROP POLICY IF EXISTS "Public can view customer_participants" ON public.customer_participants;
DROP POLICY IF EXISTS "Public can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public can view groups" ON public.groups;
DROP POLICY IF EXISTS "Public can view instructors" ON public.instructors;