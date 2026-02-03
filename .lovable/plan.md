
# Final Scheduler Header Optimization

## Overview

Remove the quick-add button and add a high-frequency booking type filter toggle directly in the header for better accessibility.

**Current State:**
```
[<][Date][>][🎯]  [Tag][3T][Woche]  [🔍]  [⚙️]  [+]
```

**Target State:**
```
[<][Date][>][🎯]  [Tag][3T][Woche]  [🔍]  [⚙️]  [Alle|Gruppen|Privat]
```

---

## Changes

### 1. Update SchedulerHeader.tsx

**Remove:**
- The `[+]` (New Booking) button (lines 156-165)
- The `Plus` icon import

**Add:**
- A new `ToggleGroup` for booking type filter with three options: `Alle`, `Gruppen`, `Privat`
- This toggle controls the `bookingTypeFilter` in the filters state

```tsx
{/* Booking Type Quick Filter */}
<ToggleGroup 
  type="single" 
  value={filters.bookingTypeFilter || "all"}
  onValueChange={(v) => v && onFiltersChange({ 
    bookingTypeFilter: v === "all" ? null : v 
  })}
  className="bg-muted rounded-md p-0.5"
>
  <ToggleGroupItem value="all" className="px-2 h-7 text-xs data-[state=on]:bg-background">
    Alle
  </ToggleGroupItem>
  <ToggleGroupItem value="group" className="px-2 h-7 text-xs data-[state=on]:bg-background">
    Gruppen
  </ToggleGroupItem>
  <ToggleGroupItem value="private" className="px-2 h-7 text-xs data-[state=on]:bg-background">
    Privat
  </ToggleGroupItem>
</ToggleGroup>
```

### 2. Update SchedulerSettingsMenu.tsx

**Remove:**
- The "Buchungstypen" submenu (lines 180-203) since it's now directly accessible in the header
- The `ListFilter` icon import (no longer needed)

**Update:**
- The `activeFilterCount` calculation to exclude `bookingTypeFilter` (it's now visible in header, not a "hidden" filter)

```tsx
// Updated activeFilterCount - remove bookingTypeFilter check
const activeFilterCount = [
  filters.roleFilter !== null,
  filters.capabilityFilter !== null,
  // bookingTypeFilter removed - now in header
  filters.sortBy !== "name",
  filters.compactMode,
].filter(Boolean).length;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/scheduler/SchedulerHeader.tsx` | Remove `[+]` button, add booking type `ToggleGroup` |
| `src/components/scheduler/SchedulerSettingsMenu.tsx` | Remove "Buchungstypen" submenu, update filter count |

---

## Final Header Layout

```
[<] [Mi., 04.02.] [>] [🎯]  |  [Tag][3T][Woche]  |  [🔍]  [⚙️]  [Alle|Gruppen|Privat]
```

1. **Date Navigation**: `[<]` `[Date picker]` `[>]` `[🎯 Today]`
2. **View Switcher**: `[Tag]` `[3T]` `[Woche]`
3. **Search**: `[🔍 Suchen...]`
4. **Settings**: `[⚙️]` (without booking type filter)
5. **Booking Type Filter**: `[Alle]` `[Gruppen]` `[Privat]`

This provides quick access to the most frequently used filter while keeping advanced options in the settings menu.
