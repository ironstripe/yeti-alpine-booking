
# Printable Equipment Rental Reports

## Overview

Add a "Report" button to the Materialausleihe page that opens a dialog with instructor selection, then generates a print-styled report matching the original paper "Ausleihformular" layout using `useReactToPrint` (already installed).

---

## Changes

### 1. Update Rental Item Query to Include Color

**File**: `src/hooks/useRentals.ts`

The current `item:item_id(...)` select does not include `color`. Update both `useRentals` and `useInstructorRentals` queries:

```
item:item_id(id, name, inventory_number, size, color, category:category_id(name))
```

Also update the `RentalItemWithDetails` interface to add `color` to the item type.

### 2. Create Printable Report Dialog Component

**New file**: `src/components/rentals/RentalReportDialog.tsx`

A dialog (following the same pattern as `AttendanceListPreview.tsx`) containing:
- An instructor dropdown (`Select`) with "Alle Lehrer" as default plus all instructors who have active rentals (status = "Ausgeliehen")
- A "Report erstellen & Drucken" button that triggers `useReactToPrint`
- A hidden `ref`-based print area containing the formatted report

**Report layout (print area):**
- Per instructor: header with name, then items grouped by category (Bekleidung, Material, Diverses, etc.)
- Table columns: Artikel | Nr./Detail | Grosse/Farbe | Anzahl | Datum Ausleihe | Visum | Datum Ruckgabe | Visum
- Each instructor section uses `page-break-after: always` for multi-instructor reports
- Print-only CSS: hide app chrome, clean borders, compact font sizes

### 3. Add Report Button to Rentals Page

**File**: `src/pages/Rentals.tsx`

- Import `RentalReportDialog` and add a `Printer` icon button next to the existing "Neue Ausleihe" button in the `PageHeader` actions
- Add state for `reportDialogOpen`

---

## Data Flow

1. Dialog opens, fetches rentals via existing `useRentals()` hook
2. Filters to only rentals/items with status "Ausgeliehen"
3. Groups items by instructor, then by category
4. `useReactToPrint` prints the ref container with print-optimized CSS

---

## Technical Notes

- Uses `useReactToPrint` (already a dependency) with `contentRef` pattern, consistent with `AttendanceListPreview`, `LunchListPreview`, etc.
- No new database queries needed -- reuses the existing `useRentals()` hook and filters client-side
- Print styles use `@media print` within a `style` tag inside the print container, plus inline styles for the table structure
- "Alle Lehrer" generates one section per instructor with CSS page breaks between them
