# 26/27 website course-booking API (#36) — contract `bc-2627-website-v1`

Status: implemented and tested locally only. **Not applied, not deployed.**
Source of truth: `supabase/functions/_shared/courseBookingContract.ts`.
Fixtures recorded from real local runs: `supabase/functions/course-booking/fixtures/*.json`.

POST JSON, header `x-api-key`. Every response has `success`. Success adds `status`.
Errors add `code`, `message` (German) and `retryable`. If `retryable` is true, repeat
the **identical** request.

| action | success `status` | notes |
|---|---|---|
| `options` | `ok` | `options[].blocks` are exact block IDs (`10:00-12:00`, `14:00-16:00`). `block_mode` is `all` for 4h (both blocks every day) and `choose_one` for 2h. Also returns `dates`, `block_dates`, `tiers[] {day_count, price, source_tariff_id}`, and `planning_threshold` (internal only, never a sales cap). |
| `reserve` | `held` (201) / replay (200) | Takes `reservation.idempotency_key`. Group selections send `blocks: string[]`. Response has `total_amount` (positive number), `currency` `CHF`, `reservation_expires_at`, `ticket_id` and `reservation_token`. |
| `complete` | `confirmed` | Repeat it with the identical body after an unknown outcome: you get the same booking and invoice (`already_confirmed: true`), never a second invoice or e-mail. `delivery: {invoice, booking_confirmation}` reports `sent`, `sending` or `failed`. A failed delivery is retried by office staff and does not affect the booking. |
| `cancel` | `released` | Only works before invoicing and is all-or-nothing. A repeat returns `already_released: true`. |

Error codes: `expired` (410), `not_found` (404), `slot_unavailable`, `idempotency_conflict`,
`finalize_conflict`, `invalid_status`, `customer_ambiguous`, `reservation_released` (409).
`invoice_issue_failed` and `internal` (503/500) have `retryable: true`. Validation codes return 400.
`payment_method` other than `invoice` returns 503 `payment_provider_unavailable`.

Client rules:
- Keep `ticket_id`, `reservation_token` and the idempotency key across reloads.
- After a cancelled or expired hold, start over with a NEW idempotency key (`reservation_released`).

Staff: the `retry-course-booking-delivery` function (office/admin only, `requireRole`) takes
`{action:"retry", delivery_id, force?}` or `{action:"recover_stuck"}`.

Tests: `bun run test:bc2627:sql` and `bun run test:bc2627:api`. The API test needs `postgrest` on PATH and a local PostgreSQL.
