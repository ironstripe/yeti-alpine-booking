
# Add Recurring Blocks to Instructor Detail Page

## Problem

The `RecurringBlocksTab` component exists at `src/components/instructor/RecurringBlocksTab.tsx` but is not rendered anywhere in the instructor detail page. Users cannot see or manage recurring unavailability blocks.

## Solution

Add the `RecurringBlocksTab` component to the instructor detail page, either as:
- A separate card below the AbsenceRequestCard, or
- Integrated into the AbsenceRequestCard as a collapsible section

The cleanest approach is to add it as a separate card with clear visual separation.

## Implementation

### File: `src/pages/InstructorDetail.tsx`

1. **Import the component:**
```typescript
import { RecurringBlocksTab } from "@/components/instructor/RecurringBlocksTab";
```

2. **Add the component to the right column (after AbsenceRequestCard):**

Location: Around line 164, after the AbsenceRequestCard and before SeasonStatsCard:

```tsx
{id && (
  <AbsenceRequestCard 
    instructorId={id} 
    isTeacherView={isOwnProfile}
  />
)}
{id && (
  <RecurringBlocksTab instructorId={id} />
)}
<SeasonStatsCard stats={seasonStats} />
```

## Result

- Recurring blocks section will appear below one-time absences
- Users can create, view, edit, and delete recurring unavailability blocks
- Presets (Mittagspause, Nur Vormittage, Nur Nachmittage) will be accessible
- All existing functionality (conflict checking, approval workflow) will work

## Technical Note

The component already has full functionality:
- Uses `useRecurringBlocks` hook to fetch data
- Has create/edit dialog with preset support
- Displays status badges (pending/approved/rejected)
- Supports delete functionality
