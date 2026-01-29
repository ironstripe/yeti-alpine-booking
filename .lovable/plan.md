

# Complete Cancellation System with Customer Credits

## Overview

Implement a full cancellation workflow with AGB fee enforcement, Kulanz documentation, customer credit management, and partial cancellation support.

---

## Current State Analysis

| Component | Status |
|-----------|--------|
| `tickets` table | Exists - has `status`, `total_amount`, `paid_amount` |
| `ticket_items` table | Exists - has `status`, `date`, `line_total` |
| `cancellation_policy` table | Exists - has `free_cancellation_hours` (24h), `late_cancellation_percent` (100%) |
| `payments` table | Exists - tracks payments |
| BookingActionsMenu | Exists - has placeholder `handleCancel` |
| Customer credits | Does not exist |
| Booking cancellations | Does not exist |

---

## Part 1: Database Schema

### 1.1 Customer Credits Table

```sql
CREATE TABLE customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  
  -- Amounts
  original_amount DECIMAL(10,2) NOT NULL,
  remaining_amount DECIMAL(10,2) NOT NULL,
  
  -- Source tracking
  source_type TEXT NOT NULL CHECK (source_type IN ('cancellation', 'goodwill', 'overpayment', 'other')),
  source_reference_id UUID,
  description TEXT NOT NULL,
  
  -- No expiry (unbegrenzt gültig)
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'fully_used', 'refunded')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.2 Credit Usage Tracking Table

```sql
CREATE TABLE customer_credit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id UUID NOT NULL REFERENCES customer_credits(id),
  ticket_id UUID REFERENCES tickets(id),
  amount_used DECIMAL(10,2) NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  used_by UUID
);
```

### 1.3 Booking Cancellations Table

```sql
CREATE TABLE booking_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  
  -- What was cancelled
  cancellation_type TEXT NOT NULL CHECK (cancellation_type IN ('full', 'partial')),
  cancelled_item_ids UUID[],
  
  -- Timing
  cancelled_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_by UUID,
  hours_before_start DECIMAL(5,1),
  
  -- Reason (free text)
  cancellation_reason TEXT NOT NULL,
  
  -- Financial
  original_booking_amount DECIMAL(10,2) NOT NULL,
  cancelled_amount DECIMAL(10,2) NOT NULL,
  amount_already_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Fees
  fee_according_to_agb DECIMAL(10,2) NOT NULL,
  fee_charged DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Kulanz documentation
  waiver_reason TEXT,
  
  -- Credit handling
  credit_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  credit_action TEXT CHECK (credit_action IN ('customer_credit', 'refund_iban', 'refund_terminal', 'none')),
  customer_credit_id UUID REFERENCES customer_credits(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.4 Refund Requests Table

```sql
CREATE TABLE refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  credit_id UUID NOT NULL REFERENCES customer_credits(id),
  cancellation_id UUID REFERENCES booking_cancellations(id),
  
  amount DECIMAL(10,2) NOT NULL,
  refund_method TEXT NOT NULL CHECK (refund_method IN ('iban', 'terminal')),
  iban TEXT,
  account_holder TEXT,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.5 Database Triggers

```sql
-- Auto-update credit remaining_amount on usage
CREATE OR REPLACE FUNCTION update_credit_remaining()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE customer_credits
  SET 
    remaining_amount = remaining_amount - NEW.amount_used,
    status = CASE 
      WHEN remaining_amount - NEW.amount_used <= 0 THEN 'fully_used'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = NEW.credit_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Part 2: File Structure

### New Files to Create

| File | Purpose |
|------|---------|
| `src/components/bookings/CancellationDialog.tsx` | Main cancellation modal |
| `src/hooks/useCancellation.ts` | Cancellation mutation hook |
| `src/hooks/useCustomerCredits.ts` | Fetch/manage customer credits |
| `src/lib/cancellation-utils.ts` | Fee calculation logic |
| `src/components/customers/detail/CustomerCreditsCard.tsx` | Display credits on customer page |
| `src/components/bookings/wizard/CreditUsageSection.tsx` | Apply credits in booking |

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/bookings/BookingActionsMenu.tsx` | Wire up cancellation dialog |
| `src/pages/BookingDetail.tsx` | Add cancellation button |
| `src/pages/CustomerDetail.tsx` | Add credits card |
| `src/components/bookings/wizard/Step4Summary.tsx` | Add credit application |

---

## Part 3: Cancellation Dialog Component

### UI Structure

```text
┌──────────────────────────────────────────────────────────────┐
│ Buchung stornieren                                     [X]   │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ T-2024-00123                                             │ │
│ │ Max Mustermann · Privatstunde Ski                        │ │
│ │ Samstag, 08. Februar 2025                                │ │
│ │ Buchungsbetrag: CHF 250.00                               │ │
│ │ Bereits bezahlt: CHF 250.00                              │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ⚠️ Achtung: Stornierung weniger als 24 Stunden vor          │
│    Kursbeginn. Gemäss AGB ist der volle Betrag fällig.      │
│                                                              │
│ ─────────────────────────────────────────────────────────    │
│                                                              │
│ Art der Stornierung (for multi-day only)                     │
│ ○ Vollständige Stornierung (alle Tage)                       │
│ ○ Teilstornierung (einzelne Tage)                            │
│   ☐ Samstag, 08.02.2025                                      │
│   ☐ Sonntag, 09.02.2025                                      │
│                                                              │
│ ─────────────────────────────────────────────────────────    │
│                                                              │
│ Stornierungsgrund *                                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [Free text textarea]                                     │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ─────────────────────────────────────────────────────────    │
│                                                              │
│ Stornogebühr                                                 │
│ ○ Gemäss AGB: CHF 250.00                                     │
│ ○ Kulanz: Keine Gebühr                                       │
│ ○ Angepasst: [___] CHF                                       │
│                                                              │
│ Kulanz-Begründung * (if fee reduced within 24h)              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [Why is fee being waived?]                               │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ─────────────────────────────────────────────────────────    │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ Finanzielle Auswirkung                      (blue card) │  │
│ │ Stornierter Betrag:         CHF 250.00                  │  │
│ │ Davon bezahlt:              CHF 250.00                  │  │
│ │ Stornogebühr:               CHF   0.00                  │  │
│ │ ─────────────────────────────────────────────           │  │
│ │ Guthaben für Kunde:         CHF 250.00 ✓               │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                              │
│ Was soll mit dem Guthaben passieren?                         │
│ ○ Als Kundenguthaben speichern (für zukünftige Buchungen)    │
│ ○ 🏦 Rücküberweisung auf Bankkonto (IBAN)                    │
│ ○ 💳 Rückerstattung am Terminal (Desk)                       │
│                                                              │
│ (IBAN fields if selected)                                    │
│ IBAN *: [CH93 0076 2011 6238 5295 7]                        │
│ Kontoinhaber *: [Max Mustermann]                             │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                        [Abbrechen]  [Stornierung durchführen]│
└──────────────────────────────────────────────────────────────┘
```

---

## Part 4: Cancellation Calculation Logic

### `src/lib/cancellation-utils.ts`

```typescript
interface CancellationCalculation {
  isWithin24h: boolean;
  hoursBeforeStart: number;
  cancelledAmount: number;
  paidForCancelledPortion: number;
  feeAccordingToAgb: number;
  feeCharged: number;
  creditAmount: number;
}

export function calculateCancellation(
  ticket: TicketWithDetails,
  options: {
    type: 'full' | 'partial';
    cancelledItemIds: string[];
    feeOption: 'agb' | 'waived' | 'custom';
    customFee: number;
  }
): CancellationCalculation {
  // 1. Determine first cancelled date/time
  // 2. Calculate hours before start
  // 3. Calculate cancelled amount (full or per-item)
  // 4. Determine paid portion
  // 5. Calculate AGB fee (100% if <24h, 0 otherwise)
  // 6. Apply actual fee based on option
  // 7. Calculate credit = paid - fee
}
```

### Key Rules

| Scenario | Fee |
|----------|-----|
| Cancel >24h before | 0% |
| Cancel <24h before | 100% (per AGB) |
| Kulanz override | Documented waiver required |

---

## Part 5: Customer Credits Display

### CustomerDetail Integration

Add `CustomerCreditsCard` to right column:

```text
┌─────────────────────────────────────────────┐
│ 💰 Kundenguthaben                           │
├─────────────────────────────────────────────┤
│ Verfügbares Guthaben                        │
│ CHF 250.00                    [Anwenden]    │
├─────────────────────────────────────────────┤
│ Guthaben-Historie                           │
│ • 08.02.2025 - Stornierung T-2024-00123     │
│   +CHF 250.00 | Aktiv                       │
│ • 15.01.2025 - Gutschrift (Kulanz)          │
│   +CHF 50.00 | Aufgebraucht                 │
└─────────────────────────────────────────────┘
```

---

## Part 6: Apply Credits in Booking Wizard

### Step4Summary Integration

```text
┌─────────────────────────────────────────────┐
│ 💰 Kundenguthaben verfügbar                 │
│ CHF 250.00                                  │
│ ☑ Guthaben verwenden                        │
│   Betrag: [250.00] CHF                      │
│   (Max: CHF 250.00)                         │
└─────────────────────────────────────────────┘

Kursbetrag:           CHF 180.00
Guthaben verwendet:  -CHF 180.00
─────────────────────────────────
Zu zahlen:            CHF   0.00
```

---

## Part 7: Hooks Implementation

### `useCancellation.ts`

```typescript
export function useCancellation() {
  return useMutation({
    mutationFn: async (params: CancellationParams) => {
      // 1. Create booking_cancellations record
      // 2. Update ticket status to 'storno'
      // 3. Update ticket_items status to 'storno'
      // 4. Create customer_credit if creditAction = 'customer_credit'
      // 5. Create refund_request if creditAction = 'refund_iban' or 'refund_terminal'
      // 6. Notify instructor if assigned
    }
  });
}
```

### `useCustomerCredits.ts`

```typescript
export function useCustomerCredits(customerId: string) {
  // Fetch all credits for customer
  return useQuery({...});
}

export function useApplyCredit() {
  return useMutation({
    // Insert into customer_credit_usage
    // Trigger updates remaining_amount
  });
}
```

---

## Part 8: RLS Policies

```sql
-- customer_credits: Admin/office can manage
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage credits"
  ON customer_credits FOR ALL
  USING (is_admin_or_office(auth.uid()));

-- booking_cancellations: Admin/office can manage
ALTER TABLE booking_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/office can manage cancellations"
  ON booking_cancellations FOR ALL
  USING (is_admin_or_office(auth.uid()));
```

---

## Implementation Sequence

| Phase | Tasks |
|-------|-------|
| **1. Database** | Create all 4 tables + triggers + RLS |
| **2. Utils** | Create `cancellation-utils.ts` with calculation logic |
| **3. Hooks** | Create `useCancellation.ts`, `useCustomerCredits.ts` |
| **4. Dialog** | Build `CancellationDialog.tsx` with full UI |
| **5. Integration** | Wire up BookingActionsMenu + BookingDetail |
| **6. Credits UI** | Add CustomerCreditsCard to CustomerDetail |
| **7. Booking Credits** | Add credit usage to Step4Summary |

---

## Testing Checklist

### Cancellation Flow
- Full cancellation >24h before: No fee, full credit
- Full cancellation <24h before: 100% fee, no credit
- Partial cancellation: Pro-rata calculation
- Kulanz waiver: Requires documented reason
- Credit action: Customer credit / IBAN refund / Terminal refund

### Customer Credits
- Credits display on customer detail page
- Credit history shows source and usage
- Credits never expire

### Booking with Credits
- Available credits shown during booking
- Can apply partial or full credit
- Credit usage tracked in database
- Credit status updates to 'fully_used' when depleted

### Edge Cases
- Cancel unpaid booking: No credit generated
- Cancel partially paid: Credit = paid portion - fee
- Multiple cancellations same customer: Credits accumulate

