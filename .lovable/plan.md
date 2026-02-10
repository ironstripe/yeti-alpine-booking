

# Fix: "Nach Alter verteilen" Should Group by Age, Not Interleave

## Problem

The current `distributeByAge` function sorts participants by birth date, then distributes them using round-robin (`index % numGroups`). This spreads ages evenly across groups:

- Group 1: 14, 12, 11, 10, 6, 3
- Group 2: 13, 12, 11, 9, 7, 5

Instead, users expect contiguous age blocks:

- Group 1 (older): 14, 13, 13, 12, 12, 11, 11, 10, 9
- Group 2 (younger): 8, 7, 6, 5, 3

## Fix

**File:** `src/components/group-capacity/SplitGroupDialog.tsx`

Replace the round-robin distribution in `distributeByAge` (lines 160-172) with contiguous chunk distribution:

```typescript
const distributeByAge = () => {
  if (!group) return;
  
  // Sort oldest first (earliest birthDate = oldest)
  const sorted = [...group.participants].sort(
    (a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime()
  );

  setSplitGroups(prev => {
    const numGroups = prev.length;
    const chunkSize = Math.ceil(sorted.length / numGroups);
    return prev.map((g, i) => ({
      ...g,
      participants: sorted.slice(i * chunkSize, (i + 1) * chunkSize),
    }));
  });
};
```

This slices the sorted list into contiguous chunks -- Group 1 gets the oldest half, Group 2 gets the youngest half.

## Result

With 17 participants and 2 groups:
- Group 1 (9 participants): ages 14, 13, 13, 12, 12, 11, 11, 10, 10
- Group 2 (8 participants): ages 9, 8, 7, 6, 5, 3, ...

Only one function changes, no other files affected.
