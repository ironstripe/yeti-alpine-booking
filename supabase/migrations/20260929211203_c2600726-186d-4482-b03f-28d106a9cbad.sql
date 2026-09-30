-- P0.2 Step 1D: additive columns for idempotent server-side booking-request submission.
ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS submission_key text,
  ADD COLUMN IF NOT EXISTS acknowledgement_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_submission_key_uidx
  ON public.booking_requests (submission_key)
  WHERE submission_key IS NOT NULL;