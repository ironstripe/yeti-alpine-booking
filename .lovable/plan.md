
# Plan: Office Staff Training Management + Group Course Notifications

## Summary

This plan covers two major features:
1. **Office Staff Training Management** - Extend the training system to support internal office shift planning
2. **Group Course Notification System** - Comprehensive email notifications for group course changes

---

## Status Overview

### Office Staff Training (Phase 1-3 Complete)

| Phase | Status | Description |
|-------|--------|-------------|
| ✅ Phase 1 | Done | Database schema (is_internal, office_shift_assignments) |
| ✅ Phase 2 | Done | Types & hooks (CourseType 'office', useOfficeShiftAssignments) |
| ✅ Phase 3 | Done | UI (Trainings tabs, form modal, card variants) |
| ⏳ Phase 4 | Pending | Instance multi-staff assignment (OfficeStaffAssignment.tsx) |
| ⏳ Phase 5 | Pending | Scheduler integration for office shifts |

### Group Course Notifications (Complete)

| Component | Status | Description |
|-----------|--------|-------------|
| ✅ Email Templates | Done | 6 templates for all notification scenarios |
| ✅ Notification Service | Done | src/lib/group-course-notifications.ts |
| ✅ Notification Hooks | Done | useGroupCourseNotifications.ts |
| ✅ Confirmation Dialog | Done | InstanceChangeConfirmDialog.tsx |
| ✅ UI Integration | Done | TrainingInstancesView with confirmation |

---

## Group Course Notification Rules

### Rule 1: Global Changes → All Participants + Instructor

**Triggers:**
- Instance date changed
- Instance time changed (start_time, end_time)
- Instructor changed
- Meeting point changed
- Instance cancelled

**Recipients:**
- ✅ All customers with enrollments in this instance
- ✅ Assigned instructor (new instructor if changed)
- ✅ Old instructor (if instructor changed)

### Rule 2: Individual Changes → Only Affected Customer

**Triggers:**
- Participant enrolled
- Participant unenrolled
- Participant notes changed

**Recipients:**
- ✅ Only the affected customer
- ✅ Instructor (about participant count change)
- ❌ NOT other participants (privacy!)

### Rule 3: Instructor Always Informed

The instructor receives notifications about:
- Global changes (date, time, cancellation)
- New enrollments
- Unenrollments
- Current participant count

---

## Email Templates Created

| Template | Trigger | Recipients |
|----------|---------|------------|
| Gruppenkurs Änderung | customer.group_course.changed | All participants |
| Gruppenkurs Abgesagt | customer.group_course.cancelled | All participants |
| Gruppenkurs Anmeldung | customer.group_course.enrolled | Individual customer |
| Gruppenkurs Abmeldung | customer.group_course.unenrolled | Individual customer |
| Teilnehmerzahl geändert | instructor.group_course.enrollment_changed | Instructor |
| Gruppenkurs Änderung (Lehrer) | instructor.group_course.changed | Instructor |

---

## Files Created/Modified

### New Files
- `src/lib/group-course-notifications.ts` - Notification service functions
- `src/hooks/useGroupCourseNotifications.ts` - React hooks for notifications
- `src/components/trainings/InstanceChangeConfirmDialog.tsx` - Confirmation UI
- `src/hooks/useOfficeShiftAssignments.ts` - Office shift CRUD

### Modified Files
- `src/components/trainings/TrainingInstancesView.tsx` - Confirmation dialog integration
- `src/types/group-courses.ts` - Added 'office' course type, OFFICE_TIME_PRESETS
- `src/pages/Trainings.tsx` - Category tabs (Kurse/Intern)
- `src/components/trainings/TrainingFormModal.tsx` - Office mode
- `src/components/trainings/TrainingCard.tsx` - Office variant display
- `src/components/trainings/TrainingsFilters.tsx` - Internal filter
- `src/hooks/useGroupCourses.ts` - Office course handling

---

## Remaining Work

### Office Staff Training
1. **OfficeStaffAssignment.tsx** - Multi-select staff component for office instances
2. **Scheduler Integration** - Display office shifts in scheduler grid

### Future Enhancements
- Database triggers for automatic notification queueing
- Enrollment management UI with notification integration
- Bulk notification preferences for customers

