

# Date and Weekday Validation Feature

## Status: ✅ COMPLETED

## Summary

Implemented automatic validation to detect mismatches between mentioned weekdays and dates in customer messages (e.g., "Montag, 17.01.2026" when the 17th is actually a Saturday). When a conflict is detected, the system displays a warning in the UI and generates a polite follow-up question in the suggested reply—without making assumptions about what the customer meant.

---

## Implementation Details

### Backend Changes

1. **`supabase/functions/process-ai-message/index.ts`**
   - Added `mentioned_weekday` field to dates schema in extraction tools
   - Added weekday extraction instructions to EXTRACTION_PROMPT
   - Added `validateDateWeekday()` function to check date vs weekday match
   - Added `validateAllDates()` function to process all dates in extraction
   - Integrated validation into `validateAndCleanExtraction()` pipeline
   - Date conflicts stored in `booking_summary.date_conflicts`
   - `booking_ready` set to `false` when conflicts exist

2. **`supabase/functions/generate-reply/index.ts`**
   - Updated `ExtractedData` interface with conflict types
   - Added `buildDateConflictInstruction()` function
   - AI replies now include polite clarification requests when conflicts detected

### Frontend Changes

1. **`src/components/inbox/DateConflictWarning.tsx`** (NEW)
   - Visual warning component showing conflict details
   - Displays mentioned vs actual weekday
   - Shows suggestion for correct date

2. **`src/components/inbox/ExtractionPanel.tsx`**
   - Integrated `DateConflictWarning` component
   - Shows prominently before other warnings

3. **`src/components/inbox/BookingReadyBadge.tsx`**
   - Added `date_weekday_conflict` to field labels
   - Updated `isBookingReady()` to return false on conflicts
   - Updated `getMissingRequiredFields()` to include conflicts

4. **`src/components/inbox/ConvertToBookingButton.tsx`**
   - Button disabled when date conflicts exist
   - Shows "Datum klären" label instead of "Buchung erstellen"
   - Displays warning text below button

5. **`src/hooks/useAIExtraction.ts`**
   - Added `DateConflict` interface
   - Updated `BookingSummary` interface with conflict fields

---

## Test Scenarios

| Input | Expected Result |
|-------|-----------------|
| "Montag, 17.01.2026" (17th is Saturday) | ❌ Conflict warning, booking disabled |
| "Samstag, 17.01.2026" (correct) | ✅ No warning, booking enabled |
| "am 17.01.2026" (no weekday) | ✅ No warning, booking enabled |
| "nächsten Montag" (no date) | ✅ AI calculates next Monday, no conflict |


