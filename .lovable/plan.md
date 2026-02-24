

# Refactor Booking Wizard to Product-First Flow with Shopping Cart

## Overview

This refactoring replaces the current linear "Customer-First" wizard (Customer -> Product -> Summary) with a flexible "Product-First" flow using a shopping cart concept:

**New Flow:** Product+Cart (with optional Customer Shortcut) -> Assign Participants + Customer -> Summary

This is a large-scale refactor affecting ~15 files across context, components, hooks, and pages.

---

## Architecture Changes

### New State Model: Cart-Based

The core change is introducing a `CartItem` concept. Instead of storing a single product configuration in the wizard state, we store an array of cart items. Each cart item captures one product configuration (type, dates, times, instructor, etc.).

```text
BookingWizardState (new)
+---------------------------+
| cartItems: CartItem[]     |  <-- NEW: array of configured products
| activeCartItemId: string  |  <-- NEW: which item is being edited
| customer: Customer | null |
| selectedParticipants: []  |
| ... (shared fields)       |
+---------------------------+

CartItem
+---------------------------+
| id: string                |
| productType: private|group|
| sport: ski|snowboard|null |
| selectedDates: string[]   |
| timeSlot: string | null   |
| duration: number | null   |
| instructorId: string|null |
| instructor: Instructor    |
| assignLater: boolean      |
| meetingPoint: string|null |
| selectedGroupId: string   |
| groupCourseType: string   |
| ... (all product config)  |
| assignedParticipantIds: []|  <-- filled in Step 2
+---------------------------+
```

### Step Flow

```text
Step 1: Product + Cart
+-------------------------------------------+
| [Optional: Customer Shortcut search bar]  |
|                                           |
| [Product configuration area]              |
|  - Type (Private/Group)                   |
|  - Dates, Time, Sport                     |
|  - Instructor/Group selection             |
|  - Mini-scheduler, Period planner         |
|                                           |
| [Cart Summary sidebar/bar]               |
|  - List of added items                    |
|  - "Add another product" button           |
|  - "Assign Participants ->" button        |
+-------------------------------------------+

Step 2: Assign Participants + Customer
+-------------------------------------------+
| [Customer section - if not pre-selected]  |
|  - Search/Create customer                 |
|  - CustomerPayerCard (if selected)        |
|                                           |
| [Participant Assignment per Cart Item]    |
|  - CartItem 1: drag/select participants   |
|  - CartItem 2: drag/select participants   |
|  - Add new participants inline            |
+-------------------------------------------+

Step 3: Summary (mostly unchanged)
+-------------------------------------------+
| Summary cards iterate over cart items     |
| Price breakdown per cart item             |
| Payment, Discount, Confirmations          |
+-------------------------------------------+
```

---

## Implementation Plan (Phased)

### Phase 1: Refactor State Management

**File: `src/contexts/BookingWizardContext.tsx`**

1. Define `CartItem` interface with all product-related fields extracted from current `BookingWizardState`
2. Add `cartItems: CartItem[]` and `activeCartItemId: string | null` to state
3. Add cart management functions:
   - `addCartItem()` - creates new empty cart item and sets it active
   - `removeCartItem(id)` - removes item from cart
   - `setActiveCartItem(id)` - switches which item is being configured
   - `updateActiveCartItem(partial)` - updates current active item's fields
   - `assignParticipantToCartItem(cartItemId, participantId)` - Step 2 assignment
4. Modify existing setters (setProductType, setSelectedDates, setTimeSlot, etc.) to operate on the active cart item instead of root state
5. Update `canProceed()`:
   - Step 1: At least one cart item with valid product config
   - Step 2: Customer selected + all cart items have at least one participant assigned
   - Step 3: Payment method selected
6. Keep existing advanced features (mini-scheduler, period planner, multi-group proposal, participant-specific booking) working within the active cart item context
7. Maintain backward compatibility for scheduler prefill and edit mode

### Phase 2: Redesign Step 1 (Product + Cart)

**File: `src/components/bookings/wizard/Step1ProductCart.tsx`** (new file, replaces Step1CustomerParticipant)

1. Add optional "Schnellbuchung" customer search bar at the top
   - Uses existing `CustomerSearch` component
   - When a customer is selected, fetch their participants and pre-load into state
   - Collapsible/dismissable if not needed
2. Move all product configuration UI from current `Step2ProductAllocation.tsx` into this step:
   - Product type selection (Private/Group)
   - Sport selection
   - Calendar / date picker
   - Time slot selection
   - Mini-scheduler grid
   - Period day planner
   - Group course selector
   - Meeting point, language, instructor preferences
3. Add persistent cart summary bar/sidebar showing:
   - List of items in cart with brief descriptions
   - "Add another product" button (loops back to empty product config)
   - Item count badge
4. Footer buttons: "Add another product" and "Assign Participants ->"

### Phase 3: Redesign Step 2 (Assign Participants + Customer)

**File: `src/components/bookings/wizard/Step2AssignCustomer.tsx`** (new file, replaces Step1CustomerParticipant for this context)

1. Customer section (skipped if already selected via shortcut):
   - Reuse `CustomerPayerCard` and `CustomerSearch`
   - Once customer selected, auto-load their participants
2. Participant assignment section:
   - For each cart item, show a card with:
     - Product summary (type, dates, time)
     - Participant assignment area (checkboxes/toggles from existing `ParticipantListCard`)
     - Lunch/vegetarian options for group courses
   - Pre-populate participants if customer was selected via shortcut
3. Keep existing participant management features:
   - Add guest participants
   - Inline participant creation
   - Lunch day selection per participant

### Phase 4: Adapt Step 3 (Summary)

**File: `src/components/bookings/wizard/Step4Summary.tsx`** (modify existing)

1. `BookingSummaryCards`: Iterate over `state.cartItems` instead of single product state
   - Show one "Kurs" card per cart item
   - Each card shows its assigned participants
2. `PriceBreakdown`: Sum prices across all cart items
   - Show per-item line items
   - Combined discount and total
3. Keep payment, discount, and confirmation sections unchanged

### Phase 5: Adapt Booking Creation Hook

**File: `src/hooks/useCreateBooking.ts`** (modify existing)

1. Iterate over `state.cartItems` to generate `ticket_items`
2. Each cart item produces its own set of ticket_items (per participant x per date)
3. Calculate total across all cart items
4. Handle mixed product types (some items private, some group) in a single ticket
5. Keep existing pricing logic per cart item type (private lesson rates, group course tiers, lunch)
6. Keep period booking metadata creation per cart item

### Phase 6: Update Supporting Components

1. **`WizardProgress.tsx`**: Update step labels
   - Step 1: "Produkt & Warenkorb"
   - Step 2: "Teilnehmer & Kunde"  
   - Step 3: "Abschluss"

2. **`BookingWizard.tsx`** (page): 
   - Render new step components
   - Update prefill logic to add items to cart instead of setting root state
   - Keep scheduler integration: prefill creates a cart item from scheduler data
   - Keep edit mode: loads existing ticket items as cart items

3. **`CustomerPayerCard.tsx`**: No changes needed, reused in Step 2

4. **`ParticipantListCard.tsx`**: Minor adaptation to work per-cart-item context

---

## Technical Details

### Cart Item ID Generation
Each cart item gets a unique ID via `crypto.randomUUID()` for tracking.

### Active Cart Item Pattern
All existing product-related setters (setProductType, setSelectedDates, etc.) will be refactored to update the active cart item:

```typescript
const setProductType = (type) => {
  setState(prev => ({
    ...prev,
    cartItems: prev.cartItems.map(item =>
      item.id === prev.activeCartItemId
        ? { ...item, productType: type }
        : item
    ),
  }));
};
```

### Scheduler Integration
When the wizard opens from the scheduler with instructor + appointments:
1. A cart item is created automatically with the prefilled data
2. The cart item is set as active
3. User proceeds normally from Step 1

### Edit Mode
When editing an existing ticket:
1. Each ticket_item group (by product type + instructor) becomes a cart item
2. Cart is pre-populated, customer is locked
3. User starts at Step 2

### Backward Compatibility
- The `useCreateBooking` hook's interface changes to read from `cartItems` array
- All existing advanced features (multi-group proposal, period planner, participant-specific booking) work within a single cart item context
- The `useUpdateBooking` hook needs minimal changes since edit mode still works per-item

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/contexts/BookingWizardContext.tsx` | **Major refactor** | Add CartItem type, cart management, redirect setters to active item |
| `src/components/bookings/wizard/Step1ProductCart.tsx` | **New file** | Product config + cart UI + optional customer shortcut |
| `src/components/bookings/wizard/Step2AssignCustomer.tsx` | **New file** | Customer selection + per-cart-item participant assignment |
| `src/components/bookings/wizard/Step4Summary.tsx` | **Modify** | Iterate over cart items |
| `src/components/bookings/wizard/BookingSummaryCards.tsx` | **Modify** | Per-cart-item summary cards |
| `src/components/bookings/wizard/PriceBreakdown.tsx` | **Modify** | Sum prices across cart items |
| `src/components/bookings/wizard/WizardProgress.tsx` | **Modify** | Update step labels |
| `src/pages/BookingWizard.tsx` | **Modify** | New step components, prefill -> cart, navigation |
| `src/hooks/useCreateBooking.ts` | **Modify** | Iterate cart items for ticket_item creation |
| `src/components/bookings/wizard/Step1CustomerParticipant.tsx` | **Delete** | Replaced by Step2AssignCustomer |
| `src/components/bookings/wizard/Step2ProductAllocation.tsx` | **Delete** | Replaced by Step1ProductCart |

---

## Risk Mitigation

- **Incremental approach**: Each phase is self-contained; we can validate after each phase
- **Feature preservation**: All advanced features (mini-scheduler, period planner, multi-group proposals, participant-specific booking) are preserved within cart item context
- **Edit mode**: Converted to cart-based model but functionally equivalent
- **Scheduler integration**: Prefill creates a cart item instead of setting root state

