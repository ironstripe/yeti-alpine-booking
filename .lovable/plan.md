

# Allow Adding Participants Without a Customer First

## Problem

The current `SlotBookingPopover` requires a customer to be selected via "Schnellbuchung" before any participants can be added. It shows a blocking message: "Bitte zuerst einen Kunden uber Schnellbuchung auswahlen". This defeats the purpose of the V3 refactoring where the natural flow is: select product, add participants, THEN assign a customer/payer.

## Solution

Introduce **local (temporary) participants** that live only in wizard state -- no database writes until a customer is assigned in Step 2. When a customer IS pre-selected, the existing DB-backed participant flow continues to work as before.

---

## Changes

### 1. Add Local Participant Support to Context

**File**: `src/contexts/BookingWizardContext.tsx`

- Add a `localParticipants` array to `BookingWizardState` storing temporary participant objects (first_name, last_name, birth_date, skill_level, sport) with generated UUIDs.
- Add `addLocalParticipant()` and `removeLocalParticipant()` actions to the context.
- These local participants are used for `assignedParticipantIds` in cart items just like DB participants.

### 2. Refactor SlotBookingPopover to Support Both Modes

**File**: `src/components/bookings/wizard/SlotBookingPopover.tsx`

**When NO customer is pre-selected:**
- Show existing local participants (from context) as selectable checkboxes.
- Show a "+ Neuen Teilnehmer erstellen" form that creates a **local participant** (stored in wizard state, not DB).
- The form collects: first_name, last_name (optional), birth_date, skill_level.
- No database call needed.

**When a customer IS pre-selected (Schnellbuchung):**
- Continue fetching DB participants for that customer (existing behavior).
- ALSO show local participants if any were created before the customer was selected.
- The "+ Neuen Teilnehmer erstellen" form creates a DB-backed participant (existing behavior).

**Remove** the blocking "Bitte zuerst einen Kunden" message entirely.

### 3. Persist Local Participants to DB in Step 2

**File**: `src/components/bookings/wizard/Step2AssignCustomer.tsx`

- When a customer is selected in Step 2, automatically save any `localParticipants` to the `customer_participants` table linked to that customer.
- Replace local participant IDs in all cart items' `assignedParticipantIds` with the newly created DB IDs.
- Clear `localParticipants` from state after successful persistence.
- Show a toast confirming participants were linked to the customer.

### 4. Update Cart Display to Show Local Participant Names

**File**: `src/components/bookings/wizard/Step1ProductCart.tsx`

- When rendering cart item participant names, look up from both DB participants (`selectedParticipants`) and `localParticipants` in state.
- Display participant names regardless of whether they are local or DB-backed.

---

## Flow Summary

```text
Step 1: Click slot -> Popover opens -> Create "Anna (6J, Beginner)" as local participant
     -> Assign to slot -> Add to cart -> Cart shows "Privatstunde Ski 2h (Anna)"
     -> Optionally use Schnellbuchung to pre-select customer (loads their DB participants too)

Step 2: Select customer "Familie Muller" -> Local participants auto-saved to DB
     -> Cart item IDs updated to real DB IDs

Step 3: Summary with all real data
```

## Technical Details

- `LocalParticipant` interface: `{ id: string, first_name: string, last_name: string | null, birth_date: string, skill_level: string | null, sport: "ski" | "snowboard" }`
- IDs use `crypto.randomUUID()` with a `local-` prefix to distinguish from DB UUIDs
- The `canProceed` logic for Step 1 stays the same (checks `assignedParticipantIds.length > 0`)
- The `canProceed` logic for Step 2 adds a check: if `localParticipants.length > 0`, customer is required before proceeding (to trigger the DB save)
