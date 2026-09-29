# Roadmap

## Security P0.2
- [x] Step 1A: anon `get-booking-request` Edge Function + RequestConfirmation switched to it
- [x] Step 1B: lock down SECURITY DEFINER functions (grants + role checks)
- [ ] Verify office/admin paths with a real office login (blocked: no office account available)
- [ ] Decision: request-received email needs a server-side sender (was browser-side with customer email)
- [ ] Follow-up: `useBookingRequest` reads booking_requests directly; must change before Step 2
- [ ] Step 2: remove anon policies/grants (not started, waiting for go)
- [ ] Step 3: role-scoped authenticated policies (not started)
