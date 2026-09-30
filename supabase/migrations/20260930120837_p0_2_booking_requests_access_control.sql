-- P0.2: booking_requests may no longer be read or written directly by anonymous clients.
-- Public booking submission and token-bound lookup are handled only by service-role Edge
-- Functions. Staff users continue to manage requests through authenticated access.
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Remove the legacy broad policies before granting the intended staff-only policy.
DROP POLICY IF EXISTS "Anyone can create booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Anyone can view requests by magic token" ON public.booking_requests;
DROP POLICY IF EXISTS "Authenticated users can update booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Admin and office can manage booking requests" ON public.booking_requests;

-- Defense in depth: anonymous callers cannot use the REST table endpoint even if a
-- permissive policy is accidentally introduced later. service_role is unaffected.
REVOKE ALL ON TABLE public.booking_requests FROM anon;

CREATE POLICY "Admin and office can manage booking requests"
ON public.booking_requests
FOR ALL
TO authenticated
USING (public.is_admin_or_office(auth.uid()))
WITH CHECK (public.is_admin_or_office(auth.uid()));
