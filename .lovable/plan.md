# B03a – Safe editing of existing canonical private bookings

## Confirmed causes (read-only evidence, 2026-10-24)
- T-2026-998114 live: 1 `private_appointments` row (price 105, 2026-12-26 10–11, status booked, no invoice), 2 `private_appointment_participants` rows, 1 mirrored `ticket_items` line with `participant_id = NULL`, unit_price 105, ticket total 105.
- `loadTicketForEditing` (BookingWizardContext.tsx:1677) builds participants only from `ticket_items.participant_id` → canonical bookings load 0 participants; the wizard then reprices live for 1 person (85). Display bug confirmed.
- Edit save (Step4Summary.tsx:176) calls `useUpdateBooking`: per-row direct writes (not atomic), sends instructor/meeting point/notes to every line, and `recalculateBookingTotal` rewrites `tickets.total_amount` as sum(unit_price*quantity), ignoring `line_total`/discounts. Canonical server formula `pa_recalc_ticket_total` uses `coalesce(line_total, unit_price*qty*(1-discount))`.
- Hypothesis (not executed): saving T-2026-998114 would either be rejected by `trg_pa_ticket_item_guard` (instructor change) or silently overwrite a discounted total; participant add/remove would insert/delete lines with `unit_price 0` and bypass canonical participants entirely.
- `pa_is_protected` already defines lock rules: past, completed, invoiced (issued/non-draft invoice).

## Scope of this package
Only bookings whose lines carry `appointment_id` (canonical private). Group and legacy private edits keep today's path, except one financial guard (below).

### 1. Hydration (frontend only)
- In `loadTicketForEditing`, also select `appointment_id`, `quantity`, `discount_percent`, `line_total`. If any line has `appointment_id`, load `private_appointments` + `private_appointment_participants` (with participant rows) for the ticket and set:
  - `selectedParticipants` = distinct canonical participants; per-appointment participant ids kept in a new `editCanonical` state slice (appointment id → date/time/instructor/meeting point/participant ids/stored price, protected flag).
  - Summary in edit mode shows stored prices and stored ticket total; no live repricing, no checkout finance defaults (payment, due date, discount stay as stored; existing `checkoutDefaults()` reset remains only to prevent leakage, not written back).
- Multiday: dates/times/instructor come per appointment, not from the "first item".

### 2. Editable fields and save path for canonical bookings
| Change | Path | Atomic? |
|---|---|---|
| Date/time/instructor of one appointment | existing `paMove` (one transaction, conflict + protection checks) | yes, reuse |
| Same time/instructor change for a whole period | existing `paPeriodUpdate` | yes, reuse |
| Meeting point, internal/instructor notes, customer notes | NEW narrow action `update_details` | needs backend |
| Add/remove participant | blocked in UI and server for canonical bookings in B03a (see question) | — |

- Edit save for canonical bookings never calls `useUpdateBooking`. Only one server call per save: if several schedule changes are pending, the UI allows saving one kind at a time (scheduler/detail already use move/period_update); no client-side multi-call sequences → no partial commits.
- NEW `private-appointments` action `update_details` → service_role SQL `pa_update_details(p_ticket, p_changes, p_actor)`: one transaction, row locks on ticket + appointments, `pa_is_protected` check (fail closed `protected`), updates only `meeting_point` (appointment + mirrored lines) and notes fields, audit via existing `pa_emit_change`/ticket_history, never touches prices, totals, payments, invoices, participants or confirmation. Optional `expected_updated_at` to refuse stale edits (`conflict`).
- Unchanged save = no-op (client sends nothing; server returns ok with no writes).

### 3. Legacy guard (non-canonical tickets)
- `useUpdateBooking`: only recompute `total_amount` when participants were added/removed; when recomputing, use `coalesce(line_total, unit_price*qty*(1-discount/100))` matching `pa_recalc_ticket_total`. Unchanged/notes-only saves no longer rewrite the total. Everything else in the legacy path unchanged (known non-atomic limitation, recorded separately).

## Essential open question (Ivo)
When Office intentionally adds or removes a participant on an existing canonical private booking, should the appointment price be recalculated with the current tariff for the new person count (`pa_price`), or keep the stored price and require a manual adjustment? Until answered, participant changes on canonical bookings are blocked with a clear German message ("Teilnehmer bei Privatlektionen bitte neu buchen oder Büro-Leitung fragen").

## Technical details
Files
- `src/contexts/BookingWizardContext.tsx` – canonical hydration, `editCanonical` slice.
- `src/components/bookings/wizard/Step4Summary.tsx` – route canonical edits; stored price display.
- `src/components/bookings/wizard/Step1CustomerParticipant.tsx` / `BookingSummaryCards.tsx` – disable participant add/remove for canonical edit; show per-appointment people.
- `src/lib/privateAppointmentsApi.ts` – `paUpdateDetails`.
- `supabase/functions/_shared/privateAppointmentsContract.ts`, `supabase/functions/private-appointments/index.ts` – `update_details` schema/branch.
- `drizzle/migrations/0015_pa_update_details.sql` + `supabase/rollback/pa_update_details_rollback.sql` – new service_role-only function (REVOKE from anon/authenticated).
- `src/hooks/useUpdateBooking.ts` – total guard.
- `AGENTS.md` – one rule: canonical private edits go only through `private-appointments` (move/period_update/update_details).

Regression fixtures (synthetic only, never T-2026-998114 or other existing tickets)
- Unit: hydration helper with 1 appointment/2 participants/NULL line participant → 2 names, stored 105 shown; 3-day booking with differing participants per appointment.
- Unit: legacy total helper – discounted lines, notes-only save keeps total.
- SQL (`tests/sql` baseline + psql fixture): `pa_update_details` updates meeting point/notes only; price/total/participants unchanged; protected (past/invoiced) refused with no writes; concurrent stale `expected_updated_at` refused; anon/authenticated cannot execute.
- Contract test: `update_details` schema accepts/rejects.
- Browser (intercepted network): canonical edit opens with 2 names/105, unchanged save sends no write, notes save sends exactly one `update_details` call, participant controls disabled; legacy and create flows (B01/B02 checkout persistence) still pass; scheduler performance browser checks re-run.

Release needs
- Frontend preview after implementation; migration 0015 install and `private-appointments` redeploy each require separate authorization. Until both are live, the frontend hides `update_details` edits (feature flag) and canonical bookings stay read-only for notes/meeting point; move/period_update keep working.
- Rollback: revert frontend commit; drop `pa_update_details` via rollback SQL; redeploy previous `private-appointments`. No data repair involved.

## Separate, not in B03a
- B02 retest note: default due date persisted NULL while manual worked, on asset `index-CkC-hCqh.js` not bound to a commit. To be reproduced on an identified build first; no speculative fix here.
- Legacy edit path remains non-atomic (separate item).
