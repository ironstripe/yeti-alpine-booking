

# Fix: Missing Sidebar on Scheduler Page

## Root Cause

In `src/App.tsx`, the `/scheduler` route is defined **outside** the `AppLayout` wrapper (line 131) as a "public scheduler route for testing". This causes the page to render without the sidebar navigation.

```tsx
// Current (line 131) - OUTSIDE AppLayout
<Route path="/scheduler" element={<Scheduler />} />

// Protected routes (lines 159-201) - INSIDE AppLayout
<Route element={<AppLayout />}>
  <Route index element={<Dashboard />} />
  {/* ... other routes - but scheduler is missing! */}
</Route>
```

---

## Solution

Remove the standalone `/scheduler` route and add it inside the `AppLayout` protected routes block.

---

## Implementation

### File: `src/App.tsx`

**Remove lines 130-131:**
```tsx
{/* Public scheduler route for testing */}
<Route path="/scheduler" element={<Scheduler />} />
```

**Add inside the AppLayout block (after line 163):**
```tsx
<Route path="scheduler" element={<Scheduler />} />
```

---

## Updated Route Structure

```tsx
{/* Protected app routes */}
<Route element={<AppLayout />}>
  <Route index element={<Dashboard />} />
  <Route path="inbox" element={<Inbox />} />
  <Route path="inbox/:id" element={<InboxDetail />} />
  <Route path="bookings" element={<Bookings />} />
  <Route path="bookings/:id" element={<BookingDetail />} />
  <Route path="scheduler" element={<Scheduler />} />  {/* ← Add here */}
  <Route path="customers" element={<Customers />} />
  {/* ... rest of routes */}
</Route>
```

---

## Additional Fix: Scheduler Page Layout

The `Scheduler.tsx` page uses `h-screen` which may conflict with the `AppLayout` container. We need to adjust it to work within the layout's content area.

### File: `src/pages/Scheduler.tsx`

**Change from:**
```tsx
<div className="flex flex-col h-screen bg-background">
```

**To:**
```tsx
<div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)] bg-background">
```

This accounts for the header height and ensures proper scrolling within the layout.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Move `/scheduler` route inside `AppLayout` |
| `src/pages/Scheduler.tsx` | Adjust height calculation for layout compatibility |

