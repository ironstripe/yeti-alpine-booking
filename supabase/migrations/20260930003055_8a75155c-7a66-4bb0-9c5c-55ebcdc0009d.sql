CREATE TABLE public.private_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  date date NOT NULL,
  time_start time NOT NULL,
  time_end time NOT NULL,
  instructor_id uuid REFERENCES public.instructors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'booked',
  instructor_confirmation text,
  meeting_point text,
  period_group_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_appointments TO authenticated;
GRANT ALL ON public.private_appointments TO service_role;
ALTER TABLE public.private_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Office/admin manage appointments" ON public.private_appointments
  FOR ALL TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));
CREATE POLICY "Teachers view own appointments" ON public.private_appointments
  FOR SELECT TO authenticated
  USING (instructor_id = public.get_instructor_for_user(auth.uid()));
CREATE INDEX idx_private_appointments_ticket ON public.private_appointments(ticket_id);
CREATE INDEX idx_private_appointments_date_instr ON public.private_appointments(date, instructor_id);
CREATE TRIGGER update_private_appointments_updated_at BEFORE UPDATE ON public.private_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ticket_items ADD COLUMN appointment_id uuid REFERENCES public.private_appointments(id) ON DELETE SET NULL;
CREATE INDEX idx_ticket_items_appointment ON public.ticket_items(appointment_id);