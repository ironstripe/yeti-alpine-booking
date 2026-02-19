

# Add Cancellation Reason as Audit Trail Comment

## Current Behavior

The cancellation dialog has **two text fields**:
1. **Stornierungsgrund** (cancellation reason) -- always required
2. **Kulanz-Begrundung** (waiver reason) -- only shown when within 24h AND fee is waived/custom

When a cancellation is submitted:
- The `log_booking_cancelled` trigger creates a `ticket_history` event with the reason in `details.reason`
- But **no comment** is added to `ticket_comments`, so the reason doesn't appear as a readable comment in the timeline

## Changes

### 1. Add a `ticket_comments` entry during cancellation

In `useCancellation.ts`, after creating the cancellation record and before updating the ticket status, insert a `ticket_comment` with the cancellation reason. This adds a visible comment in the timeline alongside the automatic "Stornierung" history event.

The comment will include:
- The cancellation reason
- The waiver reason (if applicable), appended on a new line

**File**: `src/hooks/useCancellation.ts`

- Add `waiverReason` is already in the input (no change needed to interface)
- After step 3 (create cancellation record), get the current user via `supabase.auth.getUser()`
- Insert a `ticket_comment` with `comment_type: "internal"` and a combined content string like:
  - `"Stornierung: {reason}"` (or with waiver: `"Stornierung: {reason}\nKulanz-Begrundung: {waiverReason}"`)

### 2. Invalidate comment queries

Add `queryClient.invalidateQueries({ queryKey: ["ticket-comments"] })` and `queryClient.invalidateQueries({ queryKey: ["ticket-history"] })` to the `onSuccess` handler so the timeline refreshes immediately.

**File**: `src/hooks/useCancellation.ts`

## No UI Changes Needed

- The two text fields in the dialog are functionally different (reason vs. waiver justification) -- they serve distinct purposes and should stay
- The waiver reason field only appears conditionally (within 24h + non-AGB fee), so the user typically only sees one field
- Both values get combined into a single audit trail comment

## Result

After cancellation, the booking timeline will show:
- **System event**: "Stornierung: Vollstornierung -- {reason} (Gebuhr: CHF X.XX)" (from trigger)
- **Comment**: "Stornierung: {reason}" with the user's email (from the new comment insert)

This gives a clear, readable audit trail entry that shows who cancelled and why.

