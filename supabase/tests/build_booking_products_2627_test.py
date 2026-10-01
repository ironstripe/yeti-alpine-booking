#!/usr/bin/env python3
"""Wrap the exact generated Malbun 26/27 product draft SQL in BEGIN/ROLLBACK."""
from pathlib import Path
from hashlib import sha256
import re

root = Path(__file__).resolve().parents[2]
source = root / 'supabase/migrations/20261001194500_malbun_2627_product_drafts.sql'
target = root / 'supabase/tests/booking_products_2627_rollback_test.sql'
body = source.read_text()
assert body.startswith('-- Booking-Corner Malbun 26/27: INACTIVE PRODUCT DRAFTS ONLY.')
assert body.endswith('$apply$;\n')
assert not re.search(r'(?im)^\s*(COMMIT|ROLLBACK)\s*;', body)
result = (
    'BEGIN;\n'
    + body
    + "\nDO $activation_test$ BEGIN\n"
    + "  BEGIN\n"
    + "    UPDATE public.products SET is_active=true WHERE id=(SELECT product_id FROM public.bc_product_tariff_sources WHERE source_family='Privatkurs' LIMIT 1);\n"
    + "    RAISE EXCEPTION 'activation unexpectedly succeeded';\n"
    + "  EXCEPTION WHEN raise_exception THEN\n"
    + "    IF SQLERRM <> 'Booking-Corner draft cannot be activated before pricing release gate' THEN RAISE; END IF;\n"
    + "  END;\n"
    + "END; $activation_test$;\n"
    + "\nSELECT (SELECT count(*) FROM public.products WHERE season_id=(SELECT id FROM public.seasons WHERE name='Winter 26/27') AND is_active IS FALSE) AS draft_products,\n"
    + "       (SELECT count(*) FROM public.product_price_tiers WHERE product_id IN (SELECT id FROM public.products WHERE season_id=(SELECT id FROM public.seasons WHERE name='Winter 26/27'))) AS imported_group_tiers,\n"
    + "       (SELECT count(*) FROM public.bc_product_tariff_sources WHERE source_family='Privatkurs') AS private_rate_rows,\n"
    + "       (SELECT count(*) FROM public.bc_product_tariff_sources WHERE import_status='deferred_care') AS care_review_rows,\n"
    + "       (SELECT count(*) FROM public.products WHERE is_active IS TRUE) AS old_active_products;\n"
    + 'ROLLBACK;\n'
)
target.write_text(result)
print('body_sha256='+sha256(body.encode()).hexdigest())
print('test_sha256='+sha256(result.encode()).hexdigest())
print('test_bytes='+str(len(result.encode())))
