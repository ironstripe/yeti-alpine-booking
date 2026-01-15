-- Allow public read access to instructors
CREATE POLICY "Public can view instructors" 
ON public.instructors 
FOR SELECT 
TO anon 
USING (true);

-- Allow public read access to groups
CREATE POLICY "Public can view groups" 
ON public.groups 
FOR SELECT 
TO anon 
USING (true);

-- Allow public read access to ticket_items
CREATE POLICY "Public can view ticket_items" 
ON public.ticket_items 
FOR SELECT 
TO anon 
USING (true);

-- Allow public read access to tickets (needed for join)
CREATE POLICY "Public can view tickets" 
ON public.tickets 
FOR SELECT 
TO anon 
USING (true);

-- Allow public read access to customer_participants (needed for join)
CREATE POLICY "Public can view customer_participants" 
ON public.customer_participants 
FOR SELECT 
TO anon 
USING (true);