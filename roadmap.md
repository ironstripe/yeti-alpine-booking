# Roadmap

## Security P0.2
- [x] Step 1A: anon `get-booking-request` Edge Function + RequestConfirmation switched to it
- [ ] Step 1: remaining parts (waiting for user's continuation)
- [ ] Decision: request-received email was sent from the browser using the customer email; now needs a server-side sender
- [ ] Follow-up: `useBookingRequest` reads booking_requests (insert-return + token lookup) directly; will break in Step 2
- [ ] Step 2: remove anon policies/grants (not started)
- [ ] Step 3: role-scoped authenticated policies (not started)
