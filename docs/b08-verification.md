# B08 — Geburtsdatum: keine ungültigen/zukünftigen Daten (F08 / HB042–044)

Base: `2c11a36c9896a311e71dd4fe4a71748fc490c528` (after B07-P). Final SHA: assigned by the platform after this turn.
Status: **implemented + tested locally.** SQL guard pending (not installed); Edge Functions not deployed; not published; no independent acceptance.

## Rule
Birth date must be a real calendar date (YYYY-MM-DD) and not after the school date (Europe/Zurich; SQL `pa_business_today()`). Today is valid. No minimum age; course age rules unchanged. NULL stays allowed where it was. Only new values and explicit changes are checked; unchanged historic/imported values never block anything.

## Re-verified before editing
- `pa_create_booking` (0007 and B07-P pending) and `bc_2627_staff_group_book` (0007) check guest DOB presence/cast only; no future check. No trigger on `customer_participants` validates DOB.
- UI: FamilyHub/ParticipantSelection required a date; ParticipantCard/ParticipantEditDialog allow empty; date pickers disable future days using the **browser** date only.

## Changes
- `supabase/functions/_shared/birthDate.ts` (new, dependency-free; re-exported by `src/lib/birthDate.ts`).
- `privateAppointmentsContract.ts`: guest `birth_date` refined (real date, not future) → 400 before RPC.
- `private-appointments/index.ts`, `staff-group-booking/index.ts`: group guests checked before any RPC; DB code `22008` from the guard mapped to `invalid / birth_date` (400) instead of an unknown result.
- `drizzle/migrations/0019_participant_birth_date_guard.sql` (new, NOT installed): BEFORE INSERT / UPDATE OF birth_date trigger; fires only on insert with non-NULL DOB or an actual change. Rollback: `supabase/rollback/participant_birth_date_guard_rollback.sql` (drops only trigger+function).
- UI: `FamilyHub.tsx`, `ParticipantSelection.tsx` (create schemas), `ParticipantCard.tsx`, `ParticipantEditDialog.tsx` (only changed DOB checked), `useParticipants.ts` (server 22008 message), `privateAppointmentsApi.ts` / `staffGroupBookingApi.ts` field messages.
- Not changed: RPC bodies, import/Booking-Corner contracts, website paths (`intake-booking`, `confirm-booking`), pricing, scheduler, delivery. Those writers are covered by the trigger once installed.

## Tests (commands; local throwaway PostgreSQL 17 + synthetic data)
- `bun ./tests/birthDateGuard.integration.mjs` **5/5**: today/past/NULL insert ok; tomorrow/2999 rejected; Feb 30 rejected by type; historic future DOB unchanged edits ok, change to future fails, change to past/NULL ok; private via `pa_create_booking_finalized` and B05 `b05_office_create` with tampered future guest DOB → nothing written (people, tickets, items, payments, comments, enrollments, appointments, confirmation intents); group via `bc_2627_staff_group_book` same; today DOB books; existing participant with historic future DOB still bookable.
- `bun test ./tests/birthDate.test.ts` 5/5 (also run with TZ=Pacific/Kiritimati and Pacific/Pago_Pago): leap/impossible dates, Zurich day boundary vs UTC, unchanged-value rule.
- `deno test --no-check supabase/functions/_shared/birthDate.test.ts privateTariffRulesContract.test.ts` 5/5; `bun run check:functions` OK.
- Regressions: staffFinalize 14/14, b05Intent 7/7, productPrivateTariffRules 13/13, paAssignLater 16/16, staffGroupBooking 33/33; bun customerEmailOptional/staffGroupPlan/wizardRepair/groupBookingPreflight 50/50; preview build OK.
- Browser (preview, signed in as Ivo, browser timezone Pacific/Kiritimati = already 26.10 while Zurich 25.10, all REST writes intercepted/aborted): customer detail "Teilnehmer hinzufügen" with browser-"today" → field error "Das Geburtsdatum darf nicht in der Zukunft liegen." on desktop 1280 and mobile 390; no participant write left the browser.

## Limits
- Wizard guest form and the two edit dialogs are covered by schema/unit logic, not by a browser run.
- Without the installed guard, direct writers outside the office endpoints (website intake/confirm, AI extraction, imports) are not yet server-checked.
- Existing future DOBs in data are neither reported nor repaired (by design).

## Release order (each step needs approval)
1. Deploy `private-appointments` + `staff-group-booking` (validation + 22008 mapping; harmless without the trigger).
2. Publish frontend.
3. Install `participant_birth_date_guard.sql`. Rollback reverse: run the rollback file (data untouched), then previous functions/frontend if needed.

## Retest handoff HB042–044
- HB042: new participant at customer detail and wizard with tomorrow → field error, nothing saved; today → saved.
- HB043: edit existing participant, change DOB to future → error; change other fields with unchanged DOB → saved.
- HB044: private and group office booking with a new person and a future DOB (also via manipulated request) → rejected, no ticket/person created; regression: booking with existing participants unchanged, idempotent replay unchanged.
