# Roadmap

## Security P0.2
- [x] Step 1A: anon `get-booking-request` Edge Function + RequestConfirmation switched to it
- [x] Step 1B: lock down SECURITY DEFINER functions (grants + role checks)
- [ ] Verify office/admin paths with a real office login (blocked: no office account available)
- [ ] Decision: request-received email needs a server-side sender (was browser-side with customer email)
- [x] Follow-up: `useBookingRequest` moved to submit-booking-request (Step 1D)
- [x] Step 2A: anon policies dropped/retargeted to authenticated, anon grants revoked (rollback: supabase/rollback/p02_step2a_rollback.sql)
- [x] After 2A: public pages, website functions (with key), portal with own session, linter checked
- [ ] After 2A: office login flows, public form submit + reservation E2E (need approval / create real data)
- [ ] Step 3: role-scoped authenticated policies (not started)
