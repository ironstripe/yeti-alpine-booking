# B03a – Editing existing canonical private bookings

## Behaviour
- Opening a booking whose lines carry `appointment_id` loads every `private_appointments` row with its real people (`private_appointment_participants`), stored price, line discount, teacher and times per date. People are no longer taken from `ticket_items.participant_id`. Checkout finance defaults are not copied in.
- Such bookings show a dedicated edit screen (no wizard steps, no live repricing). Editable: people per lesson, meeting point per lesson, internal/teacher/customer notes. Date/time/teacher stay on the existing scheduler move/period paths (unchanged).
- Unchanged save sends nothing. Notes/meeting point never reprice. Adding/removing a person on a lesson that is not past/completed/invoiced asks the server for a price (`pa_price`, stored discount kept), shows old→new, and saving acknowledges exactly that price; any difference (`quote_changed`) or stale data (`conflict`) saves nothing.
- The legacy wizard save path is refused for canonical bookings. For legacy bookings the ticket total is only recomputed when lines are added/removed, using stored line totals/discounts (same formula as `pa_recalc_ticket_total`).
- Until the backend is released, saving shows "Bearbeiten bestehender Privatlektionen ist noch nicht freigeschaltet. Es wurde nichts gespeichert." (no fallback).

## Files
- `src/lib/canonicalPrivateEdit.ts` (new), `src/components/bookings/wizard/CanonicalPrivateEditPanel.tsx` (new)
- `src/contexts/BookingWizardContext.tsx` (hydration, `canonicalEdit`), `src/pages/BookingWizard.tsx` (render panel), `src/components/bookings/wizard/Step4Summary.tsx` (refuse legacy save), `src/hooks/useUpdateBooking.ts` (total guard), `src/lib/privateAppointmentsApi.ts` (`paEditQuote`/`paEditApply`, messages)
- `supabase/functions/_shared/privateAppointmentsContract.ts`, `supabase/functions/private-appointments/index.ts` (`edit` action)
- `supabase/pending/pa_edit_booking.sql` (new, NOT installed, no migration number assigned), `supabase/rollback/pa_edit_booking_rollback.sql`
- Tests: `tests/canonicalPrivateEdit.test.ts`, `tests/paEditBooking.integration.mjs`, `tests/canonicalPrivateEditBrowser.py`, `supabase/functions/private-appointments/contract.test.ts`

## Evidence (this change, synthetic only)
- SQL (throwaway local PostgreSQL, production baseline + pending SQL): 11/11 – privileges; 2 people/NULL line participant/price 100; unchanged quote/apply no writes/history/notifications; notes+meeting point keep discounted total; add person quote/ack (wrong ack → nothing written); stale/concurrent abort; remove person; multiday only edited lesson changes; failing 2nd lesson rolls back 1st; forbidden/ownership/not_found; paid + issued invoice: no-op, participant/meeting point protected, notes allowed. `paAssignLater` regression 16/16.
- Unit: `bun test tests` 297 pass / 3 existing skips / 0 fail.
- Deno: contract schema 4/4; `check:functions` OK.
- Browser (intercepted network, 1280×1800 and 390×800): 19 checks each incl. hydration, unchanged save sends nothing, quote→ack payload, notes-only, unavailability message, legacy switch reset, zero direct table writes. B01/B02 `checkoutPersistenceBrowser.py`: 0 failures.
- Not run: live backend, authenticated real ticket (T-2026-998114 deliberately untouched), real notifications.

## Release (coordinated, each step separately authorised)
1. Install `supabase/pending/pa_edit_booking.sql` as the next free tracked migration number at release time.
2. Deploy only `private-appointments`.
3. Publish the frontend.
Order 1→2→3. Before step 2 the frontend reports unavailability; before step 1 a new function returns 503 `unavailable`.

## Rollback
Revert the frontend commit; redeploy the previous `private-appointments`; run `supabase/rollback/pa_edit_booking_rollback.sql`. No data repair needed; edits already applied stay audited in `ticket_history` (`PRIVATE_APPOINTMENT_CHANGED`, change `edited`, with old/new prices).

## Retest after release
- T-2026-998114: open edit → 2 names, CHF 105; save unchanged → total/history unchanged.
- Synthetic new booking: add one person → preview shows new price → save → total matches preview; discount kept.
- Booking with issued invoice: person change refused, notes save.
- Two browsers: change in one, save in other → "Buchung wurde inzwischen geändert".

## Separate (not changed)
B03b documents; B02 retest note (default due date NULL on asset `index-AkC-hCqh.js`) requires reproduction on an identified build. Mocked checkout regressions do not constitute B02 acceptance.

## Focused review follow-up — 25 October 2026
Start: `0122df5e26a3e5b69a295ebc4211466d200f1e46` (current main, preserving the concurrent scheduler package). Prior B03a implementation was not redone.

### Corrections
- Mandatory `expected_total` and, for every edited appointment, sorted original participant IDs, price and exact original scheduler/line snapshot: date, full time values, teacher, meeting point, status, billing-line ID, quantity, unit price, generated line total, discount/reason, internal and instructor notes. Customer-note edits require their exact nullable original. Contract rejects missing originals; pending SQL independently enforces them. Ticket, appointments, linked lines and participant links are locked; all original checks precede all writes in quote and apply. A price acknowledgement cannot bypass `conflict`.
- Internal/instructor notes are hydrated and edited per lesson, not from the first item. Requests carry only changed lessons and fields; unrelated notes remain intact. Customer note remains ticket-level. Ambiguous or missing canonical billing mirrors fail closed.
- Every effective participant-set change requires price and total acknowledgement, including same-count/same-price replacement. Quote and apply use the same discounted net delta on the authoritative stored total rather than recomputing the entire ticket. Example: stored 777 versus discounted lines 90, same-price replacement stays 777; add one person 100→120 with 10% discount yields 795, not a silent repair to 108. Notes-only/no-op preserve totals. `pa_price` remains authoritative; stored discounts are retained.

### Reproduction and verification (synthetic local data only)
- Before correction: new hydration regression failed (per-lesson notes undefined); four new SQL review cases failed, original 11 passed. SQL reproduced ignored per-lesson notes, stale notes/customer note acceptance and same-price replacement accepted without acknowledgement. Logs retained at `/tmp/b03a-before.log` and `/tmp/b03a-unit-before.log` for this sandbox.
- After correction: `bun tests/paEditBooking.integration.mjs`: **17/17**, production baseline plus pending SQL, fresh throwaway localhost database. Includes stale internal/instructor/customer notes, meeting point, same-price time/date/teacher changes, changed discount, mandatory originals, quote/apply conflicts, first appointment unwritten when second stale/invalid, same-price discrepancy and changed-price delta, mixed ticket group row preserved byte-for-byte, existing protection/ownership/discount/no-op regressions.
- `bun tests/paAssignLater.integration.mjs`: **16/16**; `bun test tests`: **330 pass, 3 existing skips, 0 fail**. Deno schema **4/4**, live tests excluded; `bun run check:functions private-appointments`: passed. Automatic preview build OK; no separate frontend typecheck was manually run (harness-managed).
- `python3 tests/canonicalPrivateEditBrowser.py`: **48 assertions**, actual production loader and panel under retained provider, intercepted requests at 1280×1800 and 390×800: separate lesson notes, original scheduler/line payload, customer-note original, no-op/reset, quote/ack, single-lesson note payload, stale rejection retaining editor, backend unavailability, legacy switch, zero direct business writes/page errors. Screenshots inspected. `python3 tests/checkoutPersistenceBrowser.py`: **130 assertions, 0 failures**, intercepted B01/B02 regression only; **not independent B02 acceptance**.

### Capability limits (investigated, not silently expanded)
- Mixed canonical-private/group tickets enter the dedicated private panel whenever any item has `appointment_id`. The panel edits private lessons only; it has no group-edit controls. SQL fixture verifies its private edit leaves the group row, notes and discount untouched. Editing group lines within this dedicated panel remains unavailable; pure group/legacy wizard code is unchanged. Mixed-ticket participant_count retains the prior B03a private-only count semantics and is not established as correct for combined group participants; no new rule was invented here.
- New participant creation is **not available inside the dedicated panel** (only existing customer people can be selected). The existing wizard `SlotBookingPopover` creation and customer `FamilyHub` add-participant workflow remain, but were not exercised with writes. A participant created separately requires reloading this editor. No new participant-creation contract/UI was added in this narrowly scoped follow-up.
- No live ticket, historic test ticket, notification, payment, invoice, remote database or deployed endpoint was touched. Authenticated live save and notification delivery were deliberately not tested. B03b and B02 retest remain separate.

### Exact changed files / release boundary
`src/lib/canonicalPrivateEdit.ts`, `src/components/bookings/wizard/CanonicalPrivateEditPanel.tsx`, `supabase/functions/_shared/privateAppointmentsContract.ts`, `supabase/pending/pa_edit_booking.sql`, `tests/canonicalPrivateEdit.test.ts`, `tests/paEditBooking.integration.mjs`, `tests/canonicalPrivateEditBrowser.py`, `supabase/functions/private-appointments/contract.test.ts`, `AGENTS.md`, `roadmap.md`, this document. No generated auth/config files changed.

Pending only: release reviewed pending SQL as the next free tracked migration, deploy only `private-appointments`, then matching frontend, each separately authorised. No migration number allocated, SQL installed, function deployed or frontend published. Old frontend payloads are rejected by the stricter contract; coordinate versions, do not downgrade to permissive originals. Release rollback: revert matching frontend/function and drop `pa_edit_booking` with existing `supabase/rollback/pa_edit_booking_rollback.sql`; this disables editing without data repair or history deletion. Do not restore the unsafe permissive edit function. Retest two editors with notes and moved same-price lesson; per-lesson distinct notes; same-price replacement on synthetic discrepant-total ticket; stale after quote; mixed ticket private-only edit; original T-2026-998114 read-only/no-op after separately authorised release.
