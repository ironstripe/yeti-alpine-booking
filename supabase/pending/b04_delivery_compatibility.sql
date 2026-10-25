-- B04 ONLY. Pending, not installed. Assign the next free tracked migration at release.
-- No data backfill: null protocol/lease/payload is historical, NOT proof of no handoff.
BEGIN;
ALTER TABLE public.booking_email_deliveries
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_idempotency_key text,
  ADD COLUMN IF NOT EXISTS frozen_payload jsonb,
  ADD COLUMN IF NOT EXISTS payload_digest text,
  ADD COLUMN IF NOT EXISTS delivery_protocol text;
-- Explicit insert provenance distinguishes new leased rows from legacy attempts=0.
-- No default: old consumers cannot accidentally opt historical rows into recovery.
ALTER TABLE public.booking_email_deliveries
  DROP CONSTRAINT booking_email_deliveries_kind_check;
ALTER TABLE public.booking_email_deliveries
  ADD CONSTRAINT booking_email_deliveries_kind_check
  CHECK (kind IN ('booking_confirmation', 'invoice'));
-- Preserve all existing grants, RLS, FKs, unique constraints and logs unchanged.
COMMENT ON COLUMN public.booking_email_deliveries.delivery_protocol IS
  'Explicit new-row provenance: leased_v1 course sender, legacy_v1 old confirmation sender. NULL remains legacy/review-required; never backfill from timestamps/status.';
COMMIT;