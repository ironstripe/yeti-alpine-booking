-- Rollback for 0009_customers_email_optional. Restores NOT NULL only if no customer lacks an email; no backfill.
BEGIN;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_email_not_blank_check;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE email IS NULL) THEN
    ALTER TABLE public.customers ALTER COLUMN email SET NOT NULL;
  ELSE
    RAISE NOTICE 'customers without email exist; email stays nullable';
  END IF;
END $$;
COMMIT;
