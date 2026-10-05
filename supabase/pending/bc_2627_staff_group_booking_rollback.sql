-- Rollback for bc_2627_staff_group_booking.sql. Removes only the staff group-booking
-- functions; the submissions table is kept (it references real tickets) and marked retired.
DROP FUNCTION IF EXISTS public.bc_2627_staff_group_book(jsonb, uuid);
DROP FUNCTION IF EXISTS public.bc_2627_staff_group_options(date[], text);
DROP FUNCTION IF EXISTS public.bc_2627_staff_group_blocks(uuid, int, text, date[]);
DO $$ BEGIN
  IF to_regclass('public.bc_2627_staff_group_submissions') IS NOT NULL THEN
    COMMENT ON TABLE public.bc_2627_staff_group_submissions IS 'DEPRECATED: staff group booking functions rolled back';
  END IF;
END $$;
