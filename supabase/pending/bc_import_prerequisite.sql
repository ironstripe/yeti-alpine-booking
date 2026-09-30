-- APPLIED 2026-09-30 via migration tool (owner-approved, unchanged below).
-- Booking-Corner instructor import: PREREQUISITE (schema + RLS + private storage policies).
-- NOT APPLIED. Awaiting owner approval. Must be live before any import/upload endpoint exists.
-- Bucket `instructor-hr-photos` (private, 10MB) is created via the storage tool in the same
-- approved step, BEFORE this SQL runs; the policies below are default-deny otherwise.
-- No user is granted super_admin here. Existing admin/office/teacher access is not widened.
-- Existing public bucket `instructor-avatars` and its policies are untouched.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Text comparison so the new enum value is usable in the same transaction.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'super_admin')
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- Only true missing values become NULL; no defaults are added.
ALTER TABLE public.instructors ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.instructors ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.instructors ALTER COLUMN hourly_rate DROP NOT NULL;

-- Import runs: super_admin read only; writes only via service_role (Edge Functions).
CREATE TABLE public.instructor_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  rollout text NOT NULL,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','applying','applied','failed','discarded')),
  xlsx_sha256 text NOT NULL,
  zip_sha256 text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
REVOKE ALL ON public.instructor_import_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_import_runs TO authenticated;
GRANT ALL ON public.instructor_import_runs TO service_role;
ALTER TABLE public.instructor_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bc_runs_super_admin_select" ON public.instructor_import_runs
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

-- Staging holds raw normalized source rows: service_role only, no client grant at all.
CREATE TABLE public.instructor_import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.instructor_import_runs(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('create','update','no_op','candidate','review')),
  confidence text NOT NULL,
  target_instructor_id uuid REFERENCES public.instructors(id) ON DELETE SET NULL,
  source_checksum text NOT NULL,
  normalized jsonb NOT NULL,
  private_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo jsonb,
  diff jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons text[] NOT NULL DEFAULT '{}',
  decision text CHECK (decision IN ('create','link','skip')),
  batch_status text NOT NULL DEFAULT 'pending' CHECK (batch_status IN ('pending','done','failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_id)
);
REVOKE ALL ON public.instructor_import_staging FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.instructor_import_staging TO service_role;
ALTER TABLE public.instructor_import_staging ENABLE ROW LEVEL SECURITY;
-- (no policies: default deny for every client role)

-- Generic source-ID mapping to stable YETI UUID. RESTRICT keeps instructors from being deleted under it.
CREATE TABLE public.instructor_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  rollout text NOT NULL,
  source_id text NOT NULL,
  instructor_id uuid NOT NULL REFERENCES public.instructors(id) ON DELETE RESTRICT,
  source_checksum text NOT NULL,
  last_import_run_id uuid REFERENCES public.instructor_import_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, rollout, source_id),
  UNIQUE (source_system, rollout, instructor_id)
);
REVOKE ALL ON public.instructor_source_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_source_links TO authenticated;
GRANT ALL ON public.instructor_source_links TO service_role;
ALTER TABLE public.instructor_source_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bc_links_super_admin_select" ON public.instructor_source_links
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

-- Private HR/source values (wage text, bank, AHV, unresolved attributes): super_admin read only.
CREATE TABLE public.instructor_hr_private (
  instructor_id uuid PRIMARY KEY REFERENCES public.instructors(id) ON DELETE RESTRICT,
  wage_raw text,
  bank_raw text,
  ahv_raw text,
  unresolved jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_import_run_id uuid REFERENCES public.instructor_import_runs(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.instructor_hr_private FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_hr_private TO authenticated;
GRANT ALL ON public.instructor_hr_private TO service_role;
ALTER TABLE public.instructor_hr_private ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bc_hr_super_admin_select" ON public.instructor_hr_private
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

-- Deployment windows (NOT absences). Staff may read for scheduling; writes via service_role.
CREATE TABLE public.instructor_deployment_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES public.instructors(id) ON DELETE RESTRICT,
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  source text NOT NULL CHECK (source IN ('booking_corner','manual')),
  import_run_id uuid REFERENCES public.instructor_import_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until >= valid_from),
  UNIQUE (instructor_id, valid_from, valid_until, source)
);
REVOKE ALL ON public.instructor_deployment_windows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_deployment_windows TO authenticated;
GRANT ALL ON public.instructor_deployment_windows TO service_role;
ALTER TABLE public.instructor_deployment_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bc_windows_staff_select" ON public.instructor_deployment_windows
  FOR SELECT TO authenticated
  USING (public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid()));

-- Photo provenance. Staff may read metadata; writes via service_role only.
CREATE TABLE public.instructor_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES public.instructors(id) ON DELETE RESTRICT,
  storage_path text NOT NULL CHECK (storage_path !~ '\.\.' AND storage_path !~ '^/'),
  origin text NOT NULL CHECK (origin IN ('booking_import','manual_upload')),
  source_sha256 text,
  width int, height int,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instructor_photos_one_current ON public.instructor_photos(instructor_id) WHERE is_current;
REVOKE ALL ON public.instructor_photos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_photos TO authenticated;
GRANT ALL ON public.instructor_photos TO service_role;
ALTER TABLE public.instructor_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bc_photos_staff_select" ON public.instructor_photos
  FOR SELECT TO authenticated
  USING (public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid()));

-- Private storage: `instructor-hr-photos`. Staff (admin/office/super_admin) may read objects
-- (signed URLs); no client insert/update/delete — uploads only via service_role Edge Functions.
-- anon and teacher get nothing. No policy touches `instructor-avatars`.
CREATE POLICY "bc_hr_photos_staff_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'instructor-hr-photos'
         AND (public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid())));

-- Guard: import-origin photo metadata may never point at the public avatar bucket path.
CREATE OR REPLACE FUNCTION public.bc_photo_path_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.storage_path ILIKE 'instructor-avatars/%' THEN
    RAISE EXCEPTION 'photo_must_use_private_bucket';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bc_photo_path_guard BEFORE INSERT OR UPDATE ON public.instructor_photos
  FOR EACH ROW EXECUTE FUNCTION public.bc_photo_path_guard();

-- Bookability: only instructors that are linked to a source or have windows are gated;
-- all other existing YETI instructors behave exactly as today.
CREATE OR REPLACE FUNCTION public.instructor_is_deployed(_instructor_id uuid, _date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.instructor_source_links l WHERE l.instructor_id = _instructor_id)
     AND NOT EXISTS (SELECT 1 FROM public.instructor_deployment_windows w WHERE w.instructor_id = _instructor_id)
    THEN true
    ELSE EXISTS (SELECT 1 FROM public.instructor_deployment_windows w
                 WHERE w.instructor_id = _instructor_id AND _date BETWEEN w.valid_from AND w.valid_until)
  END
$$;
REVOKE EXECUTE ON FUNCTION public.instructor_is_deployed(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_is_deployed(uuid, date) TO authenticated, service_role;
