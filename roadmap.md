# Roadmap

## Security P0.2
- [x] Step 1A: anon `get-booking-request` Edge Function + RequestConfirmation switched to it
- [x] Step 1B: lock down SECURITY DEFINER functions (grants + role checks)
- [ ] Verify office/admin paths with a real office login (blocked: no office account available)
- [ ] Decision: request-received email needs a server-side sender (was browser-side with customer email)
- [x] Follow-up: `useBookingRequest` moved to submit-booking-request (Step 1D)
- [ ] Step 2A: applied 21:42, ROLLED BACK 21:52 on user emergency request — anon access is open again; waiting for user reason/go before retry
- [ ] Step 3: role-scoped authenticated policies (not started)
