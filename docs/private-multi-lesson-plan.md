# Private multi-lesson / per-lesson participants — implementation plan

Status: specification only. Nothing implemented, applied, deployed or published.
Request: umsg_01m44c63tyfcdt43w5pf5yvw4f (Ivo, 2026-10-04). Continue this plan; no parallel build.

## Current server limits (inspected)
- `pa_create_booking` puts the same participants on every appointment and prices each with one person count.
- Each save creates a new booking; no "add to existing booking".
- Blocks acceptance cases C, D, E.

## Proposed minimal server change (prepared locally, never applied without approval)
1. Optional per-appointment participant list; absent = current behaviour.
2. Each appointment priced by existing `pa_price` with its own person count; billing line shows that count.
3. Idempotent "add to booking" for unpaid bookings without invoice (same payer, one invoice).
4. Server-side overlap checks per teacher and per participant (request + existing bookings).
5. Rollback script per change; tested in a disposable database only.

## Pricing rule: automatic same-day discount (authoritative, Ivo 2026-10-04)
- Exactly 10 % when ONE participant attends 4 or more lesson hours on the SAME calendar day. No tiers.
- Count that participant's actual attendance across all their blocks that day (any block shape;
  two double blocks are not required). Gaps between blocks are not counted.
- Never pool hours across participants or across days.
- A participant with less than 4 h that day never inherits another participant's eligibility.
- Base time-slot rates, extra-person supplements and the separate manual discount stay unchanged.
- Must be identical in preview, saved booking lines and invoice (one server source of truth;
  preview shows the server result or an honest "not yet calculated" state).
- Replaces the legacy client rule "2x2h Tagesrabatt" (`check2x2hDiscount`, which needs two 120-min blocks).

### Regression examples (expected eligibility)
| Case | Attendance on one day | Eligible |
|---|---|---|
| 1 | P1: 10–12 + 13–15 (4 h) | P1 yes |
| 2 | P1: 09–11, 12–13, 14–15 (4 h, three blocks) | P1 yes |
| 3 | P1 2 h + P2 2 h, same lesson | nobody |
| 4 | P1 4 h, P2 joins only 10–12 (2 h) | P1 yes, P2 no |
| 5 | P1 2 h on Mon + 2 h on Tue | no |
| 6 | P1 3 h | no |
| 7 | P1 5 h | yes, still 10 % |

## Discount ownership (authoritative, Ivo 2026-10-04)
- Individually agreed / manual discounts belong to the INVOICE MODULE. Reuse it as is.
- The booking wizard gets NO new manual-discount control or workflow, and no new request-level
  discount implementation. The booking pricing work covers only the automatic same-day 10 %.
- Automatic and individually agreed discounts must stay distinguishable (separate fields/labels),
  never merged into one figure.
- Existing invoice mechanism (inspected in source, not runtime-tested): `invoices.subtotal`,
  `invoices.discount` (one absolute amount, default 0) and `invoices.total`, all passed in by the
  caller of `issueInvoice` (`_shared/invoice-service.ts`); the document prints Zwischensumme,
  "Rabatt" and Total (`_shared/invoiceDocument.ts`, `InvoicePrintTemplate.tsx`). It computes no
  percentages and defines no combination rule itself. Preserve this; do not invent stacking.
- Consequence for implementation: the automatic 10 % is carried on the affected booking lines
  (per participant/appointment, server-priced) so line amounts and the invoice subtotal already
  contain it, labelled as the automatic same-day discount; `invoices.discount` stays reserved for
  the individually agreed invoice discount.

## Open decisions (must be answered before building the affected parts)
1. Continue with option (a) server change unapplied + full flow, or (b) current-server subset first.
2. Same-day separate private sets: base pricing stays per lesson; the rule above counts hours
   only for the discount.
3. Shared lesson where only some participants qualify (case 4): which part of the lesson price the
   10 % applies to (base vs. that participant's supplement). Not decided; no allocation rule invented.
4. Existing wizard manual-discount field (`DiscountSection`, server applies it per appointment line)
   overlaps the invoice module's ownership. It will not be extended; whether to keep, hide or retire
   it is Ivo's decision and is not changed in this work.
5. Line-level presentation of the automatic discount on the invoice (separate line vs. note in line
   details): to be confirmed; the amounts are unaffected.

Superseded: "manual request discount on lessons added later" and "stacking auto + manual" are no
longer booking-side questions; manual discounts follow the existing invoice module.
