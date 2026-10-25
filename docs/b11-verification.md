# B11 – Booking history amounts and private-lesson texts (F06; HB079–080)

| Layer | Status |
|---|---|
| Implemented (preview) | yes – display formatter + timeline |
| Local technical checks | passed (below) |
| Server change | **pending SQL only, NOT installed** |
| Deployed / published | no |
| Independent acceptance | no |

Base SHA: `29fefa7e7f063eaa9cf6c2d7fa3b2931e3316b14` · Preview commit after edits: `060938bcf92b971aa34aa25f2aaca61355bd0449` (preview availability ≠ release SHA).

## Verified cause (installed definitions, read-only)
- `log_ticket_created` (AFTER INSERT trigger) records `NEW.total_amount` in `BOOKING_CREATED`.
- Installed `pa_create_booking` inserts the ticket first, then creates and prices the lessons, calls `pa_recalc_ticket_total`, and then `pa_emit_change(..., 'created', ...)` with `persons / discount_percent / discount_reason / unassigned` — **no amount**.
- Live aggregates: 101 `BOOKING_CREATED`; 17 `PRIVATE_APPOINTMENT_CHANGED` (16 `created`, 1 `moved`). For all 16 created tickets the creation event shows total 0. The UI showed `PRIVATE_APPOINTMENT_CHANGED` raw, and "(CHF 0)" as if it were the booking price.
- **Missing historic evidence:** no existing event stores the booking amount after lesson pricing. Old history therefore shows "Buchungsbetrag zu diesem Zeitpunkt nicht protokolliert". The current ticket total is deliberately not used.

## Changes
- `src/lib/ticketHistoryFormat.ts` (new, pure): German texts; `BOOKING_CREATED` → "Betrag bei Anlage des Tickets: CHF x"; private `created/moved/period_updated/edited/confirmed/declined` mapped (lesson counts, people, discount, later-assignment count, from→to slot, teacher assigned/changed/removed, edit old→new amount from that event). Missing value → "nicht protokolliert", stored 0 → CHF 0.00. Unknown event → "Ereignis (TYPE)" / "Systemereignis" without payload. Same-time tie: ticket creation sorts before its lesson event.
- `src/hooks/useTicketHistory.ts` uses it; `TicketTimeline.tsx` badge tooltip shows raw event type + event id for traceability. Query/RLS unchanged.
- Pending `drizzle/migrations/0018_b11_created_total_event.sql`: `pa_emit_change` adds `ticket_total_after_create` (ticket total at that point in the same successful transaction) only for `change='created'`. Same signature/ACL/notification row. Covers installed `pa_create_booking` and the pending pricing/guest-level variants that call it, without replacing them. This is the booking amount after lesson pricing, **not** payment settlement or invoice issue. Rollback: `b11_created_total_event_rollback.sql`.

## Checks run
- `tests/b11CreatedTotal.integration.mjs` (throwaway local PostgreSQL, production baseline + `pa_assign_later.sql` + B11): 5/5 — BOOKING_CREATED keeps 0 while the created event stores the positive final total; replay adds no event; a rejected create leaves no history row; a move adds no total key and keeps the stored created amount; the rollback restores the body, existing events are kept and the ACL is unchanged.
- `tests/ticketHistoryFormat.test.ts`: 6/6 (initial 0 → final positive, true 0, missing/null, old history, later edit amounts, move/assignment/confirm labels, unknown fallback, tie ordering).
- `tests/ticketHistoryBrowser.py`: real `TicketTimeline` with intercepted reads, desktop 1280 and mobile 390; no writes; ordering and labels asserted. Preview build OK.
- Not run: a create through the Edge Function on a hosted backend, `pa_edit_booking` (pending) end to end (formatter tested from its payload shape), `period_updated` with real data.

## Release sequence (needs authorization)
1. Frontend can be published alone (old events read correctly). 2. Optionally install `b11_created_total_event.sql` so new private bookings record the amount after lesson pricing. No backfill.

## Rollback
Frontend: revert the three files. Server: run the rollback SQL. History rows (including any `ticket_total_after_create`) are never deleted or changed.

## HB079–080 retest handoff
- HB079: open an existing private booking (e.g. one of the 16 created tickets) → "Buchung erstellt · Betrag bei Anlage des Tickets: CHF 0.00" plus "Privatlektionen angelegt · … · Buchungsbetrag zu diesem Zeitpunkt nicht protokolliert"; no raw event name.
- HB080: after installing the SQL, create a new private booking → the lesson event shows "Buchungsbetrag nach Anlage der Lektionen: CHF <booking total>"; move a lesson → "Privatlektion verschoben · dd.mm.yyyy … → … · Lehrperson …".
