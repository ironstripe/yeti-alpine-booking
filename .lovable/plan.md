# Preflight: moving the 26/27 lab bookings into YETI (read-only result)

Source: protected package `lab-v4-7a9b66d` (lab f3afda6c, commit 7a9b66d, version 4). Target: this project only. Nothing has been written.

## 1. Counts (source matches expectations)

| Item | Source | What happens in YETI |
|---|---|---|
| Sales / tickets | 51 | 51 new tickets. No ID or ticket-number collisions; 0 existing Booking-Corner tickets |
| Original positions | 142 (Privatkurs, Gruppenunterricht, Samstagkurs) | Kept as evidence in the ledger |
| Billing lines | 444 (227 private + 217 group) | 444 new lines; CHF 50'525.00 total = sum of positions |
| Private lessons / participant links | 227 / 288 | New. 0 overlaps with existing lessons, courses or absences; none in the past (20.12.2026–31.03.2027) |
| Group enrollments | 217 | Attached to existing 26/27 course days (see 3) |
| Customers | 51 | **13 reuse** (exactly one existing customer each, all matched by email, phone agrees) · **38 new** |
| People | 105 active + 57 merged | 105 new people (0 exact matches in YETI). Merged people: all point to the same customer, same name and DOB, no chains, no bookings on them → not imported |
| Missing birth date | 6 | Needs "unknown birth date" support (see 5) |
| Payment | all unknown | Paid amount stays empty. No payment, no invoice |
| Unresolved ticket links | 39 | Kept as ledger evidence only |

Current YETI baseline is confirmed: 1328 tickets, 945 customers, 808 people, 98 teachers, 46 courses, 0 private lessons, 219 enrollments, 10 invoices, 3 payments.

## 2. Teachers
- 20 teacher IDs are used in the lab lessons. Each one resolves through the lab journal (Booking-Corner ID), then through YETI's existing source links, to exactly **one active YETI teacher**. 0 ambiguous, 0 missing.
- The 21 teacher candidates all agree with YETI's source links. No lab teacher profiles, HR data or placeholders are copied.
- The lab flags every candidate `assignment_identity_confirmed=false`. The links themselves are verified by ID, so private lessons get the linked teacher with confirmation **"pending"**.
- All 136 group course days stay **without a teacher**.

## 3. Courses and products (the 33 lab course shells are not copied)
- Each shell maps by type + discipline + level name to the existing inactive "26/27 …" course. 30/30 Saturday dates and 131/136 course days already exist in YETI with the same date and time 10:00–12:00, so no new course days are created.
- **Ambiguity A:** "Schwarzer Prinz/Prinzessin" weekly (1 shell, 5 days, 5 lines) has no course with that name. The only course carrying that level is "26/27 Ski Academy Rookie". Your confirmation is needed.
- Products: each line uses the course's existing **2h** product variant (10–12 = 120 min) from the 26/27 variant table. Lab products are not created.
- **Ambiguity B:** "26/27 Ski Swiss Snow Kids Village" has two 2h variants ("Kinder & Swiss Snow League 2h" and "Windel-Wedelkurs 2h"). Proposal: Kinder 2h. Your confirmation is needed.
- Private lessons use "Privatunterricht Ski / Snowboard" (26/27, inactive) by discipline.
- No product is activated, no price is changed, nothing is shown on the website. Line prices stay at the source amounts.
- **Decision C:** imported courses must be visible to staff while staying inactive. Proposal: a staff-only "show inactive courses that have bookings" option in the course hub and planner. The alternative, switching the courses to active, is not proposed.

## 4. Things that could cause unwanted messages or changes
- Adding private billing lines with a teacher would queue "lesson assigned" teacher notifications (883 are already waiting in that queue, untouched). This is suppressed **inside the import transaction only**, and only for import rows.
- The season trigger uses the creation date, so 26/27 is set explicitly per ticket.
- Status, ticket history and normal audit triggers stay on.
- No invoice, payment, email, webhook or booking confirmation. The only scheduled job (reservation expiry) does not touch confirmed tickets.
- Customer numbers: all 51 lab numbers clash, so new customers get fresh numbers from YETI's own counter.

## 5. Planned changes (applied only after you approve)

**Database (additive, reversible)**
- `customer_participants.birth_date` allows empty values, plus a "birth date unknown" flag (age checks treat unknown as "check manually").
- New protected `bc_transfer_20261003` tables, readable by service role only:
  - `crosswalk`: source key → target ID + action insert/reuse.
  - `ledger`: pre-image of every changed existing row, plus the source amount/currency per line.
  - `runs`: per-sale status.
- One service-role function `bc_import_sale(run, sale_code)`. Each call runs one transaction, is idempotent through the crosswalk, and skips a sale that is already done. Inside it:
  1. Customer: reuse the match, or create a new one. On reuse, only fill empty fields and keep existing values. The pre-image goes to the ledger.
  2. People.
  3. Ticket.
  4. Private lessons, participants and their one billing line each (same rules as the existing private-lesson guard).
  5. Group lines and enrollments on the mapped course days.
  6. Ledger rows.
- Teacher notification is suppressed per transaction (session setting checked by the trigger, not by turning the trigger off globally), so other users' writes keep notifying.
- `bc_rollback_run(run)`: deletes only rows recorded as "insert" in the crosswalk (children first) and restores ledger pre-images for "reuse" rows. It refuses if an imported row was edited later; those are listed instead.

**Screens (small, keep newer YETI features)**
- People lists and search hide merged people. 13 files query people without that filter; the 5 booking/search pickers are fixed.
- Unknown birth date: the person form accepts "unbekannt", lists show "Geburtsdatum unbekannt", and age/level logic does not crash.
- Payment "unbekannt" badge when the paid amount is empty (instead of "offen" or CHF 0).
- Saturday/course roster: the course hub shows imported inactive courses with their dates and enrollments (Decision C).

## 6. How it runs and how it is checked
1. A dry-run call per sale returns the planned actions without writing; the totals must match the table above.
2. Apply sale by sale through a server function (no browser loop). Stop at the first failure; finished sales stay done.
3. Read-back:
   - Counts per table equal the crosswalk.
   - CHF 50'525.00 matches line totals.
   - 0 new payments, invoices or notification-queue entries, and 0 changes to unrelated rows (counts compared before and after).
   - Planner shows one block per private lesson.
   - Spot-check 3 sales in the screens.
4. Rollback is per run and limited to the import.

## Open decisions before apply
- A: Schwarzer Prinz → "26/27 Ski Academy Rookie"?
- B: Kids Village weekly → "Kinder & Swiss Snow League 2h"?
- C: staff-only display of inactive imported courses (no activation)?
- Private-lesson teacher confirmation set to "pending" (not "confirmed")?

Customer data from the source stays in the protected database area only. None of it goes into code, migrations or files.
