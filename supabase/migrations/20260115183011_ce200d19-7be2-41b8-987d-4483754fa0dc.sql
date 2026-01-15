-- Allow public read access to conversations for sidebar badge
CREATE POLICY "Public can view conversations" 
ON public.conversations 
FOR SELECT 
TO anon 
USING (true);