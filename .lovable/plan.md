
# Refactor Booking Step 1 to Scheduler-Centric UI (V3)

## Overview

This is a major refactoring of the booking wizard that:
1. Merges participant assignment INTO Step 1 (currently in Step 2)
2. Renames Step 2 to "Customer & Billing" (just the payer)
3. Adds a popover on slot click for participant + settings assignment
4. Updates the cart to show participant names
5. Adds fullscreen toggle to the scheduler

The current 3-step flow becomes:
- **Step 1**: Product, Scheduler, Participants (merged)
- **Step 2**: Customer (payer only)
- **Step 3**: Summary & Payment

---

## Task 1: Update WizardProgress Labels

**File**: `src/components/bookings/wizard/WizardProgress.tsx`

Change step labels:
- Step 1: "Produkt & Teilnehmer"
- Step 2: "Kunde & Zahlung"
- Step 3: "Abschluss"

---

## Task 2: Create SlotBookingPopover Component

**New file**: `src/components/bookings/wizard/SlotBookingPopover.tsx`

A Popover (using Radix `Popover`) that appears when clicking a free slot in the MiniSchedulerGrid. Contains:

1. **Participant assignment** -- multi-select dropdown searching `customer_participants` linked to the pre-selected customer (from Schnellbuchung). Includes "+ Neuen Teilnehmer erstellen" button that opens a minimal inline form (first_name, last_name, birth_date, skill_level).
2. **Skill level dropdown** -- to set/override level for selected participants.
3. **Duration dropdown** -- defaults to 2h for private, shows calculated duration for drag selections.
4. **Meeting point dropdown** -- reuses existing `MEETING_POINTS` data.
5. **"In den Warenkorb" button** -- disabled until at least one participant is assigned. On click, creates a cart item with the slot data + participant IDs and marks the slot as "in-cart".

Props:
- `anchorEl` / trigger position
- `instructorId`, `instructorName`, `date`, `startTime`, `endTime` (from slot click)
- `preselectedCustomerId` (from Schnellbuchung)
- `onAddToCart(cartItemData)` callback
- `onClose`

For **group courses**, the popover additionally shows a list of matching group courses for the selected week.

---

## Task 3: Update MiniSchedulerGrid for Popover Integration

**File**: `src/components/bookings/wizard/MiniSchedulerGrid.tsx`

- On single click (no Ctrl), instead of just toggling, open the `SlotBookingPopover` anchored to the clicked cell.
- On drag selection, open the popover after mouse-up with the full time range.
- Add visual state for "in-cart" slots (e.g., green background with cart icon) distinct from "selected" (blue).
- Add a new prop `cartSlots` to receive already-carted slots for visual rendering.
- Display basic info on booked/occupied slots inline (customer name, lesson type) using existing booking data from `useSchedulerData`.
- Add tooltip on hover for occupied slots showing full details.

---

## Task 4: Add Participant Selection to Step1ProductCart

**File**: `src/components/bookings/wizard/Step1ProductCart.tsx`

Refactor to a two-column layout:
- **Left column** (filters/navigation): BookingType, Sport, Calendar, Tagesplanung accordion, optional filters.
- **Right column**: The scheduler grid (MiniSchedulerGrid) taking up most of the space.

Move participant-related UI from Step1CustomerParticipant into this step:
- When a customer is selected via Schnellbuchung, their participants are available in the slot popover.
- The Schnellbuchung section stays at the top.

Add fullscreen toggle button for the scheduler (expand to viewport, ESC to close).

---

## Task 5: Simplify Step2AssignCustomer

**File**: `src/components/bookings/wizard/Step2AssignCustomer.tsx`

This step now ONLY handles:
- Customer (payer) selection -- reuses existing `CustomerSearch` and `CustomerPayerCard`
- No participant assignment (moved to Step 1)

Remove the `Step1CustomerParticipant` import and replace with just the customer selection portion.

---

## Task 6: Update Cart Display

**Files**: `src/components/bookings/wizard/Step1ProductCart.tsx`, `BookingWizard.tsx`

Each cart item now displays:
- Product type + sport + duration
- Assigned participant name(s)
- Instructor name + date/time
- Price

Example: "Privatstunde Ski 2h (Anna Muller) | P. Egli, Di 3. Marz 10-12 | CHF 150"

The "Weiter" button in the footer is renamed to "Weiter zum Kunden >" and is disabled if any cart item has no participants assigned.

---

## Task 7: Update canProceed Logic

**File**: `src/contexts/BookingWizardContext.tsx`

- **Step 1**: All cart items must have `assignedParticipantIds.length > 0` in addition to existing product/date/instructor validation.
- **Step 2**: Only requires `customer !== null` (participants already assigned in step 1).

---

## Task 8: Group Course Auto-Select Week

**File**: `src/components/bookings/wizard/SlotBookingPopover.tsx` (or MiniSchedulerGrid)

When `productType === "group"` and a day is clicked:
- Auto-select the full Monday-Friday week containing that day
- Show the popover with opt-out checkboxes per day
- List matching group courses for that week

---

## Task 9: Fullscreen Scheduler Toggle

**File**: `src/components/bookings/wizard/Step1ProductCart.tsx`

- Add a fullscreen toggle button (Maximize icon) in the scheduler header
- When active, the scheduler fills the viewport using a fixed/absolute overlay
- ESC key closes fullscreen mode
- A visible exit banner at the top when in fullscreen

---

## Task 10: Cleanup Redundant Components

Remove or hide from Step1:
- "Ctrl+Click tip" text (replaced by popover workflow)
- "Einzeln / Zeitraum" toggle (no longer needed)
- "Mo-Fr / Ganze Woche" quick buttons from the calendar (now handled by group auto-select)
- Zeitfenster start/end time dropdowns (now part of popover)

---

## State Changes Summary

**CartItem** gets extended usage of `assignedParticipantIds` -- now required before proceeding.

No new database tables or migrations needed. All changes are frontend-only.

---

## Risk & Complexity Notes

- This is a large refactoring touching ~8-10 files with significant UI changes
- The SlotBookingPopover is the most complex new component, combining participant search, inline creation, and multi-field configuration
- Backward compatibility with edit mode (`loadTicketForEditing`) must be preserved
- The Schnellbuchung (customer pre-selection) flow needs careful integration -- participants only available if a customer is pre-selected
- Multi-day drag selections need to correctly populate all days in a single cart item
- Price calculation must work correctly with the new participant-first flow

## Implementation Order

1. WizardProgress labels (trivial)
2. SlotBookingPopover (core new component)
3. MiniSchedulerGrid updates (popover integration + in-cart visuals)
4. Step1ProductCart layout refactor (two columns + participant integration)
5. Step2AssignCustomer simplification
6. Cart display updates
7. canProceed logic update
8. Group course auto-select week
9. Fullscreen toggle
10. Cleanup redundant components
