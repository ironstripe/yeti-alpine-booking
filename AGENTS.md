
- Edge functions: staff-only functions call `requireRole` from `supabase/functions/_shared/staffAuth.ts`; test/debug functions call `testFunctionsDisabled` (off unless ALLOW_TEST_FUNCTIONS=true). Why: all functions run with verify_jwt=false, so authorization must be in code.
- Anonymous (anon) database access is whitelisted: only INSERT/SELECT on booking_requests (published booking form). Why: all other data must go through Edge Functions; rollback in supabase/rollback/p02_step2b_rollback.sql.
- Private lessons: scheduling state lives on `private_appointments` (one per date+slot); `ticket_items` link via nullable `appointment_id` and stay the billing/attendance rows. Why: one record per appointment for the Scheduler without breaking existing readers.
