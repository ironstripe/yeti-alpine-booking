-- logical name: pa_phase1a_schema (private appointments Phase 1, additive)
CREATE TABLE public.private_appointment_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.private_appointments(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.customer_participants(id),
  attendance text CHECK (attendance IS NULL OR attendance IN ('present','absent')),
  attendance_by uuid,
  attendance_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_appointment_participants_unique UNIQUE (appointment_id, participant_id)
);
CREATE INDEX idx_pap_participant ON public.private_appointment_participants(participant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_appointment_participants TO authenticated;
GRANT ALL ON public.private_appointment_participants TO service_role;
ALTER TABLE public.private_appointment_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office/admin manage appointment participants" ON public.private_appointment_participants
  FOR ALL TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));
CREATE POLICY "Teachers read own appointment participants" ON public.private_appointment_participants
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.private_appointments pa
                 WHERE pa.id = appointment_id
                   AND pa.instructor_id = public.get_instructor_for_user(auth.uid())));
CREATE TRIGGER update_pap_updated_at BEFORE UPDATE ON public.private_appointment_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.private_appointments
  ADD COLUMN price numeric(10,2),
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirmed_by uuid;
ALTER TABLE public.private_appointments
  ADD CONSTRAINT private_appointments_status_check
  CHECK (status IN ('scheduled','booked','completed','cancelled')) NOT VALID;
ALTER TABLE public.private_appointments VALIDATE CONSTRAINT private_appointments_status_check;

CREATE TABLE public.private_appointment_backfill_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  ticket_item_id uuid,
  old_unit_price numeric,
  old_appointment_id uuid,
  old_ticket_total numeric,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.private_appointment_backfill_log TO service_role;
REVOKE ALL ON public.private_appointment_backfill_log FROM anon, authenticated;
ALTER TABLE public.private_appointment_backfill_log ENABLE ROW LEVEL SECURITY;