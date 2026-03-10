
-- Add avatar_url column to instructors
ALTER TABLE public.instructors ADD COLUMN avatar_url TEXT;

-- Create instructor-avatars storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('instructor-avatars', 'instructor-avatars', true);

-- RLS: Allow authenticated users to upload avatars
CREATE POLICY "Authenticated users can upload instructor avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'instructor-avatars');

-- RLS: Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update instructor avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'instructor-avatars');

-- RLS: Allow public read access to avatars
CREATE POLICY "Public read access to instructor avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'instructor-avatars');

-- RLS: Allow authenticated users to delete avatars
CREATE POLICY "Authenticated users can delete instructor avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'instructor-avatars');
