# Period Bookings Implementation Plan

## Completed Phases

### ✅ Phase 1-4: Period Modification Logic (Complete)
- Database schema: `period_group_id`, `is_period_override` on `ticket_items`
- `ticket_item_period_metadata` table for base configuration
- `usePeriodModification` hook for single-day and entire-period updates
- `PeriodModificationDialog` UI component
- Scheduler visual indicators (link icon, primary border)

### ✅ Phase 5: Email Templates & Notifications (Complete)
- Email templates: `private_lesson.single_day_changed`, `private_lesson.period_changed`
- Refactored `sendCustomerNotification` in `usePeriodModification.ts`
- Proper data fetching for customer/instructor names
- German locale date formatting

### ✅ Phase 6: Period Booking Creation in Wizard (Complete)
- **Created**: `src/hooks/useInstructorAvailabilityCheck.ts`
  - Checks instructor availability across date range
  - Queries: ticket_items, group_course_instances, instructor_absences
  - Returns conflicts with human-readable descriptions
  
- **Created**: `src/components/bookings/wizard/AvailabilityStatus.tsx`
  - Displays green success message when available
  - Displays amber warning with conflict list when conflicts exist
  - Non-blocking: allows booking creation with conflicts

- **Modified**: `src/hooks/useCreateBooking.ts`
  - Detects period bookings: `productType === "private" && selectedDates.length > 1`
  - Generates `period_group_id` via `crypto.randomUUID()`
  - Creates `ticket_item_period_metadata` with base configuration
  - Links all `ticket_items` via `period_group_id`

- **Modified**: `src/components/bookings/wizard/Step3InstructorDetails.tsx`
  - Integrated availability check on instructor selection
  - Shows AvailabilityStatus for multi-day private lessons

---

## Test Scenarios

1. **Single-day booking**: No `period_group_id` created, behaves as before
2. **Multi-day booking (no conflicts)**: 
   - `period_group_id` generated
   - metadata created with base configuration
   - Green availability status shown
3. **Multi-day booking (with conflicts)**:
   - Same as above
   - Yellow warning with conflict list
   - Booking can still be created
4. **Edit existing period booking**: Handled by Phase 4 modification logic
