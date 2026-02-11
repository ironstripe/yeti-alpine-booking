

# Fix: "Woche generieren" Button Not Updating UI

## Root Cause

The `useGenerateInstances()` mutation in `src/hooks/useGroupCourses.ts` invalidates these query keys on success:
- `['group-course-instances']`
- `['group-courses']`

But the planning page (`useGroupPlanningData`) uses a **different** query key:
- `['group-planning', weekStartStr]`

Because `['group-planning']` is never invalidated, the planning page data never refreshes after generation. The instances **are** created in the database, but the UI stays stuck showing the "Keine Instanzen vorhanden" empty state.

## Fix

Add the missing query invalidation in `useGenerateInstances()` (line 444 in `src/hooks/useGroupCourses.ts`):

```text
queryClient.invalidateQueries({ queryKey: ['group-planning'] });
```

Also apply the same fix to `useCopyWeekAssignments()` further down in the same file, so copied assignments also refresh the planning view.

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useGroupCourses.ts` | Add `queryClient.invalidateQueries({ queryKey: ['group-planning'] })` to the `onSuccess` callbacks of `useGenerateInstances()` and `useCopyWeekAssignments()` |

## Impact

Single-line addition per mutation. No other changes needed -- the RPC function and UI components are working correctly; only the cache invalidation was missing.
