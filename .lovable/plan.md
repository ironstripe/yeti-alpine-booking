
# Simplify Scheduler Header - Hybrid Approach

## Overview

This is a comprehensive UI refactor to reduce cognitive load in the scheduler header. We'll go from 10+ interactive elements down to ~6 core elements while maintaining all functionality via a settings menu.

**Current State:**
```
[<][Date][>][Target][Tag][3T][Woche][Search Lehrer][Search Kunde][Role▼][Filter▼][Type▼][Sort▼][Planning][Fullscreen][Compact]
```

**Target State:**
```
[<][So., 08.02.][>] [Tag][3T][Woche] [Search...] [Settings] [+]
```

---

## Phase 1: Quick Wins

### 1.1 Create Universal Search Component

**New File:** `src/components/scheduler/SchedulerSearchDialog.tsx`

Create a scheduler-specific search that:
- Opens via a single search button or Cmd+K
- Searches instructors, customers, and bookings simultaneously
- When selecting an instructor: scrolls to that instructor in the grid
- When selecting a customer: navigates to booking wizard with customer pre-selected
- When selecting a booking: opens the booking detail dialog

```tsx
<CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
  <CommandInput placeholder="Lehrer, Kunde oder Buchung suchen..." />
  <CommandList>
    <CommandGroup heading="Lehrer">
      {/* Instructors with action to scroll-to-row */}
    </CommandGroup>
    <CommandGroup heading="Kunden">
      {/* Customers with action to start booking */}
    </CommandGroup>
    <CommandGroup heading="Buchungen">
      {/* Bookings with action to open detail */}
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

### 1.2 Compact View Switcher

**Edit:** `src/components/scheduler/SchedulerHeader.tsx`

Replace button group with ToggleGroup (no icons):

```tsx
// Before
<Button variant={viewMode === "daily" ? "secondary" : "ghost"}>
  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
  Tag
</Button>

// After
<ToggleGroup type="single" value={viewMode} onValueChange={onViewModeChange}>
  <ToggleGroupItem value="daily" className="px-3 h-7 text-xs">Tag</ToggleGroupItem>
  <ToggleGroupItem value="3days" className="px-3 h-7 text-xs">3T</ToggleGroupItem>
  <ToggleGroupItem value="weekly" className="px-3 h-7 text-xs">Woche</ToggleGroupItem>
</ToggleGroup>
```

### 1.3 Settings Menu Component

**New File:** `src/components/scheduler/SchedulerSettingsMenu.tsx`

Consolidate all filters into a single dropdown:

- Planning mode toggle
- Fullscreen toggle
- Role filter (Radio: All / Instructors / Office)
- Booking type filter (Checkboxes: Group, Private Paid, Private Open, Camp, Office)
- Availability filter (Checkboxes + hide unavailable)
- Sorting (Radio: Name A-Z, Name Z-A, Availability, Utilization)
- Show legend toggle
- Reset all filters button
- Active filter count badge on trigger button

### 1.4 Add Quick Action Button

Add a "+" button that opens the booking wizard directly:

```tsx
<Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate('/bookings/new')}>
  <Plus className="h-4 w-4" />
</Button>
```

### 1.5 Update SchedulerHeader Layout

**Edit:** `src/components/scheduler/SchedulerHeader.tsx`

Simplify structure:

```tsx
<div className="flex items-center gap-2 px-3 py-2">
  {/* Date Navigation: [<] [Date Picker] [>] */}
  <DateNavigation date={date} onDateChange={onDateChange} />
  
  <div className="w-px h-6 bg-border" />
  
  {/* View Switcher: [Tag][3T][Woche] */}
  <ViewSwitcher viewMode={viewMode} onViewModeChange={onViewModeChange} />
  
  <div className="flex-1" />
  
  {/* Universal Search Button */}
  <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
    <Search className="h-4 w-4 mr-2" />
    Suchen...
  </Button>
  
  {/* Settings Menu (with badge for active filters) */}
  <SchedulerSettingsMenu 
    filters={filters}
    onFiltersChange={onFiltersChange}
    activeFilterCount={activeFilterCount}
  />
  
  {/* Quick Add Button */}
  <Button variant="outline" size="icon" className="h-8 w-8">
    <Plus className="h-4 w-4" />
  </Button>
</div>
```

---

## Phase 2: Settings Menu Implementation

### 2.1 Filter State Management

**Edit:** `src/components/scheduler/SchedulerGrid.tsx`

Consolidate filter state into a single object:

```tsx
interface SchedulerFilters {
  // Role filter
  roleFilter: 'all' | 'instructor' | 'office_staff';
  
  // Booking type filters (multi-select)
  showGroup: boolean;
  showPrivatePaid: boolean;
  showPrivateOpen: boolean;
  showCamp: boolean;
  showOffice: boolean;
  
  // Availability
  showAvailable: boolean;
  showLimited: boolean;
  hideUnavailable: boolean;
  
  // Sorting
  sortBy: 'name_asc' | 'name_desc' | 'availability' | 'utilization';
  
  // Display options
  showLegend: boolean;
  isPlanningMode: boolean;
  isFullscreen: boolean;
}
```

### 2.2 Settings Menu Structure

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="icon" className="h-8 w-8 relative">
      <Settings className="h-4 w-4" />
      {activeFilterCount > 0 && (
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-500 text-[10px] text-white flex items-center justify-center">
          {activeFilterCount}
        </span>
      )}
    </Button>
  </DropdownMenuTrigger>
  
  <DropdownMenuContent align="end" className="w-64">
    <DropdownMenuLabel>Ansicht anpassen</DropdownMenuLabel>
    <DropdownMenuSeparator />
    
    {/* Mode Toggles */}
    <DropdownMenuCheckboxItem checked={isPlanningMode} onCheckedChange={...}>
      <Target className="mr-2 h-4 w-4" />
      Planungsmodus
    </DropdownMenuCheckboxItem>
    
    <DropdownMenuCheckboxItem checked={isFullscreen} onCheckedChange={...}>
      <Maximize className="mr-2 h-4 w-4" />
      Vollbild
    </DropdownMenuCheckboxItem>
    
    <DropdownMenuSeparator />
    
    {/* Role Filter Submenu */}
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Users className="mr-2 h-4 w-4" />
        Lehrer anzeigen
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={roleFilter} onValueChange={...}>
          <DropdownMenuRadioItem value="all">Alle</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="instructor">Nur Skilehrer</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="office_staff">Nur Büro</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    
    {/* Booking Types Submenu */}
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ListFilter className="mr-2 h-4 w-4" />
        Buchungstypen
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuCheckboxItem checked={showGroup}>Gruppenkurse</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showPrivatePaid}>Privat (bezahlt)</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showPrivateOpen}>Privat (offen)</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showCamp}>Skilager</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showOffice}>Büro-Schichten</DropdownMenuCheckboxItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    
    {/* Sorting Submenu */}
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ArrowUpDown className="mr-2 h-4 w-4" />
        Sortierung
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={sortBy} onValueChange={...}>
          <DropdownMenuRadioItem value="name_asc">Name (A-Z)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="name_desc">Name (Z-A)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="availability">Verfügbarkeit</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="utilization">Auslastung</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    
    <DropdownMenuSeparator />
    
    {/* Legend Toggle */}
    <DropdownMenuCheckboxItem checked={showLegend} onCheckedChange={...}>
      <BookOpen className="mr-2 h-4 w-4" />
      Legende anzeigen
    </DropdownMenuCheckboxItem>
    
    {/* Reset */}
    <DropdownMenuItem onSelect={resetAllFilters}>
      <RotateCcw className="mr-2 h-4 w-4" />
      Alle Filter zurücksetzen
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Phase 3: Smart Defaults and Dynamic Legend

### 3.1 Smart Defaults

**Default Filter State:**
- All roles visible
- All booking types visible
- No hiding of unavailable instructors (dim instead)
- Sort by Name A-Z
- Legend visible
- Planning mode OFF
- Fullscreen OFF

### 3.2 Dim Unavailable Instructors

**Edit:** `src/components/scheduler/InstructorRow.tsx` (or equivalent)

Instead of filtering out unavailable instructors, apply opacity:

```tsx
<div className={cn(
  "instructor-row",
  instructor.status === "unavailable" && "opacity-50"
)}>
```

### 3.3 Dynamic Legend

**Edit:** `src/components/scheduler/SchedulerLegend.tsx`

Pass visible booking types as prop and only render those:

```tsx
interface SchedulerLegendProps {
  visibleBlockTypes: BlockType[];
  className?: string;
}

export function SchedulerLegend({ visibleBlockTypes, className }: SchedulerLegendProps) {
  const legendItems = getLegendItems().filter(
    item => visibleBlockTypes.includes(item.type)
  );
  
  if (legendItems.length === 0) return null;
  
  return (
    <div className={cn("flex items-center gap-4 text-xs flex-wrap", className)}>
      <span className="text-muted-foreground font-medium">Legende:</span>
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded-sm", item.bg)} />
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
```

**Compute visible types in SchedulerGrid:**

```tsx
const visibleBlockTypes = useMemo(() => {
  const types = new Set<BlockType>();
  bookings.forEach(b => {
    if (b.type === 'group') types.add('group');
    else if (b.type === 'private' && b.paymentStatus === 'paid') types.add('private_paid');
    else if (b.type === 'private') types.add('private_unpaid');
    else if (b.type === 'camp') types.add('camp');
    else if (b.type === 'office_shift') types.add('office');
  });
  if (absences.length > 0) types.add('unavailable');
  return Array.from(types);
}, [bookings, absences]);
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/scheduler/SchedulerSearchDialog.tsx` | Create | Universal search for scheduler |
| `src/components/scheduler/SchedulerSettingsMenu.tsx` | Create | Consolidated settings dropdown |
| `src/components/scheduler/SchedulerHeader.tsx` | Refactor | Simplified layout |
| `src/components/scheduler/SchedulerGrid.tsx` | Edit | Add filter state management, compute visible types |
| `src/components/scheduler/SchedulerLegend.tsx` | Edit | Make legend dynamic |
| `src/lib/scheduler-colors.ts` | Edit | Add type field to BlockColorConfig |

---

## Implementation Checklist

**Phase 1: Quick Wins**
- [ ] Create `SchedulerSearchDialog.tsx` with instructor/customer/booking search
- [ ] Update `SchedulerHeader.tsx` to use ToggleGroup for view switcher
- [ ] Remove individual filter dropdowns from header
- [ ] Add settings button placeholder
- [ ] Add quick-add (+) button

**Phase 2: Settings Menu**
- [ ] Create `SchedulerSettingsMenu.tsx` component
- [ ] Move planning mode toggle into menu
- [ ] Move fullscreen toggle into menu
- [ ] Add role filter submenu
- [ ] Add booking type filter submenu
- [ ] Add sorting submenu
- [ ] Add legend toggle
- [ ] Add reset filters button
- [ ] Implement active filter count badge

**Phase 3: Smart Defaults**
- [ ] Set default filters to show everything
- [ ] Dim unavailable instructors instead of hiding
- [ ] Make legend dynamic based on visible booking types

---

## Expected Result

The simplified header will:
- Reduce visual complexity from 10+ to 6 elements
- Maintain all functionality via settings menu
- Improve discoverability with progressive disclosure
- Support power users with badge showing active filters
- Be mobile-friendly with fewer elements competing for space
