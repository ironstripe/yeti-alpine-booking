

# Normalize Phone Numbers Everywhere

## Problem

Phone numbers appear in many different formats across the app (see screenshot): `+4237929530`, `0786530102`, `076 426 47 15`, `+41797354063`, etc. The `normalizePhoneNumber` and `formatPhoneDisplay` utilities exist but are only used in a few places.

## Solution

Two changes:

### 1. Fix all display locations to use `formatPhoneDisplay()`

Replace raw phone output with `formatPhoneDisplay(phone)` in every component that shows a phone number. Also remove the local no-op `formatPhoneNumber()` functions.

**Files to update:**

| File | What to change |
|------|---------------|
| `CustomerTable.tsx` | Remove local `formatPhoneNumber`, use `formatPhoneDisplay` from phone-utils |
| `CustomerCards.tsx` | Remove local `formatPhoneNumber`, use `formatPhoneDisplay` from phone-utils |
| `CustomerInfoCard.tsx` | Use `formatPhoneDisplay(customer.phone)` in the display section |
| `BookingDetailDialog.tsx` | Use `formatPhoneDisplay(booking.customer.phone)` |
| `InstructorCard.tsx` | Use `formatPhoneDisplay(instructor.phone)` |
| `ProfileInfoCard.tsx` (instructors) | Use `formatPhoneDisplay(instructor.phone)` |
| `CommandBar.tsx` | Use `formatPhoneDisplay()` for phone display |
| `ConfirmationOptions.tsx` | Use `formatPhoneDisplay(state.customer.phone)` |

### 2. Clean up existing database data (one-time SQL migration)

Run a migration that normalizes all existing phone numbers in the `customers` and `instructors` tables. This strips spaces, converts `079...` to `+4179...`, and converts `0041...` to `+41...`.

```text
Database tables to clean:
- customers.phone
- instructors.phone
- customer_contacts.phone
```

The migration will use a PL/pgSQL function to apply the same normalization logic as the TypeScript utility:
- Remove all non-digit characters except `+`
- `00xx...` becomes `+xx...`
- `0xx...` (local) becomes `+41xx...`
- No prefix becomes `+41` prefix

### 3. Add normalization on save in remaining forms

Ensure `normalizePhoneNumber()` is called before saving in any form that currently misses it (instructor forms already do this, but double-check all paths).

## Result

- All stored phone numbers will be in compact international format: `+41797354063`
- All displayed phone numbers will be formatted with spaces: `+41 79 735 40 63`
- New entries will be normalized on input blur (already works in most forms)

