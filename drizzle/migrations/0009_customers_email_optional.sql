-- Archive import: customers may have no known email. Uniqueness (customers_email_key) stays for known emails; NULLs are distinct.
ALTER TABLE public.customers ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.customers ADD CONSTRAINT customers_email_not_blank_check CHECK (email IS NULL OR btrim(email) <> '');
COMMENT ON COLUMN public.customers.email IS 'Optional (NULL = unknown). Unique when present; never store placeholder addresses.';