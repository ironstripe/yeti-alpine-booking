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

## Open decisions (must be answered before building the affected parts)
1. Continue with option (a) server change unapplied + full flow, or (b) current-server subset first.
2. Same-day separate private sets: priced per lesson (current) — the discount rule above now covers
   hour counting for the discount only; base pricing stays per lesson.
3. Manual request discount on lessons added later to an existing booking: apply or not?
4. Shared lesson where only some participants qualify (case 4): which part of the lesson price the
   10 % applies to (base vs. that participant's supplement). Not decided; no allocation rule invented.
5. Stacking of automatic 10 % with a manual discount (today's legacy client adds percentages; the
   server path applies manual only). Not decided; no stacking rule invented.
