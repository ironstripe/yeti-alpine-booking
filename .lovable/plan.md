# Plan: Private appointments — Phase 1 only (additive schema and reconciliation)

Scope: database structure, read-only helper functions, a guard trigger, access rules, a rollback script and tests.

Out of scope:
- no Edge Function;
- no UI, Wizard or Scheduler change;
- no backfill run;
- no change to any existing row;
- no RLS weakening;
- no publish.

## Verified starting point
- **`private_appointments`** exists with id, ticket_id (NOT NULL, FK to tickets), date, time_start, time_end, instructor_id, status (text, no CHECK), instructor_confirmation, meeting_point, period_group_id, created_at and updated_at. It has **0 rows**.
- **`ticket_items.appointment_id`** exists and is nullable. It has **0 linked rows**. `ticket_items.participant_id` is already nullable, so no change is needed.
- **Existing `ticket_items` triggers:** `check_ticket_item_times`, `ticket_item_instructor_notification_trigger`, `trg_ticket_item_instructor_changed`.
- **Values in use today:** invoice statuses `draft`, `open`; confirmations `confirmed`, `pending`.
- **Tests and migrations:** there is no `supabase/tests/` folder and no frontend test script. Migration files are named `<timestamp>_<uuid>.sql` by the migration tool.

## Migrations (two, applied in order)

The migration tool assigns the timestamp and uuid. Each file starts with a header comment giving the logical name below. The real filenames are reported after each one is applied.

**1. `supabase/migrations/<ts>_<uuid>.sql`, logical name `pa_phase1a_schema`**
- **New table `private_appointment_participants`:**
  - columns: id, appointment_id (FK to private_appointments ON DELETE CASCADE), participant_id (NOT NULL, FK to customer_participants), attendance text (NULL | present | absent, via CHECK), attendance_by, attendance_at, created_at, updated_at;
  - unique constraint on (appointment_id, participant_id);
  - indexes on participant_id.
- **New columns on `private_appointments`**, all nullable or defaulted, so existing code keeps working:
  - `price numeric(10,2)`;
  - `confirmed_at timestamptz` and `confirmed_by uuid`;
  - CHECK `status IN ('scheduled','booked','completed','cancelled')`. `booked` is kept because the unpublished last-step code writes it. The CHECK is added `NOT VALID` then validated; there are 0 rows.
- **New table `private_appointment_backfill_log`:** id, run_id, ticket_id, ticket_item_id, old_unit_price, old_appointment_id, old_ticket_total, action, created_at. It stays empty in Phase 1.
- **Grants, then RLS, in this order:**
  - Mapping: SELECT, INSERT, UPDATE and DELETE to authenticated; ALL to service_role. Policies: office/admin manage via `is_admin_or_office(auth.uid())`; teachers SELECT only where the appointment's instructor is `get_instructor_for_user(auth.uid())`.
  - Backfill log: ALL to service_role only. RLS is enabled with no policies, so the browser has no access.
  - No anon grants anywhere. Existing policies are untouched.
- `updated_at` trigger on the mapping, using the existing `update_updated_at_column()`.

**2. `supabase/migrations/<ts>_<uuid>.sql`, logical name `pa_phase1b_functions`**

All functions are `STABLE`, read-only and `SET search_path = public`. `EXECUTE` is revoked from PUBLIC, anon and authenticated, and granted to service_role only.
- `pa_business_today() -> date`: current date in Europe/Zurich.
- `pa_price(p_date date, p_start time, p_end time, p_persons int) -> numeric`. It mirrors `calculatePrivateLessonPrice`:
  - per full hour, the rate from `private_lesson_rates`;
  - plus (persons − 1) × hours × additional rate (default 20);
  - persons are clamped to 1–4;
  - invalid or zero duration returns 0.
- `pa_is_protected(p_appointment_id uuid) -> jsonb`. Returns `{protected, reasons[]}`:
  - `past`: date before `pa_business_today()`;
  - `completed`: status is completed;
  - `invoiced`: the ticket has an invoice with `issued_at IS NOT NULL` or `status NOT IN ('draft','cancelled','void')`.
- `pa_slot_conflicts(p_instructor uuid, p_date date, p_start time, p_end time, p_exclude_appointment uuid) -> TABLE(kind, ref_id, time_start, time_end)`. It checks overlapping instructor `ticket_items` (not cancelled, excluding the given appointment's lines), other `private_appointments`, `instructor_absences` and `instructor_recurring_blocks` (weekday and validity range).
- `pa_slot_is_free(...) -> boolean`: true when there are no conflicts.
- `pa_reconcile_report() -> TABLE(ticket_id, item_total_before, item_total_after, ticket_total, planned_action, skip_reason)`. Read-only; it never writes.
  - Candidates are private `ticket_items` with `appointment_id IS NULL`.
  - Skip reasons are checked in this order: `past`, `not_scheduled`, `invoiced`, `ambiguous_slot`, `has_overrides`, `total_mismatch`.
  - `planned_action` is `backfill` only when there is no skip reason and after equals before.
- **Guard trigger `trg_pa_ticket_item_guard`** (BEFORE INSERT OR UPDATE on `ticket_items`):
  - It acts only when `NEW.appointment_id IS NOT NULL`, so all 0 existing linked rows and every legacy or group row are unaffected.
  - It rejects a row whose date, time_start, time_end, instructor_id or instructor_confirmation differs from its appointment.
  - It rejects setting `instructor_confirmation = 'confirmed'` unless the appointment is confirmed.
  - This is the payroll no-bypass rule.
  - The unpublished last-step write path (appointment first, then matching rows) still passes. That path is replaced in Phase 2.

## Rollback
`supabase/rollback/private_appointments_phase1_rollback.sql`, reviewed but not executed:
- drop the trigger and the Phase 1 functions;
- drop the empty tables `private_appointment_backfill_log` and `private_appointment_participants`;
- drop the new columns and the CHECK on `private_appointments`.

It refuses to run (RAISE) if the mapping or log contains rows. It adds no grants and no anon access.

## Tests
- **`supabase/tests/private_appointments_phase1_test.sql`.** Runs inside `BEGIN … ROLLBACK`, so nothing persists. It uses synthetic fixtures and asserts:
  - protection reasons (past, completed, invoiced, draft invoice not protected);
  - every conflict kind, plus that the excluded appointment does not count;
  - guard trigger rejects and accepts;
  - mapping uniqueness and NOT NULL;
  - reconcile skip reasons, with no rows changed afterwards.
- **`supabase/functions/_shared/privatePricingParity.test.ts`** (Deno). It imports `src/lib/pricing/private-lesson-pricing.ts` by relative path and compares it with `supabase/tests/private_price_fixture.json`. The fixture holds the SQL `pa_price` outputs for a grid of start/end times 09–16, 1–5 persons and high/low season dates, generated once from the database. Every case must match exactly.
- **Access probes:**
  - an anon REST call on the mapping and log returns 401;
  - an authenticated `rpc('pa_price')` is denied.

## Phase 1 acceptance checklist
- [ ] Two migrations applied; filenames reported; each has its logical-name header.
- [ ] Before/after counts are unchanged for tickets, ticket_items, invoices, customer_participants and private_appointments. No existing row modified.
- [ ] Existing policies are identical: a policy snapshot diff shows only the new table policies.
- [ ] No anon grants on the new objects. Functions are executable only by service_role.
- [ ] Guard trigger has no effect on rows without `appointment_id`: the legacy private and group create paths are unchanged in the SQL test.
- [ ] SQL test passes; pricing parity is 100% on the full grid.
- [ ] `pa_reconcile_report()` runs and returns a report; it wrote 0 rows. The expected result today is no candidates.
- [ ] Rollback script reviewed; it contains no anon grants or blanket statements.
- [ ] Security linter shows no new findings from these objects.
- [ ] No Edge Function, UI or publish change; the build log is unchanged.
- [ ] `AGENTS.md` gets one rule: private appointment integrity (mapping, guard, service-role-only functions).
