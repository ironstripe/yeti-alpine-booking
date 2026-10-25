# B01–B11 + B07 coordinated release — backend installed (2026-10-25)

State: hosted backend installed and the 12 reviewed Edge Functions deployed (2026-10-25). Core NOT published; no mail or hosted test bookings. The original preparation evidence below is historical; the execution report is authoritative.
Both client switches are ON in code (`PRODUCT_PRIVATE_TARIFFS_LIVE`, `OFFICE_MULTI_ITEM_LIVE`). The backend prerequisites are now live; old loaded clients still fail closed (`client_outdated`). Refresh the preview before retesting; publish Core immediately as the separate owner action. There is no legacy price fallback.

## Backend target
One Lovable Cloud backend serves preview and published app. Live `drizzle.__drizzle_migrations`
(read-only, 2026-10-25): 19 rows, newest `created_at` 1792341631903 (= 0015). The journal is appended,
never replaced: 0016–0028 have `when` 1792946655310 + n·1000 (strictly greater), snapshots chained from
0015's id. `drizzle-kit check`: "Everything's fine".

## Tracked migrations (promoted from supabase/pending, pending copies removed)
| # | file | sha256 (12) |
|---|---|---|
| 0016 | b04_delivery_compatibility (BEGIN/COMMIT removed; migrator wraps) | 0a2768c1b3aa |
| 0017 | b06_invoice_delivery (BEGIN/COMMIT removed) | 33e3aabd457d |
| 0018 | b11_created_total_event | fdff19d61ff3 |
| 0019 | participant_birth_date_guard | ff59ecb202e1 |
| 0020 | group_lunch_full_day | 4eb393b97e74 |
| 0021 | group_lunch_season | a83d896c8e06 |
| 0022 | pa_edit_booking | bd7624ef52a7 |
| 0023 | b05_office_confirmation_intent | 78078da3eb65 |
| 0024 | product_private_tariff_rules | 8727daea7212 |
| 0025 | pa_tariff_l1 | 7e5c6be95af0 |
| 0026 | b07a_office_multi_create | 49c996eaabfa |
| 0027 | b07_private_activation_guard | 8ab00d691174 |
| 0028 | b07_private_2627_activation (data, plain SQL) | 22833c12f787 |

0028 has no psql commands. It names only `3646f155-…` (Ski) and `0e8e8669-…` (Snowboard), season `f185b448-…`.
It fails and rolls back unless: both exist, are private, in that season, and have no tariff revision yet.
It inserts the discount rule (10 %, 240 min) only if absent and saves 9 rules per product (revision 1).
It activates the two products through the guard, and it checks afterwards that all other private
products (the old five, including Schulatrif 60) and all `bc_product_tariff_sources` rows have identical
digests. The generic seed template `supabase/pending/product_private_tariff_rules_seed.PROPOSED.sql` is not part of the release.

Apply route: one `lov_database--migration` call applies every pending journal entry in order (0016→0028)
before its own file. Note: that tool's policy treats seeding as data work. 0028 is a reviewed, assertion-guarded
data step that Ivo explicitly asked to keep in the tracked chain. If the tool refuses it, run the identical
0028 SQL as one transaction through the database query tool, then mark the outcome.

## Edge functions (closure from actual imports, `/tmp/edge_deps.json` method: transitive `./`/`../` imports from each index.ts)
Deploy these 12. Each one has its own code changed, or imports a changed shared module:
1. `get-products` — before 0028 (public exclusion of tariff-priced private products; it is safe before 0024).
2. `issue-invoice` (invoice-service), `confirm-booking` (bookingDelivery, invoice-service), `course-booking`
   (bookingDelivery, courseDelivery, invoice-service, invoicePdf), `retry-course-booking-delivery`,
   `retry-booking-confirmation` (bookingDelivery), `send-invoice`, `staff-booking-confirmation`
   (bookingReadProjection, officeConfirmationContent) — after 0016/0017/0023.
3. `staff-group-booking` (birthDate) — after 0021.
4. `private-appointments` (birthDate, privateAppointmentsContract; `client_outdated`), `product-private-tariff-rules`
   (privateTariffRulesContract) — after 0024/0025.
5. `office-booking` (officeBookingContract) — after 0026.

Not deployed (verified): `create-booking-from-extraction` (imports only staffAuth), `get-booking-request`,
`intake-booking`, `submit-booking-request` (no shared imports); `product-management` (no changed dependency
since its product-delete deploy); `product-private-tariffs` (obsolete matrix endpoint; its table is not
installed); `get-website-products`, `public-private-tariff-display`, `get-public-instructors`,
`instructor-website-publish`, `product-public-offering` (not part of this release; no Onepager change).

## Execution order
0016–0023 → deploy group 2 + 3 + `get-products` → 0024–0027 → deploy group 4 + 5 → 0028 → publish Core
(switches already ON). Keep the time between 0024 and the publish short: screens loaded before the publish get `client_outdated`
("Ungültige Angaben. Es wurde nichts gespeichert."), with no booking and no legacy price.

## Client bundle (local build of this source into /tmp, not published)
`vite build`: OK, entry `assets/index-Q1C0Sn0k.js`, precache 26 entries / 3273 KiB (under the 4 MiB
ceiling). Hash of all built files: `18471c5f…e235`. The published hash will differ when the commit changes.

## Rollback order (consumer first, newest first)
1. Client: set both switches OFF, publish. 2. Products: `UPDATE products SET is_active=false` for the two IDs
(the tariff rows stay as history). 3. `b07_private_activation_guard_rollback` → `b07a_office_multi_create_rollback`
→ `pa_tariff_l1_rollback` → `product_private_tariff_rules_rollback`, then redeploy the previous `private-appointments`/`office-booking`.
4. `pa_edit_booking_rollback`, `group_lunch_season_rollback` (pending dir), `participant_birth_date_guard_rollback`,
`b11_created_total_event_rollback` (pending dir). 5. 0016/0017/0020/0023 are additive with no rollback file; leave them installed.
Rollback SQL is run manually and is not journaled; record each run in the GitHub issue.

## Verification run in this checkpoint (local; synthetic data; production baseline)
- Replay safety: browser `tests/b07bMultiCartBrowser.py` 110/0, desktop+mobile. Committed-but-lost create, then
  replays answered 401/403/404/503/network: each resends the exact original and stays blocked. Then removing the first item (single path), remounting
  and pressing submit creates nothing. A successful replay then gives one ticket. Unit `tests/releaseSafety.test.ts`.
- Combined chain from tracked files incl. exact 0028: activation 12/12, B07a 19/19, L1 rollback 4/4,
  cross-booking 12, discount 13, L1 17, edit 17, B11 5, DOB 5, B05 intent 7, group 39, finalize 14, tariff rules 13,
  projection 12. Delivery with fake transport, combined: B04 19/19, B05 24/24, B06 10/10 (PDF).
- Wizard steps 36/0, pricing summary 34/0, unit 406 pass (the one bun "fail" is the Deno-only b05Content, 3/3 under deno), app type check,
  function checks, drizzle-kit check.
- B04/B05 Deno delivery suites were run with `--no-check`: a newly fetched supabase-js 2.118 type definition
  rejects test-fixture typing (TS2322/TS2589 in the test files only). The function checks are clean.

## Not tested
At preparation: hosted backend and deployed functions were not tested. Now: read-only hosted checks and unauthenticated checks passed as recorded below. Still untested: authenticated business flows, the real publish, and a group+private cart through the real step-1 screen (needs real 26/27 course plans).

## Executed release — 2026-10-25T18:38:43Z UTC

- Reviewed source SHA: `9880fdafdf8af93b5b01a1cadd8ba0de80d71eb8`.
- Post-migration source SHA before this report: `4c9cb7ade44500ebbb6cc58670ed7d5bc56de3d1`. Only tool-generated 0029 verification SQL/snapshot/journal and regenerated client schema types differ from the reviewed source; no application/Edge implementation changed.
- Actual order: deployed `get-products` safeguard FIRST; supported migration tool applied ALL pending 0016–0028 in journal order, including exact guarded 0028; immediately deployed the remaining 11 reviewed functions. No policy/approval refusal occurred, no alternate SQL route or manual ledger writes used.
- Migration tool adds `0029_b01_b11_release_install_verification.sql`: read-only DO assertion of the installed guard and the two active revision-1 products, no data writes or persistent objects. This is the route's trailing verification step, not a fourteenth business change.
- Hosted migration ledger: **33 rows = 19 untouched prior rows + 13 reviewed steps + tool-applied verification**. Prior IDs/hashes/timestamps 1–19 identical to preflight; release IDs 20–32 SHA-256 match all 13 local files, verified 13/13. 0029 is id 33, hash `05cdf1597a764ff2f6f21544e21f1b63a027d84e7e0134149362b20ca168510b`, created_at `1792953262994`. No fabricated or replaced ledger.
- Active products: Ski `3646f155-8a66-53e3-b512-749f3a42c1ae` and Snowboard `0e8e8669-d8f4-5b19-8e6d-36ff588fdee1`: both active, tariff revision **1**, **9 rules each**. Discount: percent **10.00**, threshold **240**, revision **1**.
- Lovable Cloud identity reverified: tools and client target the same managed Live instance; database/auth reachable. No external backend.
- All 12 unauthenticated POSTs with empty body return **401**; all 12 OPTIONS return **200**. No booking/invoice/payment/delivery/resend action or authenticated business request made. Runtime execution IDs from OPTIONS join to function logs to verify each deployed version below; a submitted source hash is not represented as an independent hash of the running bundle.
- No Core publish, no Onepager changes, no old matrix table/endpoint deployed. `product-management` and unchanged consumers were not deployed by this release. No broad local suites rerun.
- Preview build after schema-type regeneration: **build OK**, log `2026-10-25T18:34:32Z`.
- **Backend ready for refreshed-preview retest and owner Core publication.** Authenticated business-flow acceptance remains to be performed by the retest; no claim that this release created a test booking.

### Deployed functions: live runtime version and submitted source hash

Function ID + version below identifies the deployment; runtime logs also carry the matching project-prefixed deployment ID. All rows: deployed, unauthenticated POST 401, OPTIONS 200. Version verified by matching OPTIONS execution ID to runtime log (18:37:15–18:37:16 UTC).

| Function | Function ID | Version | Submitted source SHA-256 |
|---|---|---|---|
| get-products | `82517656-c9b1-46a8-9dfe-5e0b5bfa6a05` | 248 | `f19ee78799e064e49a4fe6a92e95966c75e334bad5056a2b46e409156853ed54` |
| issue-invoice | `fb284bb3-9c31-4d9a-b94d-cc73df13087b` | 230 | `4b97ee45ef080d6109f9cb7c35a56da041c6a5f7bc25161bbe709e562d94deb0` |
| confirm-booking | `e3a1e92a-16e1-439d-bcac-2c7170e7dd71` | 252 | `beffe4a907fab75a019971c48fc50244c833ffa4619774af2781549aba7f2b0a` |
| course-booking | `9f2efdb0-d67c-4710-ae39-986442ef3c43` | 103 | `e6d250889cada2409d6c931bd26dc4f22dfe9cd693323ac91cc506db4d982ac5` |
| retry-course-booking-delivery | `ed1eb2c8-067d-429c-a463-b5f62a5149d7` | 100 | `b81132aba98d17472d462a5e5590022499b2a952f7f836756f9d6c20e36eae1f` |
| retry-booking-confirmation | `10617875-bcab-4ee3-9800-cd42067ea832` | 160 | `ae06a6a66aede53830ed06b51b987e63b4a649096658cf699993dcbb5ed10997` |
| send-invoice | `ce15d0e3-abd1-46e5-8c13-20d73dde003b` | 22 | `b65d46ec425e8deaef0278eb2eeeb61e8b18fbee43648ffee5fb49c447086f50` |
| staff-booking-confirmation | `c5f952e4-3ad6-4526-9708-0287c2eb46a4` | 28 | `53479787ff372bf2fc9fb30e973911064f0bc25e974d5bd8e8834aa89cf63d2b` |
| staff-group-booking | `566fb17b-b328-4f7b-9f6f-57cc0ba92244` | 92 | `64efbf8c3b2e6a08be1b0c896d21f141c36b71fc2b8221da2aeebcf0e33e36bc` |
| private-appointments | `8d49a524-dd1c-4992-a1d4-37ccc45b0d3b` | 180 | `43fb4657777ef1e93bd2cb11f838abb2bf7d88584059e74d54d1bcceaf83797d` |
| product-private-tariff-rules | `fd4c48db-92a8-4db0-a6b5-958b318b025c` | 20 | `17126a5a80a081563755a3eca2f5c5ee5c4485ebb791406e60e51f9b8d744a42` |
| office-booking | `966f0016-80e3-49ad-bd42-ed6cf0116e66` | 8 | `8fb0ec39c657c22ae7a90dbd2e2404e956b6ffbf2b2924078532ebcbfe6b37c3` |

### Stored data preservation (preflight vs post-install)

Full-row JSON MD5 aggregates ordered by row text; each count/hash is identical before/after.

| Dataset | Rows | Unchanged digest |
|---|---|---|
| tickets | 1400 | `f58a97afb00754d7f1c705e50942f7ee` |
| ticket_items | 1908 | `7f8396c889cf30d404a1fdae9994b0a4` |
| invoices | 12 | `3e9f7186c596f4f5aa0ab0ef46cdbb1c` |
| payments | 7 | `67034c83ace203b64853c26b41ae38b0` |
| ticket_history | 149 | `edf4169b46fd55c0d4c332f6ab794225` |
| private_appointments | 250 | `f295c96722776c18af949a72bc75b0f2` |
| private_appointment_participants | 313 | `af7a55eccec8ac5a8a6ad902552e07b3` |
| BC tariff sources | 107 | `b8fcf7b65962b10c6b1c13823f88ae1e` |
| old five private products | 5 | `b10f6c8d24185aa313bd31a17b695f09` |
| public offerings | 8 | `6085bf6123688c1d7fa46a388795f906` |
| public tariff display | 2 | `29def2c0007bc8ec7111b1e011ff683f` |

`booking_requests` is empty (no aggregate row). Protected tickets `T-2026-998117`/`T-2026-998118` are still confirmed, CHF 75 each; `R-2026-00012` still exists and all invoice rows are byte-equivalent under the above JSON aggregate. No historical repricing.

### Installed object signatures

Read directly from pg_proc after installation; MD5 is of pg_get_functiondef, not the migration file.

| Function | Identity arguments | Definition MD5 |
|---|---|---|
| `b05_office_create` | `p jsonb, p_actor uuid, p_kind text` | `255c8544fd197391b6a100bd21a2909a` |
| `b07a_office_multi` | `p jsonb, p_actor uuid, p_mode text` | `9dd1e370f2093646259f6b59d0a0336f` |
| `bc_2627_staff_group_book` | `p jsonb, p_actor uuid` | `0f2c96a0aec61edf88866cbb202738eb` |
| `pa_apply_slot` | `p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid` | `9880f75f89ab486f500ba66cbe1e2665` |
| `pa_business_today` | `` | `df52d7feea615532fee8ad99330abc72` |
| `pa_confirm_appointment` | `p_appointment uuid, p_instructor uuid, p_action text, p_reason text, p_actor uuid` | `e426b8808784a05c04d3421afba7023d` |
| `pa_create_booking` | `p jsonb, p_actor uuid` | `fec4df6f65e5a64756bc13aebabb1c75` |
| `pa_create_booking_finalized` | `p jsonb, p_actor uuid` | `17ccd87b2b679a596a2701874e5c90a1` |
| `pa_create_quote` | `p jsonb` | `244ada09f7d271db18538c1bbf423aed` |
| `pa_discount_intent` | `p jsonb, p_require_reason boolean` | `573455b8950f14bdf0922a52ce72d71e` |
| `pa_edit_booking` | `p jsonb, p_actor uuid` | `19c5063e2c28d820d36e1b443d0ebb51` |
| `pa_emit_change` | `p_ticket uuid, p_ids uuid[], p_change text, p_actor uuid, p_details jsonb` | `420f328f1d97097cef9df10fb7cb32ed` |
| `pa_is_protected` | `p_appointment_id uuid` | `7fd6e991813212b10a915932efe0bd2d` |
| `pa_l1_line_net` | `p_appt uuid` | `b7394dd1b7e98cf8afe8a69649826cd0` |
| `pa_l1_requote` | `p_targets jsonb` | `9fd8b7a88fc523115f71312bfe4b864e` |
| `pa_l1_write_pricing` | `p_item jsonb` | `f59e5ae722451ae82a1584e563f34e3b` |
| `pa_lock_days` | `p_participants uuid[], p_dates date[]` | `12d3f9c749b14ff4a92c85c967bd46e8` |
| `pa_lock_slots` | `p_targets jsonb` | `e802f17796bf30a6c43d5359b82eaae5` |
| `pa_move_appointment` | `p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid, p_actor uuid` | `e4d9d3c049015026847c1ca9617bb09f` |
| `pa_move_appointment` | `p_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_instr uuid, p_actor uuid, p_ack jsonb` | `16ef64023823715ea184269154cff459` |
| `pa_period_update` | `p_group uuid, p_changes jsonb, p_actor uuid` | `6a145a7ed01ac6c262799a4733895610` |
| `pa_period_update` | `p_group uuid, p_changes jsonb, p_actor uuid, p_ack jsonb` | `06fed6f91101efd4c0e05a5fba02430e` |
| `pa_price` | `p_date date, p_start time without time zone, p_end time without time zone, p_persons integer` | `bc7a78ea3c4ca127a911435aa806e404` |
| `pa_price_request` | `p_product uuid, p_slots jsonb, p_intent jsonb, p_office boolean` | `ab288f08d9a226159e1554da3bcb2af2` |
| `pa_price_request` | `p_product uuid, p_slots jsonb, p_intent jsonb, p_office boolean, p_context jsonb` | `f82b3204e7ae05e5da8e3c53f40bf4a1` |
| `pa_private_day_context` | `p_participants uuid[], p_dates date[]` | `fb38671db9bd35d657318b2ccea8f47a` |
| `pa_private_day_context` | `p_participants uuid[], p_dates date[], p_exclude uuid[]` | `8b43796f0eda919e2a9ab23ef8580a1d` |
| `pa_product_quote` | `p_product uuid, p_date date, p_start time without time zone, p_end time without time zone, p_persons integer, p_office boolean` | `445dd66b6284ff163fc02a73e66032b7` |
| `pa_recalc_ticket_total` | `p_ticket uuid` | `e89db64af3d5a4f18977f8fb3b14b3d7` |
| `pa_reconcile_report` | `` | `85c35a6a4469cdc299d4c744656022fb` |
| `pa_same_day_discount` | `p_slots jsonb, p_percent numeric, p_threshold integer` | `4605160edb15931c39879c8dcd325cf6` |
| `pa_slot_conflicts` | `p_instructor uuid, p_date date, p_start time without time zone, p_end time without time zone, p_exclude_appointment uuid` | `3c605f6e11963ecf911bc420a0ff43d8` |
| `pa_slot_is_free` | `p_instructor uuid, p_date date, p_start time without time zone, p_end time without time zone, p_exclude_appointment uuid` | `2f1431811c3280966104828494e7d6e6` |
| `pa_tariff_transition_guard` | `` | `a7a9e6ecb1ad4a5c9bb7ef1717e3c3ea` |
| `pa_ticket_item_guard` | `` | `a3a21735f82934449df6f9d3ca882e6d` |
| `participant_birth_date_guard` | `` | `1342bbdffa64f29db1b2b2068f816d9a` |
| `private_tariff_activation_ok` | `p_product uuid` | `4fcf8ec51fedb441965d78ac1486e025` |
