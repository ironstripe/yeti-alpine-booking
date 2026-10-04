# UI-09a: Staff detail density correction

## Scope
- Tighten only the staff-only instructor detail header so identity and availability share available width through natural wrapping.
- Make the compact empty “Heute” card a slim responsive row while preserving the populated timetable unchanged.
- Restore the original `isAdminOrOffice && id` visibility gate for instructor rentals.
- Preserve the teacher/self-service branch and all existing handlers, status logic, permissions, and data behavior.

## Verification
- Use isolated synthetic fixtures with all external traffic blocked for short/long names and empty/populated schedules.
- Compare the same baseline and updated components at 1440×900, 1280×720, 390×560, and a reduced CSS viewport representing 150% zoom.
- Check wrapping, overflow, 36/44px targets, teacher defaults, and measured header/empty-state/profile-position changes.
- Run TypeScript, diff checks, and the preview build; remove temporary fixtures and record exact coverage in the UI verification notes and roadmap.

## Technical details
- Limit source changes to staff opt-in presentation classes/branches in `InstructorDetail`, `TodayScheduleCard`, and, only if necessary, `StatusToggle`.
- Do not alter hooks, callbacks, queries, mutations, validation, navigation, backend code, or shared global card styles.
