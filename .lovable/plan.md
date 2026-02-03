
# Fix: Missing Navigation in Scheduler View

## Problem Identified

The scheduler page shows **no navigation** - neither the desktop sidebar (≥768px) nor the mobile header/bottom nav (<768px) is visible. This indicates a CSS breakpoint issue where the viewport width is causing both to be hidden.

Looking at the code:
- `AppSidebar`: `hidden md:flex` (shows ≥768px)
- `MobileHeader`: `md:hidden` (shows <768px)  
- `BottomNav`: `md:hidden` (shows <768px)

At exactly 768px, there's a visual gap where transitions may cause issues.

## Root Cause

The Tailwind `md` breakpoint (768px) creates a hard cutoff. The Lovable preview panel width may be exactly at this boundary, or the scheduler's viewport-relative height (`h-[calc(100vh-...)]`) may be interfering with the flex layout.

## Solution

### 1. Add explicit minimum width to sidebar (ensures it shows at md+)

**File:** `src/components/layout/AppSidebar.tsx`

Change line 101 to ensure the sidebar is part of the document flow:
```typescript
className={cn(
  "hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 ease-in-out shrink-0",
  collapsed ? "w-16" : "w-[250px]"
)}
```
Add `shrink-0` to prevent the sidebar from being compressed to 0 width.

### 2. Fix Scheduler page height calculation

**File:** `src/pages/Scheduler.tsx`

The current height uses viewport units which may conflict with the parent flex layout:
```typescript
// Current (problematic)
<div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)] bg-background">

// Fixed - use flex-1 to fill available space within the layout
<div className="flex flex-col flex-1 min-h-0 bg-background">
```

### 3. Ensure AppLayout main content area constrains properly

**File:** `src/components/layout/AppLayout.tsx`

Update the main content wrapper to handle overflow correctly:
```typescript
// Line 66-68: Update main wrapper
<main className="flex-1 overflow-auto min-h-0">
  <div className="h-full">{children ?? <Outlet />}</div>
</main>
```

Remove the fixed padding wrapper that may cause layout issues for full-height pages like the scheduler.

### 4. Add conditional padding for pages that need it

**File:** `src/components/layout/AppLayout.tsx`

Create a route-aware padding system:
```typescript
const location = useLocation();
const isFullHeightPage = ['/scheduler'].includes(location.pathname);

<main className="flex-1 overflow-auto min-h-0">
  <div className={cn(
    "h-full",
    !isFullHeightPage && "p-4 md:p-6 pb-24 md:pb-6"
  )}>
    {children ?? <Outlet />}
  </div>
</main>
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/layout/AppSidebar.tsx` | Add `shrink-0` class to prevent compression |
| `src/pages/Scheduler.tsx` | Replace `h-[calc(100vh-...)]` with `flex-1 min-h-0` |
| `src/components/layout/AppLayout.tsx` | Add `min-h-0` to main, route-aware padding |

## Technical Notes

- `shrink-0` prevents flexbox from shrinking the sidebar below its set width
- `min-h-0` is required for nested flex containers to allow proper overflow scrolling
- Using `flex-1` instead of viewport units lets the scheduler fill its container without breaking the layout
- Route-aware padding allows full-height pages (scheduler) to use their entire container while other pages get proper padding
