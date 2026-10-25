DO $$
BEGIN
  IF to_regprocedure('public.private_tariff_activation_ok(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Reviewed B01-B11 migration chain is incomplete';
  END IF;
  IF (SELECT count(*) FROM public.products p JOIN public.product_private_tariff_revisions r ON r.product_id = p.id WHERE p.id IN ('3646f155-8a66-53e3-b512-749f3a42c1ae'::uuid, '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'::uuid) AND p.is_active AND r.revision = 1) <> 2 THEN
    RAISE EXCEPTION 'Reviewed two-product activation is incomplete';
  END IF;
END $$;