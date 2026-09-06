-- =========================================================
-- Payment profiles
-- =========================================================
CREATE TABLE public.payment_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  presentation_type text NOT NULL,
  bank_name text,
  account_holder text NOT NULL,
  iban text NOT NULL,
  bic_swift text,
  account_holder_street text,
  account_holder_house_number text,
  account_holder_zip text NOT NULL,
  account_holder_city text NOT NULL,
  account_holder_country char(2) NOT NULL,
  currency char(3) NOT NULL,
  reference_type text NOT NULL,
  country_scope text NOT NULL,
  account_type text NOT NULL DEFAULT 'iban',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  valid_from date,
  valid_until date,
  validation_status text NOT NULL DEFAULT 'draft',
  validation_notes text,
  validated_at timestamptz,
  validated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT payment_profiles_presentation_chk
    CHECK (presentation_type IN ('swiss_qr','sepa_transfer','international_transfer')),
  CONSTRAINT payment_profiles_currency_chk CHECK (currency IN ('CHF','EUR')),
  CONSTRAINT payment_profiles_country_chk CHECK (account_holder_country ~ '^[A-Z]{2}$'),
  CONSTRAINT payment_profiles_reference_chk
    CHECK (reference_type IN ('QRR','SCOR','NON','INVOICE_NUMBER')),
  CONSTRAINT payment_profiles_scope_chk CHECK (country_scope IN ('CH_LI','SEPA','INTERNATIONAL')),
  CONSTRAINT payment_profiles_account_type_chk CHECK (account_type IN ('iban','qr_iban')),
  CONSTRAINT payment_profiles_validation_chk CHECK (validation_status IN ('draft','valid','invalid')),
  -- QRR only with QR-IBAN + swiss_qr; QR-IBAN never with NON/SCOR
  CONSTRAINT payment_profiles_qrr_chk CHECK (
    (reference_type = 'QRR' AND account_type = 'qr_iban' AND presentation_type = 'swiss_qr' AND currency = 'CHF')
    OR (reference_type <> 'QRR' AND account_type = 'iban')
  ),
  -- swiss_qr only for CH/LI scope
  CONSTRAINT payment_profiles_swissqr_scope_chk CHECK (
    presentation_type <> 'swiss_qr' OR country_scope = 'CH_LI'
  ),
  CONSTRAINT payment_profiles_validity_chk CHECK (
    valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from
  ),
  CONSTRAINT payment_profiles_active_requires_valid CHECK (
    is_active = false OR validation_status = 'valid'
  ),
  CONSTRAINT payment_profiles_archived_not_active CHECK (
    is_archived = false OR (is_active = false AND is_default = false)
  )
);

CREATE UNIQUE INDEX payment_profiles_one_default_idx
  ON public.payment_profiles (country_scope, currency)
  WHERE is_default AND is_active AND NOT is_archived;

CREATE INDEX payment_profiles_lookup_idx
  ON public.payment_profiles (country_scope, currency, is_active)
  WHERE NOT is_archived;

GRANT SELECT, INSERT, UPDATE ON public.payment_profiles TO authenticated;
GRANT ALL ON public.payment_profiles TO service_role;

ALTER TABLE public.payment_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and office can view payment profiles"
  ON public.payment_profiles FOR SELECT TO authenticated
  USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can create payment profiles"
  ON public.payment_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can update payment profiles"
  ON public.payment_profiles FOR UPDATE TO authenticated
  USING (public.is_admin_or_office(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE TRIGGER update_payment_profiles_updated_at
  BEFORE UPDATE ON public.payment_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Archived / inactive profiles may never be attached to a new invoice: enforced in app + below.

-- =========================================================
-- Invoice payment snapshot
-- =========================================================
ALTER TABLE public.invoices
  ADD COLUMN payment_profile_id uuid REFERENCES public.payment_profiles(id),
  ADD COLUMN payment_presentation_type text,
  ADD COLUMN payment_snapshot jsonb,
  ADD COLUMN payment_reference_type text,
  ADD COLUMN payment_reference text,
  ADD COLUMN payment_payload_version text,
  ADD COLUMN payment_routing_reason text,
  ADD COLUMN payment_profile_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN payment_profile_override_reason text,
  ADD COLUMN payment_override_by uuid,
  ADD COLUMN issued_at timestamptz,
  ADD COLUMN is_legacy_payment boolean NOT NULL DEFAULT false;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_presentation_chk CHECK (
    payment_presentation_type IS NULL
    OR payment_presentation_type IN ('swiss_qr','sepa_transfer','international_transfer')
  ),
  ADD CONSTRAINT invoices_payment_reference_type_chk CHECK (
    payment_reference_type IS NULL
    OR payment_reference_type IN ('QRR','SCOR','NON','INVOICE_NUMBER')
  );

-- Uniqueness of active references
CREATE UNIQUE INDEX invoices_payment_reference_unique_idx
  ON public.invoices (payment_reference)
  WHERE payment_reference IS NOT NULL AND payment_reference <> '';

CREATE UNIQUE INDEX invoices_qr_reference_unique_idx
  ON public.invoices (qr_reference)
  WHERE qr_reference IS NOT NULL AND qr_reference <> '';

-- Existing invoices keep their historic rendering
UPDATE public.invoices SET is_legacy_payment = true WHERE payment_snapshot IS NULL;

-- =========================================================
-- Structured addresses
-- =========================================================
ALTER TABLE public.school_settings ADD COLUMN house_number text;
ALTER TABLE public.customers ADD COLUMN house_number text;
ALTER TABLE public.billing_partners
  ADD COLUMN street text,
  ADD COLUMN house_number text,
  ADD COLUMN zip text,
  ADD COLUMN city text,
  ADD COLUMN country char(2),
  ADD COLUMN address_review_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.billing_partners
  ADD CONSTRAINT billing_partners_country_chk CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

-- Flag partners with a free-text address that needs manual structuring
UPDATE public.billing_partners
  SET address_review_required = true
  WHERE address IS NOT NULL AND btrim(address) <> '';