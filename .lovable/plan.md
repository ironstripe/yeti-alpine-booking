
# Adjust Test Data Generation for Realistic Booking Distribution

## Context

With 7 instructors assigned to weekly group courses, the remaining 20 instructors handle private lessons. The current 90% private / 10% group ratio needs adjustment to reflect realistic capacity.

## Current vs Proposed Ratio

| Type | Current | Proposed | Reasoning |
|------|---------|----------|-----------|
| Private | 90% | 100% | Test generator focuses on private bookings only |
| Group | 10% | 0% | Group enrollments handled separately via training management |

**Why remove group from generator?**
Group course bookings follow a different flow (training enrollment) and shouldn't be mixed with private lesson ticket generation. The test data generator should focus on what it's designed for: filling the scheduler with private lessons.

## Implementation Changes

### 1. Exclude Group Course Instructors from Private Assignments

Store the 7 group instructor IDs (or mark them in DB) and filter them out when assigning instructors to private lessons.

**Approach:** Add a query to identify instructors already assigned to group courses this week, then exclude them from the private lesson pool.

### 2. Simplify Booking Distribution

Remove the group product logic since group enrollments are managed through the training system.

| Old Logic | New Logic |
|-----------|-----------|
| 70% private 2h | 60% private 2h |
| 20% private 1h | 25% private 1h |
| 10% group | 15% private 3h (half-day) |

### 3. Update Time Slot Distribution

Align with realistic demand patterns:
- Morning 09:00-11:00: 35%
- Morning 10:00-12:00: 25%
- Afternoon 14:00-16:00: 25%
- Half-day 09:00-12:00 or 13:00-16:00: 15%

---

## Technical Changes

**File: `supabase/functions/generate-test-bookings/index.ts`**

1. **Query group course instructor assignments**
   - Fetch instructors assigned to `training_groups` for the date range
   - Build exclusion list

2. **Filter instructor pool**
   - Remove group-assigned instructors before random assignment
   - Only remaining ~20 instructors available for private lessons

3. **Remove group product selection**
   - Delete the `groupProducts` filter
   - Delete the 10% group product assignment logic

4. **Update distribution comments**
   - Change from "70% private 2h, 20% private 1h, 10% group"
   - To "60% 2h, 25% 1h, 15% half-day"

---

## File Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/generate-test-bookings/index.ts` | Query group instructors, filter pool, remove group logic |

---

## Result

- Private lessons assigned only to non-group instructors
- More realistic scheduler load for testing
- Group course capacity tested separately via training enrollment
