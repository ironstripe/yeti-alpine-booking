# B01–B11 + B07/L1/B07a/B07b install dependency manifest (refreshed 2026-10-25 for B07b, nothing installed)

## Backend target (verified read-only, 2026-10-25)
- Only one backend: Lovable Cloud project `pgrlrsrjwyixndmrzhct`. It serves both preview and published app (the same ID is in `.env` and `supabase/config.toml`). The exec `psql` pooler user is bound to the same project.
- The `psql` and `read_query` tools both see the same database: 1,400 tickets, 16 `pa_*` functions (`pa_apply_slot … pa_ticket_item_guard`), table `public_private_tariff_display` (0013) present, `T-2026-998117`/`T-2026-998118` present (confirmed, 75.00 each, untouched).
- Not present (expected, still pending): `private_appointment_pricing`, `product_private_tariff_rules`, `private_lesson_discount_rule`, `product_private_tariffs`, `pa_edit_booking`, `pa_create_quote`, `b05_office_create`, `office_booking_confirmation_intents`, `participant_birth_date_guard`, B04 delivery columns (`claimed_at`, `invoice_id`). `pa_emit_change` has no B11 total. `bc_2627_staff_group_book` still has the pre-B09 lunch body.
- Clarification (Ivo, 2026-10-25): the earlier null result queried only `pa_create_quote`, `pa_private_day_context`, `pa_edit_booking` and multi-booking names, not all `pa_*`; null was correct because those are pending. The inventory confirms the 16 existing `pa_*` functions on the same `pgrlrsrjwyixndmrzhct` backend. No external Supabase project is connected to this repository.
- Deployment route: tracked schema changes go in as Drizzle migrations (`drizzle/migrations`, next free number 0016) applied to this Cloud database; Edge Functions are deployed to the same project. The client switch (`PRODUCT_PRIVATE_TARIFFS_LIVE`) only takes effect after publishing.

## Pending files that replace the same function (install order matters)
| Function | Files that replace it (last one wins) | Required final state |
|---|---|---|
| `pa_create_booking` | 0001 (installed) → 0007 `staff_guest_level` (installed) → `product_private_tariff_rules` | B07 body (requires revisions + digest) only with the B07 client |
| `pa_apply_slot` | 0001 (installed) → `product_private_tariff_rules` → `pa_tariff_l1` | L1 body |
| `pa_tariff_transition_guard` | `product_private_tariff_rules` → `pa_tariff_l1` | L1 body (matches the server pricing row) |
| `pa_edit_booking` | `pa_edit_booking` (B03a) → `pa_tariff_l1` | L1 body; B03a alone is a valid intermediate |
| `pa_move_appointment` / `pa_period_update` | production → `pa_tariff_l1` (old signatures become wrappers + new `p_ack` overloads) | L1 |
| `pa_private_day_context` | `product_private_tariff_rules` (2-arg wrapper + 3-arg with exclude) | — |
| `pa_emit_change` | production → `b11_created_total_event` | B11 |
| `bc_2627_staff_group_book` | 0003/0005/0006/0007 (installed) → `group_lunch_full_day` → `group_lunch_season` → `b07a_office_multi_create` | B09 + B07a ticket marker (each patch checks the expected installed body and fails closed otherwise) |
| `pa_tariff_transition_guard` + participant trigger | `product_private_tariff_rules` → `pa_tariff_l1` (trigger now also `UPDATE OF appointment_id, participant_id`) | L1 |
| `b07a_office_multi` (new) + `b07a_office_submissions` | `b07a_office_multi_create` | needs B04, B05, B09, B11, B08, B03a, B07-P, L1 installed first |
| `save_product_public_offering`, `product_offering_validate`, `product_delete`, `quote_bc_2627_product` | installed via 0010–0015 / earlier; `product_offering_duration_independent` still pending | separate, not part of B07 |

`b05_office_create` calls `pa_create_booking_finalized` → `pa_create_booking`. It must go in after `pa_edit_booking` and before or together with B07. Once B07 is installed, B05 creates also need revisions + digest; the B07 client sends them on both paths.

## Install groups (each needs its own approval; no step is run by this document)
1. **Independent of the B07 client:** `b04_delivery_compatibility` → `b06_invoice_delivery` (needs B04); `b11_created_total_event`; `participant_birth_date_guard`; `group_lunch_full_day` → `group_lunch_season`; `pa_edit_booking` (B03a, legacy pricing); `b05_office_confirmation_intent`. These keep today's create contract. Deploy the matching Edge Functions (`send-invoice`, `staff-booking-confirmation`, `private-appointments`, `staff-group-booking`, `course-booking` retry paths) after their SQL.
2. **Coordinated B07 release (server and client together, never just for display):** see "Deployment manifest (B07 coordinated release)" below.
3. **After 2:** `public_private_tariff_projection` → `public_private_tariff_display_windows.PROPOSED` + Office verification → deploy `get-website-products`. Not part of this release; no Onepager activation.
4. B07b UI is done (docs/b07b-verification.md); nothing else in code blocks group 2.

## Deployment manifest (B07 coordinated release, refreshed 2026-10-25 for B07b)
Nothing below has been run. Order matters; each SQL file is one tracked migration (next number 0016) on the single Lovable Cloud backend.

**Migrations, in this order** (identical to the locally verified 30-file chain):
1. `b04_delivery_compatibility` 2. `b06_invoice_delivery` 3. `b11_created_total_event` 4. `participant_birth_date_guard` 5. `group_lunch_full_day` 6. `group_lunch_season` 7. `pa_edit_booking` 8. `b05_office_confirmation_intent` — these keep today's create contract (group 1, may go first).
9. `product_private_tariff_rules` 10. `pa_tariff_l1` 11. `b07a_office_multi_create` 12. `b07_private_activation_guard` 13. data step `b07_private_2627_activation.PROPOSED` (seeds the discount rule row and the two Winter 26/27 private products only, then activates them; old five Winter 25/26 products untouched — they get `tariff_unavailable` on the new paths, never a made-up rate).

**Edge Functions to deploy (all consumers of changed SQL or shared code):**
- B02 / B04 delivery + invoice consumers: `issue-invoice`, `confirm-booking`, `course-booking`, `retry-course-booking-delivery`, `retry-booking-confirmation` (legacy B04 consumer), `send-invoice` (B06), `staff-booking-confirmation` (B05).
- Booking writers: `private-appointments` (B03a edit, L1, B07-P, `client_outdated` refusal — deploy only after step 9), `office-booking` (B07a, after step 11), `staff-group-booking` (B08/B09).
- Tariff management: `product-private-tariff-rules` (after step 9), `product-private-tariffs`, `product-management` (unchanged contract, redeploy only if its bundle changed).
- Also importing changed shared birth-date/lunch code (redeploy for consistency, no contract change): `create-booking-from-extraction`, `submit-booking-request`, `get-booking-request`, `intake-booking`. Not deployed in this release: `get-website-products`, `public-private-tariff-display` (group 3).

**Client:** set `PRODUCT_PRIVATE_TARIFFS_LIVE = true` and `OFFICE_MULTI_ITEM_LIVE = true` and publish in the same window as steps 9–13 + `private-appointments`/`office-booking` deploy.

**Old clients (explicit decision):** a screen loaded before the publish omits the quote revisions. After steps 9 + `private-appointments` deploy it is refused with `invalid client_outdated` (old screens read "Ungültige Angaben. Es wurde nichts gespeichert."); no booking, no legacy CHF 170-style price. Office must reload. Keep the window between step 9 and the publish short or pause Office private bookings during it. `office-booking` is never called by old clients.

**Verify after release:** one synthetic private and one mixed cart on a test customer in Office, with mail OFF; check ticket total = summary total, history amount, no e-mail queued.

## Verified combined install (local only)
`tests/b07aMultiCreate.integration.mjs` installs, in one database and this order, without error: baseline prelude, production baseline, `drizzle/migrations` 0000–0015, `b04_delivery_compatibility`, `b06_invoice_delivery`, `b11_created_total_event`, `participant_birth_date_guard`, `group_lunch_full_day`, `group_lunch_season`, `pa_edit_booking`, `b05_office_confirmation_intent`, `product_private_tariff_rules`, `pa_tariff_l1`, `b07a_office_multi_create` (29 files). Commands and results: docs/b07a-verification.md. Rollbacks rehearsed locally by `tests/paTariffL1Rollback.integration.mjs` (B07a first, then L1).

## Product mapping prerequisite (no blanket seed)
Read-only check 2026-10-25: the five active private products are all Winter 25/26: `Private Lektion Ski 2h` (0), `Private Lektion Snowboard 2h` (0), `Privatstunde 75`, `Privatstunde 85`, `Schulatrif` (60). The Malbun standard tariff must NOT be seeded over all of them. Verified eligible (Ivo, 2026-10-25): `3646f155-…` Ski and `0e8e8669-…` Snowboard, season `f185b448-…`, currently inactive; `b07_private_2627_activation.PROPOSED.sql` seeds/activates only those two (tested locally). School rate and legacy products stay a separate decision. Products without a tariff revision return `tariff_unavailable` in the B07 paths (no fabricated rate); the settled standard tariff values are not reopened.

Rollbacks: `supabase/rollback/` has one file per group (`pa_tariff_l1_rollback.sql`, `product_private_tariff_rules_rollback.sql`, `b11_created_total_event_rollback.sql`, `group_lunch_season_rollback.sql`, `public_private_tariff_projection_rollback.sql`, …), always consumer-first.
