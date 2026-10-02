-- SIX IG 2.3 transition: allow EUR QRR with a QR-IBAN for CH/LI invoices
-- only when an explicit profile validity end is no later than 2027-10-31.
-- IG 2.4 disallows EUR QRR after November 2027. The shared payment-domain
-- checks the actual invoice due date independently of this profile constraint.
-- Data-free schema change; existing invoice snapshots and profiles are untouched.
ALTER TABLE public.payment_profiles
  DROP CONSTRAINT IF EXISTS payment_profiles_qrr_chk;

ALTER TABLE public.payment_profiles
  ADD CONSTRAINT payment_profiles_qrr_chk CHECK (
    (
      reference_type = 'QRR'
      AND account_type = 'qr_iban'
      AND presentation_type = 'swiss_qr'
      AND (
        currency = 'CHF'
        OR (
          currency = 'EUR'
          AND country_scope = 'CH_LI'
          AND valid_until IS NOT NULL
          AND valid_until <= DATE '2027-10-31'
        )
      )
    )
    OR (reference_type <> 'QRR' AND account_type = 'iban')
  );
