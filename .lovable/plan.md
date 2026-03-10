

# Fix: Auto-Select Newly Created Participants in Booking Wizard

## Problem
When creating a new participant in the "Slot konfigurieren" panel (SlotBookingPopover), the participant appears in the list but is NOT automatically selected (checkbox unchecked). The user must manually click the participant before clicking "In den Warenkorb". If they don't realize this, the cart item has no participants assigned, and "Weiter zum Kunden" stays disabled.

## Root Cause
`addLocalParticipant()` generates the participant ID internally using `crypto.randomUUID()`. The SlotBookingPopover cannot predict this ID to auto-add it to `selectedParticipantIds`.

## Solution
Generate the ID **before** calling `addLocalParticipant`, so the popover can immediately add it to the selected list.

### Changes

**File 1: `src/contexts/BookingWizardContext.tsx`**
- Modify `addLocalParticipant` to accept a full `LocalParticipant` (including `id`) instead of `Omit<LocalParticipant, "id">`
- This allows the caller to control the ID generation

**File 2: `src/components/bookings/wizard/SlotBookingPopover.tsx`**
- In `handleCreateLocalParticipant`:
  1. Generate the ID upfront: `const id = "local-" + crypto.randomUUID()`
  2. Pass the full participant (with id) to `addLocalParticipant`
  3. Immediately add the ID to `selectedParticipantIds` so the participant is auto-selected

### Technical Details

In `BookingWizardContext.tsx`, change the signature and implementation:
```typescript
// Before
const addLocalParticipant = (participant: Omit<LocalParticipant, "id">) => {
  setState((prev) => {
    const newParticipant = { ...participant, id: `local-${crypto.randomUUID()}` };
    return { ...prev, localParticipants: [...prev.localParticipants, newParticipant] };
  });
};

// After
const addLocalParticipant = (participant: LocalParticipant) => {
  setState((prev) => ({
    ...prev,
    localParticipants: [...prev.localParticipants, participant],
  }));
};
```

In `SlotBookingPopover.tsx`:
```typescript
const handleCreateLocalParticipant = () => {
  const id = `local-${crypto.randomUUID()}`;
  addLocalParticipant({
    id,
    first_name: newParticipant.first_name,
    last_name: newParticipant.last_name || null,
    birth_date: newParticipant.birth_date || "2015-01-01",
    skill_level: newParticipant.skill_level || null,
    sport: (sport || "ski") as "ski" | "snowboard",
  });
  // Auto-select the new participant
  setSelectedParticipantIds((prev) => [...prev, id]);
  resetNewParticipantForm();
};
```

Also update the type signature in the context interface from `Omit<LocalParticipant, "id">` to `LocalParticipant`.

## Files Modified
1. `src/contexts/BookingWizardContext.tsx` -- change `addLocalParticipant` signature to accept full object with `id`
2. `src/components/bookings/wizard/SlotBookingPopover.tsx` -- generate ID upfront and auto-select new participant

