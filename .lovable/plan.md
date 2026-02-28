

# Fix: AI Suggests Group Courses Even When Private Lessons Are Requested

## Problem
The system prompt in `process-ai-message` always maps participant age/level to group course names (e.g., "windel-wedel", "anfaenger-gruppenkurs") regardless of whether the customer explicitly requested private lessons. The `booking.product_type` is correctly set to `"private"`, but the per-participant `product_suggestion` still shows a group course name like "Anfänger-Gruppenkurs".

## Root Cause
Lines 57-63 of the system prompt unconditionally instruct the AI to suggest group courses based on age and skill level. There is no branching logic for when `product_type` is `"private"`.

## Solution

### 1. Update System Prompt in `process-ai-message`
**File:** `supabase/functions/process-ai-message/index.ts`

Modify the product suggestion rules (lines 57-68) to be conditional on the requested product type:

```text
**WICHTIG - TEILNEHMER-SPEZIFISCHE BUCHUNGEN:**
Jeder Teilnehmer kann individuelle Buchungsdetails haben.

**PRODUKT-VORSCHLAG REGELN:**
Wenn der Kunde explizit Privatstunden/Privatunterricht anfragt:
- Setze product_type: "private" auf Booking- UND Teilnehmer-Ebene
- Setze product_suggestion: "privatstunde"
- Frage NICHT nach Gruppenkursen

Nur wenn der Kunde Gruppenkurse anfragt ODER keinen Typ spezifiziert:
- beginner + Alter 3-4 -> product_suggestion: "windel-wedel"
- beginner + Alter 5+ -> product_suggestion: "anfaenger-gruppenkurs"
- intermediate -> product_suggestion: "fortgeschrittenen-gruppenkurs"
- advanced/expert -> product_suggestion: "experten-kurs"

Wenn unklar, setze product_type: "unknown" und frage nach.
```

### 2. Update Example in System Prompt
The example at lines 160-181 only shows a group booking scenario. Add a private lesson example so the AI learns the correct pattern:

```json
{
  "name": "Participant",
  "age": 7,
  "skill_level": "beginner",
  "booking": {
    "product_type": "private",
    "product_suggestion": "privatstunde",
    "dates": [{"date": "2026-03-21"}, {"date": "2026-03-22"}]
  }
}
```

### 3. Update `product_suggestion` Schema Description
**File:** `supabase/functions/process-ai-message/index.ts` (line 275-277)

Change the description to include private lesson as a valid suggestion:
```
"Vorgeschlagenes Produkt basierend auf Anfrage, Alter und Level 
(z.B. 'privatstunde', 'windel-wedel', 'anfaenger-gruppenkurs', 
'fortgeschrittenen-gruppenkurs')"
```

### 4. Update ExtractionPanel Display
**File:** `src/components/inbox/ExtractionPanel.tsx`

Update the `formatProductName` function (or equivalent display logic) to properly label "privatstunde" as "Privatstunde" in the UI, so it renders correctly alongside group course names.

### 5. Redeploy
Deploy `process-ai-message` edge function after changes.

## Files Modified
1. `supabase/functions/process-ai-message/index.ts` -- system prompt rules, example, schema description
2. `src/components/inbox/ExtractionPanel.tsx` -- product name formatting (if needed)

