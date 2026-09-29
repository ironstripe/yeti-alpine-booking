-- Rollback for P0.2 Step 2B: restores the exact pre-2B anon state
-- (as established by migration 20260929215248).
CREATE POLICY "Public can view conversations" ON public.conversations AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view customer_participants" ON public.customer_participants AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view groups" ON public.groups AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view instructors" ON public.instructors AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view ticket_items" ON public.ticket_items AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view tickets" ON public.tickets AS PERMISSIVE FOR SELECT TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
