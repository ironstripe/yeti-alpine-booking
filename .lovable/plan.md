# Booking-Corner Apply (super-admin only, nothing run by the agent)

Scope: build the Apply step for the existing preview. No real import, no publish, no UX redesign, no product/pricing/checkout changes.

## Approval gates
```text
A  Migration (additive): apply decisions, batch status, apply RPC, availability gating  -> your approval
B  Edge Function + dialog UI deployed, tested only with synthetic files
C  You run the real apply yourself from the dialog (not part of this task)
```

## 1. Review in the existing preview dialog
- After the preview: three sections "Neu (67)", "Verknüpfen (20, Entscheid nötig)", "Nur in YETI (11, unverändert)".
- Each of the 20 rows shows target UUID + name, evidence (name/phone/email/DOB) and the 4 flagged conflicts highlighted. Choices per row: Verknüpfen / Neu anlegen / Überspringen. No default: Apply stays disabled until all 20 are decided.
- Separate "Import ausführen" button, confirmation dialog with final counts. Upload alone never approves anything.
- Progress per batch, "Fortsetzen" after an interruption.

## 2. Apply server step
- New Edge Function `instructor-import-apply`: JWT checked in code, `requireRole(["super_admin"])`. Input: run_id, XLSX + ZIP again, their SHA-256, decisions.
- Rejects if hashes differ from the preview run, run not in `preview`/`applying`, or season changed. Re-parses and re-classifies server-side; any changed evidence for a row (target deleted/changed, phone/email no longer matching, new email collision, target already linked to another source ID) blocks that row as `conflict` instead of guessing.
- DB function `bc_apply_batch(run_id, rows jsonb)` (service_role only, one transaction per batch of 20):
  - create: new instructor, `show_on_website=false`, missing email/phone/wage stay empty (no CHF 30, no country guess, no skills).
  - link: existing UUID kept; only fill empty fields with source values, never blank out existing values; flags untouched.
  - source link upsert (unique source system + rollout + source ID) with checksum → retry is a no-op.
  - HR-private row: wage text, bank, AHV, unresolved fields, unmapped skills/meeting points.
  - deployment window only when a real positive window exists (76); never absences.
  - per-row status in staging (`pending/applied/skipped/conflict/failed`); run status `applying → applied` only when all non-skipped rows applied.
- Never touches the 11 YETI-only, the 367 archived, bookings, or absences. No deletes.

## 3. Photos (43)
- Decode JPEG, apply EXIF orientation, re-encode → output carries no EXIF/GPS. No upscaling (max edge kept, only downscale above 1600 px).
- Check after re-encode: no APP1/EXIF marker present; otherwise that photo is blocked and reported (raw JPEG is never uploaded).
- Stored in private `instructor-hr-photos` as `<instructor-uuid>/<sha>.jpg`, metadata row with `booking_import` origin.
- If the current photo is `manual_upload`, the import photo is stored as non-current and does not replace it.
- 44 without photo stay empty. Nothing goes to the public avatar bucket.
- Admin sees it via a 5-minute signed link; manual replace keeps working.
- Blocker check first: if the image library cannot decode/re-encode in the server runtime, I stop and report instead of uploading.

## 4. Bookability by deployment window
- Rule: a person with at least one deployment window is bookable only on dates inside a window; people with no windows behave as today.
- 11 imported people without a 26/27 window get no window but a "no window" marker → not bookable.
- Applied in the server free-slot check, availability check and the instructor list for the wizard/scheduler (greyed out with the existing unavailable style). No layout change.

## Tests (synthetic only)
- Hash mismatch, run state, changed evidence → conflict, email collision, target already linked.
- Missing email/phone/wage stay empty; no CHF 30.
- Photo: orientation applied, EXIF/GPS removed, no upscaling, manual photo wins.
- Season boundaries 01.12.2026 / 15.04.2027, no-window = not bookable, no absences.
- Partial failure in batch 2 → resume → no duplicates; second full run = 0 new rows.
- RLS: teacher/office/anon denied on HR, staging, photos; super_admin allowed.
- Deno check, Deno tests, app build. Synthetic data cleaned up afterwards.

## Separate finding: published app crash
The published app crashes for Ivo with "reading icon" because the old published code builds the role switcher from all roles, including the new super_admin, which has no icon entry. The fix already exists in the preview (super_admin hidden from role choice). It only reaches the live app with a publish, which would also ship the other unpublished changes. I will not publish; this is your separate decision.

## Rollback
`supabase/rollback/bc_apply_rollback.sql`: drop new function/columns; imported data is left alone (removing it is a separate, reviewed step).
