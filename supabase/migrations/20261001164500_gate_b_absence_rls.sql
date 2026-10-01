-- LIVE STATUS: APPLIED to YETI Lovable Cloud at 2026-10-01 16:45 CEST.
-- Already live; do not manually re-run. The DDL is idempotent for a future environment.
-- Gate B: instructor_absences holds reasons incl. sickness. Historical USING (true)
-- policies allow every authenticated user to read and edit every instructor's records.
-- Staff may manage all; a teacher may read their own, request pending leave,
-- and edit/delete only their own pending request. No public/anonymous access.
-- Pre-apply and live-lock BEGIN/ROLLBACK role tests each passed 16/16.

DROP POLICY IF EXISTS "Authenticated users can view all absences" ON public.instructor_absences;
DROP POLICY IF EXISTS "Authenticated users can insert absences" ON public.instructor_absences;
DROP POLICY IF EXISTS "Authenticated users can update absences" ON public.instructor_absences;
DROP POLICY IF EXISTS "Authenticated users can delete absences" ON public.instructor_absences;
DROP POLICY IF EXISTS "absence_staff_or_own_select" ON public.instructor_absences;
DROP POLICY IF EXISTS "absence_staff_or_own_pending_insert" ON public.instructor_absences;
DROP POLICY IF EXISTS "absence_staff_or_own_pending_update" ON public.instructor_absences;
DROP POLICY IF EXISTS "absence_staff_or_own_pending_delete" ON public.instructor_absences;

REVOKE ALL ON public.instructor_absences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instructor_absences TO authenticated;
ALTER TABLE public.instructor_absences ENABLE ROW LEVEL SECURITY;

-- A teacher may edit the dates/reason of a pending request, but never promote it
-- to approved, change ownership, change creator/requester or edit approval fields.
-- Staff operations and service-role imports are not changed by this guard.
CREATE OR REPLACE FUNCTION public.guard_teacher_absence_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $guard$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.is_staff(auth.uid()) THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.instructor_id IS DISTINCT FROM OLD.instructor_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    THEN RAISE EXCEPTION 'teacher_cannot_change_absence_approval_or_owner' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEW;
END $guard$;
REVOKE EXECUTE ON FUNCTION public.guard_teacher_absence_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_teacher_absence_update ON public.instructor_absences;
CREATE TRIGGER trg_guard_teacher_absence_update
  BEFORE UPDATE ON public.instructor_absences
  FOR EACH ROW EXECUTE FUNCTION public.guard_teacher_absence_update();

CREATE POLICY "absence_staff_or_own_select" ON public.instructor_absences
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR
         (public.has_role(auth.uid(), 'teacher'::public.app_role) AND
          instructor_id = public.get_instructor_for_user(auth.uid())));

CREATE POLICY "absence_staff_or_own_pending_insert" ON public.instructor_absences
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) OR
    (public.has_role(auth.uid(), 'teacher'::public.app_role)
     AND instructor_id = public.get_instructor_for_user(auth.uid())
     AND status = 'pending' AND created_by = auth.uid() AND requested_by = auth.uid()
     AND approved_by IS NULL AND approved_at IS NULL AND rejection_reason IS NULL));

CREATE POLICY "absence_staff_or_own_pending_update" ON public.instructor_absences
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) OR
    (public.has_role(auth.uid(), 'teacher'::public.app_role)
     AND instructor_id = public.get_instructor_for_user(auth.uid())
     AND status = 'pending' AND created_by = auth.uid() AND requested_by = auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) OR
    (public.has_role(auth.uid(), 'teacher'::public.app_role)
     AND instructor_id = public.get_instructor_for_user(auth.uid())
     AND status = 'pending' AND created_by = auth.uid() AND requested_by = auth.uid()
     AND approved_by IS NULL AND approved_at IS NULL AND rejection_reason IS NULL));

CREATE POLICY "absence_staff_or_own_pending_delete" ON public.instructor_absences
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()) OR
    (public.has_role(auth.uid(), 'teacher'::public.app_role)
     AND instructor_id = public.get_instructor_for_user(auth.uid())
     AND status = 'pending' AND created_by = auth.uid() AND requested_by = auth.uid()));
