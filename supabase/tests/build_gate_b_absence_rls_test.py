#!/usr/bin/env python3
"""Generate simulated-lock and actual-live-lock rollback tests for absence RLS."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / "migrations/20261001164500_gate_b_absence_rls.sql").read_text()
template = (root / "tests/gate_b_absence_rls_test.template.sql").read_text()
marker = "-- INSERT_MIGRATION_HERE"
assert template.count(marker) == 1
assert "BEGIN;" in template and template.rstrip().endswith("ROLLBACK;")
assert "COMMIT;" not in source and "ROLLBACK;" not in source
simulated = root / "tests/gate_b_absence_rls_test.sql"
simulated.write_text(template.replace(marker, source))

verify_live = """-- The 4 policies and guard must ALREADY exist in the real Cloud DB.
-- No policy DDL in this mode: the following role probes exercise the live lock.
DO $pre$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='instructor_absences' AND policyname LIKE 'absence_staff_or_own%') <> 4
     OR (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='instructor_absences' AND policyname LIKE 'Authenticated users can % absences') <> 0
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.instructor_absences'::regclass
      AND tgname='trg_guard_teacher_absence_update' AND NOT tgisinternal) <> 1
  THEN RAISE EXCEPTION 'gate_b_live_lock_missing'; END IF;
END $pre$;
"""
actual_live = root / "tests/gate_b_absence_rls_live_test.sql"
actual_live.write_text(template.replace(marker, verify_live))
for p in (simulated, actual_live):
    print(f"Generated {p} ({p.stat().st_size} bytes)")
