#!/usr/bin/env python3
"""Generate the exact competency backfill in a fully rolled-back transaction."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / "migrations" / "20261001181000_backfill_booking_corner_capabilities.sql"
target = root / "tests" / "booking_corner_capabilities_rollback_test.sql"
body = source.read_text(encoding="utf-8")
assert "CREATE TEMP TABLE bc_competency_expected ON COMMIT DROP" in body
assert "DELETE FROM public.instructor_capabilities" in body
assert "SELECT (SELECT count(*) FROM public.capabilities)" in body
assert not any(word in body.upper() for word in ("TRUNCATE ", "DROP TABLE PUBLIC.INSTRUCTORS", "COMMIT;", "ROLLBACK;"))
target.write_text(
    "-- Synthetic migration execution on the real source/target, with all writes rolled back.\n"
    "BEGIN;\nSET LOCAL statement_timeout = '90s';\n"
    + body
    + "\nROLLBACK;\n",
    encoding="utf-8",
)
print(f"Generated {target}")
