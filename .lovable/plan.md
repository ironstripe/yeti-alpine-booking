
# Plan: YETI Scheduler - Office Staff Planning, Fullscreen & Planning Mode

## Executive Summary
This plan extends the scheduler with three new features:
1. **Office Staff Planning** - Filter and display office staff with purple shift blocks
2. **Fullscreen Mode** - Maximize scheduler view hiding sidebar
3. **Planning Mode** - Highlight available slots, dim existing bookings

---

## Phase 1: Database Changes

### 1.1 Update `role` Column Values
The `instructors` table already has a `role` column (TEXT, default 'rolle_1'). We'll update it to use meaningful values:

```sql
-- Update default and add check constraint
ALTER TABLE instructors 
  ALTER COLUMN role SET DEFAULT 'instructor';

-- Update existing 'rolle_1' values to 'instructor'
UPDATE instructors SET role = 'instructor' WHERE role = 'rolle_1';

-- Add constraint for valid roles
ALTER TABLE instructors 
  ADD CONSTRAINT check_staff_role 
  CHECK (role IN ('instructor', 'office_staff', 'management'));

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_instructors_role ON instructors(role);
```

### 1.2 Add Office Shift Products
```sql
INSERT INTO products (name, type, duration_minutes, price, is_active)
VALUES 
  ('Büro-Schicht Vormittag', 'office_shift', 240, 0, true),
  ('Büro-Schicht Nachmittag', 'office_shift', 240, 0, true);
```

---

## Phase 2: Role Filter in SchedulerHeader

### Files to Modify
| File | Changes |
|------|---------|
| `src/components/scheduler/SchedulerHeader.tsx` | Add role filter dropdown |
| `src/components/scheduler/SchedulerGrid.tsx` | Add role filter state & filtering logic |

### SchedulerHeader Changes
Add new props and role filter UI next to capability filter:

```typescript
interface SchedulerHeaderProps {
  // ... existing props
  roleFilter: string | null;
  onRoleFilterChange: (filter: string | null) => void;
}
```

Add UI element:
```tsx
{/* Role Filter - NEW */}
<Select 
  value={roleFilter || "all"} 
  onValueChange={(v) => onRoleFilterChange(v === "all" ? null : v)}
>
  <SelectTrigger className="w-8 h-8 p-0 md:w-[130px] md:px-2 [&>span]:hidden md:[&>span]:inline">
    <Users className="h-3.5 w-3.5 md:mr-1" />
    <SelectValue placeholder="Rolle" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Alle</SelectItem>
    <SelectItem value="instructor">Skilehrer</SelectItem>
    <SelectItem value="office_staff">Büropersonal</SelectItem>
  </SelectContent>
</Select>
```

### SchedulerGrid Changes
Add filtering logic:
```typescript
const [roleFilter, setRoleFilter] = useState<string | null>(null);

const filteredInstructors = useMemo(() => {
  let filtered = instructors;
  
  // Filter by role
  if (roleFilter) {
    filtered = filtered.filter(i => i.role === roleFilter);
  }
  
  // Filter by capability (existing)
  // Filter by compact mode (existing)
  
  return filtered;
}, [instructors, roleFilter, capabilityFilter, compactMode, bookings, absences]);
```

---

## Phase 3: Visual Differentiation for Office Staff

### Files to Modify
| File | Changes |
|------|---------|
| `src/components/scheduler/SingleDayInstructorRow.tsx` | Show building icon for office staff |
| `src/components/scheduler/InstructorWeekBlock.tsx` | Show building icon for office staff |

### Icon Display Logic
```tsx
// Replace ski/snowboard emoji with building icon for office staff
{instructor.role === 'office_staff' ? (
  <Building className="h-3 w-3 text-purple-600" />
) : (
  badges.map((badge) => (
    <span>{badge.label === "K" ? "⛷️" : "🏂"}</span>
  ))
)}
```

---

## Phase 4: Office Shift Booking Bar Colors

### Files to Modify
| File | Changes |
|------|---------|
| `src/lib/scheduler-utils.ts` | Extend `getBookingBarClasses` for office_shift type |
| `src/components/scheduler/BookingBar.tsx` | Handle office_shift type |

### Color Logic Extension
```typescript
export function getBookingBarClasses(
  type: "private" | "group" | "office_shift", 
  isPaid: boolean
): string {
  if (type === "office_shift") {
    return "bg-purple-600 text-white border-purple-700";
  }
  if (type === "group") {
    return "bg-blue-600 text-white border-blue-700";
  }
  return isPaid 
    ? "bg-emerald-500 text-white border-emerald-600" 
    : "bg-orange-500 text-white border-orange-600";
}
```

### Update Legend
Add purple legend item in `SchedulerGrid.tsx`:
```tsx
<div className="flex items-center gap-1">
  <div className="w-2 h-2 rounded-sm bg-purple-600" />
  <span>Büro</span>
</div>
```

---

## Phase 5: Fullscreen Mode

### Files to Modify
| File | Changes |
|------|---------|
| `src/components/scheduler/SchedulerHeader.tsx` | Add fullscreen toggle button |
| `src/components/scheduler/SchedulerGrid.tsx` | Add fullscreen state & container styling |

### New Props for SchedulerHeader
```typescript
interface SchedulerHeaderProps {
  // ... existing props
  isFullscreen: boolean;
  onFullscreenToggle: (fullscreen: boolean) => void;
}
```

### Fullscreen Button UI
```tsx
{/* Fullscreen Toggle */}
<Button
  variant={isFullscreen ? "secondary" : "ghost"}
  size="icon"
  className="h-8 w-8"
  onClick={() => onFullscreenToggle(!isFullscreen)}
  title={isFullscreen ? "Vollbild beenden (Esc)" : "Vollbild"}
>
  {isFullscreen ? (
    <Minimize className="h-3.5 w-3.5" />
  ) : (
    <Maximize className="h-3.5 w-3.5" />
  )}
</Button>
```

### SchedulerGrid Container Styling
```typescript
const [isFullscreen, setIsFullscreen] = useState(false);

// ESC key handler
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isFullscreen) {
      setIsFullscreen(false);
    }
  };
  window.addEventListener('keydown', handleEscape);
  return () => window.removeEventListener('keydown', handleEscape);
}, [isFullscreen]);

// Container classes
<div className={cn(
  "flex flex-col h-full bg-background",
  isFullscreen && "fixed inset-0 z-50 overflow-auto"
)}>
```

---

## Phase 6: Planning Mode

### Files to Modify
| File | Changes |
|------|---------|
| `src/components/scheduler/SchedulerHeader.tsx` | Add planning mode toggle |
| `src/components/scheduler/SchedulerGrid.tsx` | Add planning mode state & context |
| `src/components/scheduler/BookingBar.tsx` | Dim when planning mode active |
| `src/components/scheduler/EmptySlot.tsx` | Enhanced hover styling in planning mode |
| `src/contexts/SchedulerSelectionContext.tsx` | Add planning mode to context |

### New Props for SchedulerHeader
```typescript
interface SchedulerHeaderProps {
  // ... existing props
  isPlanningMode: boolean;
  onPlanningModeToggle: (planning: boolean) => void;
}
```

### Planning Mode Button UI
```tsx
{/* Planning Mode Toggle */}
<Button
  variant={isPlanningMode ? "secondary" : "ghost"}
  size="icon"
  className="h-8 w-8"
  onClick={() => onPlanningModeToggle(!isPlanningMode)}
  title={isPlanningMode ? "Planungsmodus beenden" : "Planungsmodus"}
>
  <Target className="h-3.5 w-3.5" />
</Button>
```

### BookingBar Visual Changes
```tsx
// In BookingBar.tsx
<div className={cn(
  barClasses,
  isPlanningMode && "opacity-50"
)}>
```

### EmptySlot Enhanced Hover
```tsx
// In EmptySlot.tsx
<div className={cn(
  baseClasses,
  isPlanningMode && !isInvalidDropZone && "hover:bg-green-50 hover:border-2 hover:border-green-400"
)}>
```

### Instructor Sorting in Planning Mode
```typescript
// In SchedulerGrid.tsx or InstructorFocusView.tsx
const sortedInstructors = useMemo(() => {
  if (!isPlanningMode) return filteredInstructors;
  
  return [...filteredInstructors].sort((a, b) => {
    // Available first, then by booking count (ascending)
    const aBookings = bookings.filter(b => b.instructorId === a.id).length;
    const bBookings = bookings.filter(b => b.instructorId === b.id).length;
    const aAbsent = absences.some(ab => ab.instructorId === a.id);
    const bAbsent = absences.some(ab => ab.instructorId === b.id);
    
    if (aAbsent && !bAbsent) return 1;
    if (!aAbsent && bAbsent) return -1;
    return aBookings - bBookings;
  });
}, [filteredInstructors, bookings, absences, isPlanningMode]);
```

---

## Phase 7: Planning Mode Click Behavior

### EmptySlot Quick-Create Navigation
```tsx
// In EmptySlot.tsx handleMouseDown
if (isPlanningMode && !isBlocked) {
  // In planning mode, single click navigates to booking wizard
  const endMinutes = timeToMinutes(timeSlot) + 60;
  const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, "0")}:00`;
  
  navigate(`/bookings/new?instructor=${instructorId}&appointments=${encodeURIComponent(
    JSON.stringify([{
      date,
      startTime: timeSlot,
      durationMinutes: 60
    }])
  )}`);
  return;
}
```

---

## Implementation Order

| Phase | Description | Complexity |
|-------|-------------|------------|
| 1 | Database changes (role column, office_shift products) | Low |
| 2 | Role filter dropdown in header + filtering logic | Medium |
| 3 | Visual differentiation (building icon for office staff) | Low |
| 4 | Office shift booking bar colors (purple) | Low |
| 5 | Fullscreen mode toggle + ESC handler | Medium |
| 6 | Planning mode toggle + visual changes | Medium |
| 7 | Planning mode click behavior | Low |

---

## Updated SchedulerHeader Props Summary

```typescript
interface SchedulerHeaderProps {
  // Existing
  date: Date;
  onDateChange: (date: Date) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedInstructorId: string | null;
  onInstructorFilterChange: (id: string | null) => void;
  instructorOptions: { id: string; name: string }[];
  onInstructorSelect?: (id: string) => void;
  capabilityFilter: string | null;
  onCapabilityFilterChange: (filter: string | null) => void;
  compactMode?: boolean;
  onCompactModeChange?: (compact: boolean) => void;
  compactStats?: { visible: number; total: number };
  
  // NEW
  roleFilter: string | null;
  onRoleFilterChange: (filter: string | null) => void;
  isFullscreen: boolean;
  onFullscreenToggle: (fullscreen: boolean) => void;
  isPlanningMode: boolean;
  onPlanningModeToggle: (planning: boolean) => void;
}
```

---

## Visual Layout Reference

```text
Updated SchedulerHeader:
┌────────────────────────────────────────────────────────────────────────────┐
│ [<] [Datum] [>] [●] │ [Tag][3T][Woche] │ [🔍 Lehrer][👤 Kunde]           │
│                     │                   │                                  │
│     Date Nav        │    View Mode      │   Search Fields                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                         │ [Alle▼] [Ski▼] [🎯] [⛶] [⊞]   │
│        Spacer                           │  Role  Capab. Plan Full Compact │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Color Scheme Summary

| Color | Meaning | Use Case |
|-------|---------|----------|
| Blue | Group Course | Ski instructors |
| Green | Paid Private | Ski instructors |
| Orange | Unpaid Private | Ski instructors |
| **Purple** | Office Shift | Office staff |
| Light Gray | Absence/Not Available | All |
| White/Empty | Available Slot | All |
| Green Border (hover) | Available (Planning Mode) | All |

---

## Testing Scenarios

### Role Filter
- [ ] "Alle" shows all instructors
- [ ] "Skilehrer" shows only instructors with role='instructor'
- [ ] "Büropersonal" shows only staff with role='office_staff'
- [ ] Office staff rows display building icon instead of ski/snowboard emoji

### Fullscreen Mode
- [ ] Clicking fullscreen hides sidebar, maximizes scheduler
- [ ] ESC key exits fullscreen
- [ ] Works in all view modes (daily, 3 days, weekly)

### Planning Mode
- [ ] Existing bookings are dimmed (opacity-50)
- [ ] Empty slots show green hover effect
- [ ] Available instructors sorted to top
- [ ] Clicking empty slot navigates to booking wizard with prefilled data

### Office Shifts
- [ ] Office shifts display in purple
- [ ] Can create morning/afternoon office shifts
- [ ] Office staff can have absences like instructors
