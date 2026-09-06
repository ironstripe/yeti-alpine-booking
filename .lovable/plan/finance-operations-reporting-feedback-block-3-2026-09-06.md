# Finance Operations & Reporting (Feedback Block 3)

Three phases: clean payment/hotel handling, a real worklist for unpaid courses, and trustworthy reports.

## Confirmed current state

- The payment step offers only Bar / Karte / TWINT / Rechnung plus a checkbox "Bereits bezahlt"; booking creation writes `paid_amount = full total` purely from that checkbox, without creating a payment record.
- There is no hotel/billing-partner master data and no `billing_partner_id` on bookings.
- Products carry no reporting metadata (only name, type, ages, price) — so a Swiss-Snowsports split would today rely on name guessing.
- Reports use invented trend numbers (`Math.random()`, fixed 18/12/15/20), count booking lines instead of distinct bookings, and derive instructor hours from participant lines.
- The dashboard "Zahlungen ausstehend" card runs its own query limited to 10 rows, so its count can differ from any full list.

## Phase 1 — Payments and hotel billing

**Settlement choice.** Replace the checkbox with two clear options: "Jetzt bezahlt" and "Offener Betrag / später bezahlen". "Jetzt bezahlt" requires an immediate method (Bar, Karte, TWINT, Gutschein) and creates a real payment or credit-usage record; `paid_amount` is set from those records only. Rechnung and Hotel default to the open-amount option. Partial payments stay in the existing payment dialog.

**Hotel billing.** New master-data list under Einstellungen → Finanzen → Hotels (name, billing e-mail, address, active flag). "Hotel" becomes a payment method: a required search field picks an active hotel, the customer stays the booking owner, the amount stays open, and the hotel is shown in the summary and in the booking detail. No automatic customer invoice for hotel bookings; when the hotel pays later, staff register it through the normal payment dialog. Hotels in use cannot be deleted, only deactivated.

**Compatibility.** The migration touches no existing amounts or payment rows. "Hotel" is added to every payment-method label, filter and the daily reconciliation mapping. Changes to method, hotel and payment state are written to the existing booking history with user and timestamp.

## Phase 2 — "Unbezahlte Kurse" worklist

New page under Finanzen/Berichte, one row per booking with an open balance, excluding cancelled/storno/expired/rejected bookings. Columns: booking number, customer, created, course dates, course, total, paid, outstanding, due date with overdue badge, payment method, hotel, available customer credit — with deep links to booking and customer.

Filters: creation date range, course date range, private/group, payment method, hotel, only overdue, only customers with credit, and text search. Sorting on course date, creation date, due date, customer, outstanding. Row actions: open booking, register payment, apply credit, open customer.

The dashboard card and this page share one query helper, so the counts always match; clicking the dashboard card opens the list with the default filter. CSV and a print view export exactly what is filtered, with per-hotel subtotals and grand total when filtered by hotel.

## Phase 3 — Reports

**Clean the numbers.** Remove all invented trends (show nothing when there is no comparable period). Bookings = distinct bookings, participants = distinct participants excluding cancelled lines, teaching hours = unique instructor sessions (same instructor, date and time counted once), never multiplied by participants. Revenue is split into two clearly labelled figures: sold (by course date) and collected (by payment date).

**Swiss Snowsports report.** Add reporting metadata to products (discipline: Ski/Snowboard/Andere; audience: Kinder/Erwachsene/Gemischt; category: Privat/Gruppe/Andere), editable in product settings and copied when a season is duplicated. The report shows sold hours and sold revenue for the ten required categories over a season or custom course-date range, counts shared lessons once, excludes cancelled data, lists products without metadata in an "Nicht klassifiziert" warning row, and exports to CSV/print with the applied filters and generation time.

**Payroll.** The existing instructor report keeps its place but computes hours from unique sessions (private lessons plus group instances), preferring recorded actual duration over the planned times, never multiplied by participants, and shows private hours, group hours, total, hourly rate and gross amount. Exports match the table exactly.

## Technical notes

- Migration: `billing_partners` table (with grants, RLS for admin/office write and authenticated read); nullable `tickets.billing_partner_id` with restrict-on-delete FK; product columns `discipline`, `audience`, `reporting_category`; audit triggers/entries reuse the existing ticket-history mechanism.
- Formulas: `outstanding = total_amount - effective_paid`, where `effective_paid` comes from completed payment records plus applied credit usage (never double-counted); `sold_revenue = sum(active ticket_items.line_total)` by course date; `collected_revenue = sum(payments.amount)` by payment date; `teaching_hours = sum over distinct (instructor, date, start, end, session)`.
- Shared helper `src/lib/finance.ts` + `useOutstandingTickets` hook used by both the dashboard card and the worklist.
- Touched: `PaymentMethodSelection.tsx`, `useCreateBooking.ts`, `PaymentModal.tsx`/`useRecordPayment.ts`, `useTickets.ts`, `BookingDetail.tsx`, `useReconciliation.ts`, `useReportsData.ts`, `PayrollTable.tsx`, `SettingsProducts.tsx`, new `SettingsHotels.tsx`, new `FinanceUnpaid.tsx`, new Swiss Snowsports report page and routes.

## Out of scope

Exchange rates, customer merge, role changes, accounting integrations, aggregate hotel invoices, website payment integration, wizard redesign beyond the payment section.

## Validation

The nine listed scenarios are checked after implementation (cash paid now, invoice open, hotel open then settled, partial payment, credit filter, one private lesson with three participants counting as one session, shared lesson counted once, cancelled booking excluded, unclassified product listed).
