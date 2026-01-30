
# Customer & Instructor Notifications for Booking Changes

## Current State Analysis

### What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| Group course notifications | Complete | `useGroupCourseNotifications.ts`, `InstanceChangeConfirmDialog` |
| Instructor notifications (private) | Complete | DB triggers queue to `instructor_notification_queue`, processed by `send-instructor-notification` |
| Customer notifications (private) | Missing | No hooks, no templates, no confirmation dialog |
| Email edge function | Complete | `send-notification` handles template-based emails |

### Existing Email Templates

| Trigger | For | Status |
|---------|-----|--------|
| `instructor.lesson.assigned` | Instructor | Exists |
| `instructor.lesson.changed` | Instructor | Exists |
| `instructor.lesson.cancelled` | Instructor | Exists |
| `customer.booking.changed` | Customer | **MISSING** |
| `customer.instructor.changed` | Customer | **MISSING** |

### Key Finding
Instructors are automatically notified via database triggers on `ticket_items`. We only need to implement **customer notifications** for private lessons.

---

## Implementation Plan

### Phase 1: Add Customer Email Templates

Add 2 new templates to `email_templates` table:

```text
Template 1: customer.booking.changed
- Name: "Buchungsänderung - Privatstunde"
- Subject: "Änderung Ihrer Buchung: {{product_name}}"
- Variables: customer_name, product_name, old_date, old_time, 
             new_date, new_time, instructor_name, meeting_point

Template 2: customer.instructor.changed  
- Name: "Lehrerwechsel - Privatstunde"
- Subject: "Lehrerwechsel für Ihre Buchung: {{product_name}}"
- Variables: customer_name, product_name, booking_date, booking_time,
             old_instructor_name, new_instructor_name, meeting_point
```

### Phase 2: Create BookingChangeConfirmDialog

Create a new dialog component based on existing `InstanceChangeConfirmDialog`:

```text
src/components/bookings/BookingChangeConfirmDialog.tsx

Props:
- open, onOpenChange
- onConfirm(notifyCustomer: boolean)
- changeType: 'date' | 'instructor' | 'both'
- customerName: string
- oldValues: { date?, time?, instructor? }
- newValues: { date?, time?, instructor? }

Features:
- Shows what changed (date/time, instructor, or both)
- Checkbox: "Kunde per E-Mail informieren" (default: checked)
- Buttons: "Abbrechen" / "Änderungen speichern"
```

### Phase 3: Create Customer Notification Hook

Create hook to send customer emails for private lesson changes:

```text
src/hooks/useBookingChangeNotification.ts

useSendBookingChangeNotification():
  - Input: ticketItemId, changeType, oldValues, newValues
  - Fetches ticket with customer email
  - Determines template trigger (customer.booking.changed or customer.instructor.changed)
  - Calls send-notification edge function
  - Returns mutation with success/error handling
```

### Phase 4: Integrate into Scheduler Drag & Drop

Modify `SchedulerGrid.tsx`:

```text
Current flow:
1. User drags booking to new slot
2. handleBookingDrop() validates and calls updateTicketItem.mutate()
3. Booking updated immediately

New flow:
1. User drags booking to new slot
2. Detect changes (date? time? instructor?)
3. If changes detected, store pending change and show confirmation dialog
4. User confirms with notify checkbox
5. Update booking, then send notification if requested
```

### Phase 5: Integrate into BookingDetailDialog

Modify `BookingDetailDialog.tsx`:

```text
Current flow:
1. User edits booking fields and clicks Save
2. handleSave() calls updateTicketItem.mutate()
3. Booking updated immediately

New flow:
1. User edits booking fields and clicks Save
2. Detect what changed (compare original vs current values)
3. If significant changes, show confirmation dialog
4. User confirms with notify checkbox
5. Update booking, then send notification if requested
```

---

## Technical Details

### Change Detection Logic

```typescript
function detectBookingChanges(
  original: BookingData,
  updated: BookingData
): {
  hasDateChange: boolean;
  hasTimeChange: boolean;
  hasInstructorChange: boolean;
  changeType: 'date' | 'instructor' | 'both' | 'none';
}
```

### Notification Data Structure

```typescript
interface BookingChangeNotificationData {
  customer_name: string;
  product_name: string;
  // For date/time changes:
  old_date?: string;
  old_time?: string;
  new_date?: string;
  new_time?: string;
  // For instructor changes:
  old_instructor_name?: string;
  new_instructor_name?: string;
  // Always included:
  instructor_name: string;
  meeting_point: string;
  booking_date?: string;
  booking_time?: string;
}
```

### Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Customer has no email | Skip notification, log warning |
| No instructor assigned | Use "Noch nicht zugewiesen" |
| User unchecks notify | Save changes without email |
| User cancels dialog | Revert all changes |
| Both date AND instructor change | Send `customer.booking.changed` (includes instructor info) |

---

## Files to Create/Modify

| Action | File | Changes |
|--------|------|---------|
| **CREATE** | `src/components/bookings/BookingChangeConfirmDialog.tsx` | Confirmation dialog component |
| **CREATE** | `src/hooks/useBookingChangeNotification.ts` | Hook for sending customer notifications |
| **MODIFY** | `src/components/scheduler/SchedulerGrid.tsx` | Add confirmation dialog for drag & drop |
| **MODIFY** | `src/components/scheduler/BookingDetailDialog.tsx` | Add confirmation dialog for manual edits |
| **SQL** | Database migration | Add 2 new email templates |

---

## Execution Order

1. **Database**: Add email templates via migration
2. **Component**: Create `BookingChangeConfirmDialog`
3. **Hook**: Create `useBookingChangeNotification`
4. **Integration**: Update `SchedulerGrid.tsx` with confirmation flow
5. **Integration**: Update `BookingDetailDialog.tsx` with confirmation flow
6. **Testing**: Verify end-to-end flow

---

## Privacy & Data Protection

- Group courses: Other participants never notified about individual changes (already implemented)
- Private lessons: Only the booking customer receives notifications
- Instructors: Already handled via existing DB trigger system
- User control: Checkbox allows opting out of customer notification
