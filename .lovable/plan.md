
# Materialausleihe fur Schneesportlehrer

## Overview

A full equipment rental management system for ski school instructors, covering inventory management (settings), checkout/check-in workflows (office + instructor portal), and automated reminders.

---

## Task 1: Database Schema

Create 4 new tables via migration + enums + RLS policies.

**Enums:**
- `inventory_condition`: 'Neu', 'Ok', 'Ausgebleicht', 'Ersetzen'
- `inventory_item_status`: 'Verfugbar', 'Ausgeliehen', 'Verloren', 'In Reparatur'
- `rental_status`: 'Wartet auf Quittierung', 'Ausgeliehen', 'Teilweise zuruckgegeben', 'Abgeschlossen'
- `rental_item_status`: 'Ausgeliehen', 'Ruckgabe initiiert', 'Zuruckgegeben', 'Verloren gemeldet'
- `return_condition`: 'Ok', 'Beschadigt', 'Verloren'

**Tables:**

1. **inventory_categories** (id, name, description, created_at)
2. **inventory_items** (id, category_id FK, name, inventory_number UNIQUE, size, color, condition, status, created_at, updated_at)
3. **inventory_rentals** (id, instructor_id FK to instructors, office_user_id FK to auth.users, rental_period_start, rental_period_end, status, created_at, updated_at)
4. **inventory_rental_items** (id, rental_id FK, item_id FK, status, returned_at, return_condition, notes, created_at)

**RLS:** All tables restricted to admin/office via `is_admin_or_office()`. Additionally, instructors can read their own rentals + rental items and update rental item status (for return initiation) and rental status (for confirmation).

---

## Task 2: Settings UI - Inventar

**Files:**
- New: `src/pages/SettingsInventory.tsx` -- main settings page with two tabs
- New: `src/components/settings/inventory/InventoryItemsTab.tsx` -- table + CRUD for items
- New: `src/components/settings/inventory/InventoryCategoriesTab.tsx` -- table + CRUD for categories
- New: `src/components/settings/inventory/InventoryItemFormModal.tsx` -- form dialog for creating/editing items
- New: `src/hooks/useInventory.ts` -- React Query hooks for inventory CRUD

**Changes:**
- `src/components/settings/SettingsLayout.tsx`: Add "Inventar" nav item with `Boxes` icon pointing to `/settings/inventory`
- `src/App.tsx`: Add route `settings/inventory` -> `SettingsInventory`, add import

---

## Task 3: Office Rental Management Page

**Files:**
- New: `src/pages/Rentals.tsx` -- main rental management page showing instructors with rental counts and "Neue Ausleihe" buttons
- New: `src/components/rentals/NewRentalDialog.tsx` -- modal for creating a rental (date range, item search/add, send to instructor)
- New: `src/components/rentals/RentalDetailDialog.tsx` -- view/manage existing rental details
- New: `src/components/rentals/ReturnCheckDialog.tsx` -- dialog for office to confirm returns and set conditions
- New: `src/hooks/useRentals.ts` -- React Query hooks for rental CRUD

**Changes:**
- `src/components/layout/AppSidebar.tsx`: Add "Materialausleihe" nav item with `Boxes` icon pointing to `/rentals`
- `src/App.tsx`: Add route `rentals` -> `Rentals`, add import

---

## Task 4: Instructor Portal - Rental Confirmation

**Files:**
- New: `src/pages/InstructorRentals.tsx` -- "Mein Material" page showing current rentals, pending confirmations, and return initiation

**Changes:**
- `src/components/instructor-portal/InstructorLayout.tsx`: Add "Material" nav item with `Boxes` icon pointing to `/instructor/rentals`
- `src/App.tsx`: Add route `instructor/rentals` -> `InstructorRentals`

**Confirmation flow:**
- Page shows pending rentals (status = 'Wartet auf Quittierung') with item list and "Empfang bestatigen" button
- Clicking updates `inventory_rentals.status` to 'Ausgeliehen' and each `inventory_rental_items.status` to 'Ausgeliehen'

---

## Task 5: Return Flow

**Instructor side** (in `InstructorRentals.tsx`):
- Active rentals show checkboxes per item
- "Ruckgabe initiieren" button updates selected items to 'Ruckgabe initiiert'

**Office side:**
- Dashboard (`src/components/dashboard/ActionRequiredBox.tsx`): Add a new alert type for pending returns ("Ruckgabe von [Name] zur Kontrolle")
- `ReturnCheckDialog.tsx`: For each item, set return_condition (Ok/Beschadigt/Verloren) with optional notes
- "Ruckgabe abschliessen" button: updates items to 'Zuruckgegeben', sets `returned_at`, updates item inventory status back to 'Verfugbar' (or 'Verloren'), recalculates rental status

---

## Task 6: Notifications

**Checkout notification:**
- When office creates a rental, insert into `instructor_notification_queue` with a new notification type `instructor.rental.checkout`
- The existing `send-instructor-notification` edge function will be extended with a new template for rental confirmation

**Return reminder:**
- New edge function: `supabase/functions/rental-reminders/index.ts`
- Runs daily via pg_cron
- Checks for rentals where `rental_period_end` is in 7 days with unreturned items
- Sends reminder notification to instructor

---

## Task 7: Dashboard Integration

**File:** `src/components/dashboard/ActionRequiredBox.tsx`

Add a new query to check for `inventory_rental_items` with status = 'Ruckgabe initiiert'. Display as actionable alert: "Ruckgabe von [Instructor Name] zur Kontrolle" with a link to the rentals page.

---

## Implementation Order

1. Database migration (enums, tables, RLS)
2. React Query hooks (`useInventory.ts`, `useRentals.ts`)
3. Settings UI (inventory management)
4. Office rental page + new rental dialog
5. Instructor portal page (confirmation + return initiation)
6. Office return check dialog
7. Dashboard integration
8. Notification extension + reminder cron job
9. Routing + navigation updates (App.tsx, sidebar, settings nav, instructor nav)

---

## Technical Notes

- All tables use `is_admin_or_office()` for write access, with instructor-specific read/update policies
- Inventory item `status` is automatically updated when rented/returned via application logic (not triggers, to keep it simple)
- The `instructor_id` in `inventory_rentals` references `instructors.id` (not auth.users), consistent with the rest of the codebase
- Size options are hardcoded as a constant: `['S', 'M', 'L', 'XL', 'XXL', 'XXXL']`
- The rental reminder edge function uses the existing Resend API key for email delivery
