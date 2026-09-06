CREATE TABLE public.instructor_public_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL UNIQUE REFERENCES public.instructors(id) ON DELETE CASCADE,
  public_display_name text,
  public_role_label text,
  teaser_draft text NOT NULL DEFAULT 'Mit Freude, Geduld und Begeisterung begleite ich Kinder und Erwachsene auf ihrem Weg im Schnee – vom ersten Schwung bis zum nächsten persönlichen Erfolg.',
  teaser_published text,
  portrait_url text,
  portrait_storage_path text,
  photo_consent_confirmed_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instructor_public_profiles_status_chk CHECK (status IN ('draft','published','hidden')),
  CONSTRAINT instructor_public_profiles_teaser_draft_len CHECK (char_length(teaser_draft) <= 280),
  CONSTRAINT instructor_public_profiles_teaser_pub_len CHECK (teaser_published IS NULL OR char_length(teaser_published) <= 280)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instructor_public_profiles TO authenticated;
GRANT ALL ON public.instructor_public_profiles TO service_role;

ALTER TABLE public.instructor_public_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Office can read public profiles"
ON public.instructor_public_profiles FOR SELECT TO authenticated
USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin/Office can insert public profiles"
ON public.instructor_public_profiles FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin/Office can update public profiles"
ON public.instructor_public_profiles FOR UPDATE TO authenticated
USING (public.is_admin_or_office(auth.uid()))
WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admins can delete public profiles"
ON public.instructor_public_profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX instructor_public_profiles_published_idx
  ON public.instructor_public_profiles (status, sort_order, public_display_name)
  WHERE status = 'published';

CREATE INDEX instructor_public_profiles_instructor_idx
  ON public.instructor_public_profiles (instructor_id);

CREATE TRIGGER update_instructor_public_profiles_updated_at
BEFORE UPDATE ON public.instructor_public_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Public can read website portraits"
ON storage.objects FOR SELECT
USING (bucket_id = 'website-instructor-portraits');

CREATE POLICY "Admin/Office can upload website portraits"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'website-instructor-portraits' AND public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin/Office can update website portraits"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'website-instructor-portraits' AND public.is_admin_or_office(auth.uid()))
WITH CHECK (bucket_id = 'website-instructor-portraits' AND public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin/Office can delete website portraits"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'website-instructor-portraits' AND public.is_admin_or_office(auth.uid()));