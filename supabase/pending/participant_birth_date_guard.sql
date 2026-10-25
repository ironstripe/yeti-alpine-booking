-- B08 (PENDING, NOT INSTALLED): authoritative guard against future birth dates on participants.
-- Fires only on INSERT with a non-NULL birth date and on UPDATEs that actually change birth_date.
-- Existing rows (incl. historic/imported values) are not checked, repaired or blocked: unrelated
-- updates that leave birth_date unchanged never fire the check. NULL stays allowed.
-- Day boundary = pa_business_today() (Europe/Zurich). Today is a valid birth date.
-- Impossible calendar dates cannot reach the column (type date rejects them on cast).
-- Raising aborts the whole statement/transaction, so pa_create_booking, bc_2627_staff_group_book
-- and their B05/B07 wrappers roll back every person/ticket/appointment/enrollment/payment write.

CREATE OR REPLACE FUNCTION public.participant_birth_date_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.birth_date IS DISTINCT FROM OLD.birth_date)
     AND NEW.birth_date > public.pa_business_today() THEN
    RAISE EXCEPTION USING ERRCODE = '22008', MESSAGE = 'birth_date_in_future',
      DETAIL = 'birth_date must not be after the school date';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.participant_birth_date_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_participant_birth_date_guard
  BEFORE INSERT OR UPDATE OF birth_date ON public.customer_participants
  FOR EACH ROW EXECUTE FUNCTION public.participant_birth_date_guard();
