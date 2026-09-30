CREATE OR REPLACE FUNCTION public.update_private_appointment(
  p_appointment_id uuid, p_date date, p_time_start time, p_time_end time, p_instructor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.private_appointments; v_count int;
BEGIN
  IF NOT public.is_admin_or_office(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_time_start >= p_time_end THEN RAISE EXCEPTION 'invalid_time_range'; END IF;
  IF p_date < current_date THEN RAISE EXCEPTION 'past_date'; END IF;
  SELECT * INTO v_old FROM public.private_appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE public.private_appointments
     SET date = p_date, time_start = p_time_start, time_end = p_time_end, instructor_id = p_instructor_id,
         instructor_confirmation = CASE WHEN p_instructor_id IS DISTINCT FROM v_old.instructor_id
           THEN (CASE WHEN p_instructor_id IS NULL THEN NULL ELSE 'pending' END) ELSE instructor_confirmation END
   WHERE id = p_appointment_id;
  UPDATE public.ticket_items
     SET date = p_date, time_start = p_time_start, time_end = p_time_end, instructor_id = p_instructor_id,
         instructor_confirmation = CASE WHEN p_instructor_id IS DISTINCT FROM v_old.instructor_id
           THEN (CASE WHEN p_instructor_id IS NULL THEN NULL ELSE 'pending' END) ELSE instructor_confirmation END,
         is_period_override = true
   WHERE appointment_id = p_appointment_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('appointment_id', p_appointment_id, 'items_updated', v_count);
END $$;
REVOKE ALL ON FUNCTION public.update_private_appointment(uuid, date, time, time, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_private_appointment(uuid, date, time, time, uuid) TO authenticated, service_role;