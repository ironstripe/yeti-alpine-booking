

# Instructor Availability Check via AI

## Overview
When a customer asks about a specific instructor (e.g., "Is Claudia available Friday?"), the system will:
1. Detect the request during extraction
2. Check the instructor's real-time availability via a new edge function
3. Generate a context-aware reply (confirming, suggesting alternatives, or listing free slots)

## Changes

### 1. Update Extraction Schema (`process-ai-message`)
**File:** `supabase/functions/process-ai-message/index.ts`

- Add `instructor_request` object to the `extractionTools` schema with fields:
  - `is_requested` (boolean)
  - `instructor_name` (string) 
  - `is_flexible` (boolean)
- Add extraction instructions to the system prompt telling the AI to detect instructor requests
- Note: the existing `booking.instructor_preference` field (line 344) is a simple string; the new structured object provides richer data

### 2. New Edge Function: `check-instructor-availability`
**File:** `supabase/functions/check-instructor-availability/index.ts`

Input: `{ instructorName, requestedDates, requestedTime?, isFlexible, requestedSpecialization? }`

Logic flow:
1. **Find instructor** by first name in `instructors` table (status = 'active')
   - 0 matches -> `{ status: "not_found" }`
   - 2+ matches -> `{ status: "ambiguous", matches: [...] }`
   - 1 match -> proceed
2. **Check conflicts** for each requested date:
   - Query `ticket_items` (non-cancelled, matching instructor + date)
   - Query `group_course_instances` (non-cancelled, matching instructor + date)
   - Query `instructor_absences` (confirmed, overlapping date range)
3. **Determine free slots** per day (09:00-16:00 in 1h increments, excluding conflicts)
4. **Build response** based on scenario:
   - All requested slots free -> `{ status: "available" }`
   - Specific slot taken but others free -> `{ status: "unavailable_slot", free_slots }`
   - No time specified -> `{ status: "free_slots_list", free_slots }`
   - Fully booked + flexible -> query other active instructors for alternatives -> `{ status: "alternatives_found" }`
   - Fully booked + not flexible -> `{ status: "fully_booked" }`

**Config:** Add `[functions.check-instructor-availability]` with `verify_jwt = false` to `supabase/config.toml`

### 3. Integrate into `generate-reply`
**File:** `supabase/functions/generate-reply/index.ts`

- After loading conversation data, check if `extractedData.instructor_request?.is_requested` is true
- If so, call `check-instructor-availability` via `supabase.functions.invoke()`
- Pass the result as `availabilityContext` into the system prompt
- Add prompt section with rules for each status:
  - `available` -> confirm and ask to book
  - `unavailable_slot` -> offer alternative time slots
  - `alternatives_found` -> suggest other instructors by name
  - `free_slots_list` -> list all free time blocks
  - `ambiguous` -> ask which instructor they mean (e.g., "Claudia H. oder Claudia T.?")
  - `not_found` / `fully_booked` -> inform politely
  - Never reveal *why* an instructor is unavailable (privacy)

### 4. Update ExtractedData Interface in `generate-reply`
Add `instructor_request` to the `ExtractedData` interface so TypeScript recognizes the new field.

## Technical Details

### Edge Function: Slot Calculation
```text
For each requested date:
  1. Build array of 1h slots: [09-10, 10-11, ..., 15-16]
  2. Remove slots overlapping with ticket_items (time_start/time_end)
  3. Remove slots overlapping with group_course_instances (start_time/end_time)
  4. Remove all slots if instructor has full-day absence
  5. Remove overlapping slots for partial-day absences
  6. Return remaining slots as free
```

### Alternative Instructor Query
When finding alternatives, filter by:
- `status = 'active'`
- Not the originally requested instructor
- No conflicts on the requested dates/times
- Match `specialization` if provided (ski/snowboard/both)
- Limit to 3 results

### Files Modified
1. `supabase/functions/process-ai-message/index.ts` -- extraction schema + prompt
2. `supabase/functions/check-instructor-availability/index.ts` -- new edge function
3. `supabase/functions/generate-reply/index.ts` -- call availability check + prompt rules
4. `supabase/config.toml` -- register new function (auto-managed, but verify_jwt entry needed)

### Deployment
All three edge functions (`process-ai-message`, `generate-reply`, `check-instructor-availability`) will be deployed after changes.

