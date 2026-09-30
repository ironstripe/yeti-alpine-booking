# P0 plan: instructor role linking and booking_requests lock-down

Target: review branch `release/p0-security-lane` (PR #1, head `abc7018`). Not `main`. Nothing is published or merged.

## What was checked (this workspace, live database)
- Commit `abc7018` is not in this checkout. Here, `link-instructor-to-user` already calls `requireRole(req, ["admin","office"])`. The branch version, where the call is missing, must be checked out before building. The fix below covers both versions.
- The only caller is `src/hooks/useCreateInstructor.ts` `onSuccess`. It sends `{email, roles}` taken straight from the browser, and ignores failures.
- The function trusts the email and roles sent by the browser. With the office gate, an office user can still create an instructor with `roles:["office"]` for any existing login and give it `office` (office creates office). The same works for any email, not only the new instructor. `listUsers()` also reads only the first page of logins (50).
- Live `booking_requests` rules: INSERT `true` (public), SELECT `true` (public), UPDATE `auth.role()='authenticated'` (public). Table is in the `supabase_realtime` publication. The table access grants did not show up in the check, so step (a) reads them again.
- Browser use of `booking_requests`: no direct reads or writes left in `src`. `useBookingRequest` and `RequestConfirmation` go through `submit-booking-request` / `get-booking-request`, both of which use the server key. The only direct use left is the realtime INSERT subscription in `useDashboardStats.ts`.

## 1. link-instructor-to-user: least-privilege authorization
Decision: **teacher linking = office or admin; granting `office` (or anything above teacher) = admin only.** It is never inferred from what the browser sends.

Behavior, in order, with an early return at each step:
1. OPTIONS → 204 with CORS.
2. `requireRole(req, ["admin","office"])` must be called before the body is read. No or invalid token → 401 `{error:"Unauthorized"}`. Caller with no role, or teacher only → 403 `{error:"Forbidden"}`.
3. Body is `{instructorId: uuid}` only, validated with zod. Any other shape → 400 `{error:"invalid"}`. `email` and `roles` from the browser are ignored.
4. The server loads the instructor by id with the server key. If missing → 404 `{error:"not_found"}`. Email and roles come from that record.
5. The login is looked up by exact email, paging through all logins (no first-page-only search). No login → 200 `{linked:false}`.
6. Roles to grant: `teacher` if the record has ski or snowboard. `office` only if the record lists office AND the caller is admin. If an office caller would grant office → 403 `{error:"forbidden", reason:"office_role_requires_admin"}` and nothing is written (no partial teacher grant). `admin` is never granted.
7. Upsert with ignore-duplicates. Existing roles are never removed.
8. Errors → 500 `{error:"internal"}`. The raw error message goes to the log only.

Client: `useCreateInstructor` sends `{instructorId: data.id}`. For a 403 with office_role_requires_admin it shows the German message "Büro-Rolle kann nur ein Admin vergeben", and the instructor is still created.

## 2. booking_requests access-control migration
Rule scope: remove all public access and all no-role access. Staff (office/admin) keep reading and editing. Teachers get nothing. The server key is unaffected.

Migration `p02_booking_requests_lockdown`, additive and named only:
- `DROP POLICY` for the three named rules above (exact names).
- `REVOKE ALL ON public.booking_requests FROM anon`. Also revoke INSERT/DELETE from authenticated, and the id sequence from anon if one exists.
- `GRANT SELECT, UPDATE ON public.booking_requests TO authenticated; GRANT ALL ... TO service_role`.
- New rules for authenticated only: `booking_requests_staff_select` USING `is_admin_or_office(auth.uid())`, and `booking_requests_staff_update` USING/WITH CHECK the same. No INSERT or DELETE rule, so all new requests come in through `submit-booking-request`.
- No blanket grants, no default-privilege changes, no other tables.

Realtime: row-change events are filtered by the SELECT rule of the receiving user. After lock-down, office/admin dashboards still get INSERT events. Anonymous and teacher sessions stop receiving them, which is intended. **No realtime change is needed before lock-down**, and the table stays in the publication. Step (d) checks that a staff session still gets events.

Rollback `supabase/rollback/p02_booking_requests_lockdown_rollback.sql`: drops the two staff rules and restores the pre-state **without** public SELECT. That means named INSERT for anon only if a compatible old frontend has to come back. Anonymous PII reads never return. Rolling back code needs a matching rules state: an old bundle that reads directly only works with manual fallback.

## Staging order
```text
(a) additive: prerequisite columns (acknowledgement_sent_at, submission_key unique,
    if not yet on branch) + re-read grants/policies snapshot
(b) deploy link-instructor-to-user, submit/get-booking-request, frontend to staging;
    booking smoke tests with synthetic data, email disabled/sandbox
(c) apply p02_booking_requests_lockdown
(d) repeat full matrix below
```

## Staging test matrix
| # | Caller | Action | Expected |
|---|---|---|---|
| L1 | no token / anon key | link | 401 |
| L2 | no-role user, teacher | link | 403 |
| L3 | office, instructor ski-only | link | 200, teacher |
| L4 | office, instructor lists office | link | 403 office_role_requires_admin, no rows written |
| L5 | admin, instructor lists office | link | 200, teacher+office |
| L6 | office, body with email/roles of another user | link | 400, target unchanged |
| L7 | office, unknown instructorId | link | 404 |
| L8 | any | never grants admin | user_roles has no new admin |
| B1 | anon REST select/insert/update/delete booking_requests | after (c) | 401/403 or empty, 0 rows |
| B2 | no-role and teacher session REST select/update | after (c) | 0 rows / denied |
| B3 | office/admin select + status update | after (c) | works |
| B4 | public form → submit-booking-request | before and after | 200, number + token only |
| B5 | RequestConfirmation via get-booking-request, valid / wrong token | before and after | 200 limited fields / 404 |
| B6 | resubmit same submissionKey | before and after | same request, no duplicate |
| B7 | office dashboard realtime on new submission | after (c) | count updates |
| B8 | anon realtime subscribe | after (c) | no event |
| B9 | built staging bundle network | after (b) | zero `/rest/v1/booking_requests` calls |

Test files: `supabase/functions/link-instructor-to-user/auth.test.ts` (L1–L8 with mocked auth), `supabase/tests/booking_requests_lockdown_test.sql` (B1–B3 using `set local role` + JWT claims, rolled back). B4–B9 are run as a staging script with synthetic data.

## Files
- `supabase/functions/link-instructor-to-user/index.ts`: auth order, server-side lookup, admin-only office.
- `supabase/functions/link-instructor-to-user/auth.test.ts`: new.
- `src/hooks/useCreateInstructor.ts`: send instructorId, German 403 message.
- `supabase/migrations/<ts>_p02_booking_requests_lockdown.sql`: new, applied in step (c) only.
- `supabase/rollback/p02_booking_requests_lockdown_rollback.sql`, `supabase/tests/booking_requests_lockdown_test.sql`: new.
- `AGENTS.md` rule: role grants above teacher are admin-only.

Blockers: office, admin, teacher and no-role test logins in staging (currently none). Also a checkout of `abc7018`.
