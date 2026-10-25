# B01–B11 + B07/L1 install dependency manifest (prepared 2026-10-25, nothing installed)

## Backend target (verified read-only, 2026-10-25)
- Only one backend: Lovable Cloud project `pgrlrsrjwyixndmrzhct`. It serves both preview and published app (the same ID is in `.env` and `supabase/config.toml`). The exec `psql` pooler user is bound to the same project.
- The `psql` and `read_query` tools both see the same database: 1,400 tickets, 16 `pa_*` functions (`pa_apply_slot … pa_ticket_item_guard`), table `public_private_tariff_display` (0013) present, `T-2026-998117`/`T-2026-998118` present (confirmed, 75.00 each, untouched).
- Not present (expected, still pending): `private_appointment_pricing`, `product_private_tariff_rules`, `private_lesson_discount_rule`, `product_private_tariffs`, `pa_edit_booking`, `pa_create_quote`, `b05_office_create`, `office_booking_confirmation_intents`, `participant_birth_date_guard`, B04 delivery columns (`claimed_at`, `invoice_id`). `pa_emit_change` has no B11 total. `bc_2627_staff_group_book` still has the pre-B09 lunch body.
- So a report of "zero `pa_*` functions / missing tariff tables" fits the missing tariff tables (not installed). It does not fit the `pa_*` functions: this backend has 16. That query probably ran against a different connection, or used an unescaped `_` pattern in a different scope. No external Supabase project is connected to this repository.
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
| `bc_2627_staff_group_book` | 0003/0005/0006/0007 (installed) → `group_lunch_full_day` → `group_lunch_season` | B09 (each patch checks the expected installed body and fails closed otherwise) |
| `save_product_public_offering`, `product_offering_validate`, `product_delete`, `quote_bc_2627_product` | installed via 0010–0015 / earlier; `product_offering_duration_independent` still pending | separate, not part of B07 |

`b05_office_create` calls `pa_create_booking_finalized` → `pa_create_booking`. It must go in after `pa_edit_booking` and before or together with B07. Once B07 is installed, B05 creates also need revisions + digest; the B07 client sends them on both paths.

## Install groups (each needs its own approval; no step is run by this document)
1. **Independent of the B07 client:** `b04_delivery_compatibility` → `b06_invoice_delivery` (needs B04); `b11_created_total_event`; `participant_birth_date_guard`; `group_lunch_full_day` → `group_lunch_season`; `pa_edit_booking` (B03a, legacy pricing); `b05_office_confirmation_intent`. These keep today's create contract. Deploy the matching Edge Functions (`send-invoice`, `staff-booking-confirmation`, `private-appointments`, `staff-group-booking`, `course-booking` retry paths) after their SQL.
2. **Coordinated B07 release (server and client together, never just for display):** `product_private_tariff_rules` (+ reviewed `product_private_tariff_rules_seed.PROPOSED` + discount rule row) → `pa_tariff_l1` → deploy `private-appointments` + `product-private-tariff-rules` → set `PRODUCT_PRIVATE_TARIFFS_LIVE=true` and publish. Between the SQL and the publish, canonical private creates from the old client are rejected (`invalid quote_revision`); keep that window short or close Office booking during it.
3. **After 2:** `public_private_tariff_projection` → `public_private_tariff_display_windows.PROPOSED` + Office verification → deploy `get-website-products`.
4. **Still open before group 2:** B07a (atomic multi-item) and B07b (UI) must be finished.

Rollbacks: `supabase/rollback/` has one file per group (`pa_tariff_l1_rollback.sql`, `product_private_tariff_rules_rollback.sql`, `b11_created_total_event_rollback.sql`, `group_lunch_season_rollback.sql`, `public_private_tariff_projection_rollback.sql`, …), always consumer-first.
