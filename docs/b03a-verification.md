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
B03b documents; B02 retest note (default due date NULL on asset `index-CkC-hCqh.js`) requires reproduction on an identified build.
