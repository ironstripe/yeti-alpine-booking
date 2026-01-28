
# Change Age Filtering to Soft Warning

## Summary
Remove age-based filtering from group course selection. Instead, show all courses and display a soft warning badge when a participant's age exceeds the course's `max_age`.

---

## Current Behavior (Problem)

```
Age = 10, Course max_age = 8  →  Course is HIDDEN from dropdown
```

Result: User sees "Keine passenden Gruppen für Alter 10 J. gefunden"

---

## New Behavior (Solution)

```
Age = 10, Course max_age = 8  →  Course is SHOWN with amber warning badge
```

Result: User can still select course, but sees warning like "Alter 10 > max. 8 J."

---

## Changes

### File: `src/components/bookings/wizard/ParticipantBookingCard.tsx`

#### 1. Remove Age Filtering from Query

**Before:**
```typescript
return coursesData
  .filter((course) => {
    if (age === null) return true;
    if (course.min_age != null && age < course.min_age) return false;
    if (course.max_age != null && age > course.max_age) return false;
    return true;
  })
  .map(...)
```

**After:**
```typescript
// No age filtering - show all courses
return coursesData.map((course) => ({
  ...course,
  currentCount: enrollmentMap[course.id] || 0,
})) as GroupCourseOption[];
```

#### 2. Add Age Warning Logic to SelectItem

Calculate whether participant age exceeds course max_age:

```typescript
const isAgeWarning = age !== null && course.max_age != null && age > course.max_age;
```

#### 3. Display Soft Warning Badge in Dropdown

```tsx
{isAgeWarning && (
  <Badge
    variant="outline"
    className="text-[10px] h-4 px-1 border-amber-400 text-amber-600"
  >
    <AlertTriangle className="h-2 w-2 mr-0.5" />
    Alter {age} &gt; max. {course.max_age}
  </Badge>
)}
```

#### 4. Update Empty State Message

The message "Keine passenden Gruppen für Alter X J. gefunden" becomes obsolete since courses are no longer filtered by age. Update to only show if truly no courses exist:

```typescript
{groupCourses.length === 0 ? (
  <div className="text-xs text-amber-600 py-2 bg-amber-50 rounded-md px-2">
    <AlertTriangle className="h-3 w-3 inline mr-1" />
    Keine Gruppen verfügbar. Bitte wählen Sie zuerst Kurstage.
  </div>
) : ( ... )}
```

---

## Visual Comparison

### Before (Course hidden)
```
┌─────────────────────────────────────┐
│ Gruppe                              │
│ ⚠️ Keine passenden Gruppen für      │
│    Alter 10 J. gefunden             │
└─────────────────────────────────────┘
```

### After (Course visible with warning)
```
┌─────────────────────────────────────┐
│ Gruppe                              │
│ ┌─────────────────────────────────┐ │
│ │ ● Blue Prince           [3/10] │ │
│ │ ● Black King  ⚠️ >8J    [5/12] │ │  ← Soft warning
│ │ ● Windel Wedel          [2/8]  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/bookings/wizard/ParticipantBookingCard.tsx` | 1. Remove age filter from query<br>2. Add age warning calculation in SelectItem<br>3. Show amber warning badge for age > max_age<br>4. Simplify empty state message |

---

## Expected Outcome

1. All group courses appear in dropdown regardless of participant age
2. Courses where participant age exceeds max_age show amber warning badge
3. Course recommendations still work based on skill level (primary factor)
4. Age is secondary - informational only, not blocking
