-- Gate A compatibility: recurring blocks must no longer resolve the teacher via a
-- direct SELECT of protected instructors.email (authenticated cannot read that column).
-- Reconciles the narrow SQL hotfix already applied to YETI Lovable Cloud on 2026-10-01.
-- The legacy admin ALL policy remains unchanged; office/super_admin get SELECT only.
-- Safe to apply after 20261001132000_gate_a_instructors_lock.sql to a new environment;
-- policy replacement here is idempotent on the already-fixed live environment.

DO $gate_a$
BEGIN
  IF to_regprocedure('public.get_instructor_for_user(uuid)') IS NULL OR
     to_regprocedure('public.is_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Gate A identity/staff helpers missing';
  END IF;
END $gate_a$;

DROP POLICY IF EXISTS "Instructors can view their own blocks" ON public.instructor_recurring_blocks;
DROP POLICY IF EXISTS "Instructors can create their own blocks" ON public.instructor_recurring_blocks;
DROP POLICY IF EXISTS "Instructors can update their own pending blocks" ON public.instructor_recurring_blocks;
DROP POLICY IF EXISTS "gate_a_recurring_blocks_staff_read" ON public.instructor_recurring_blocks;

CREATE POLICY "Instructors can view their own blocks" ON public.instructor_recurring_blocks
  FOR SELECT TO authenticated
  USING (instructor_id = public.get_instructor_for_user(auth.uid()));
CREATE POLICY "Instructors can create their own blocks" ON public.instructor_recurring_blocks
  FOR INSERT TO authenticated
  WITH CHECK (instructor_id = public.get_instructor_for_user(auth.uid()));
CREATE POLICY "Instructors can update their own pending blocks" ON public.instructor_recurring_blocks
  FOR UPDATE TO authenticated
  USING (instructor_id = public.get_instructor_for_user(auth.uid()) AND status = 'pending')
  WITH CHECK (instructor_id = public.get_instructor_for_user(auth.uid()) AND status = 'pending');
CREATE POLICY "gate_a_recurring_blocks_staff_read" ON public.instructor_recurring_blocks
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
