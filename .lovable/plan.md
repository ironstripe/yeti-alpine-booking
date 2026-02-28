

# Fix: AI Asks for Already-Extracted Data

## Problem
When the customer provides email, phone, address, and birth dates in their message, the AI correctly extracts this data but then asks for it again in the reply. This happens because:

1. **`formatExtractedForPrompt()`** (line 739-777) only includes customer name, participant name/age/level, and booking info -- it omits customer email, phone, address, and participant birth dates
2. The AI generating the reply never sees these extracted fields, so it treats them as missing

## Solution

### 1. Expand `formatExtractedForPrompt()` to include all extracted fields
**File:** `supabase/functions/generate-reply/index.ts` (lines 739-777)

Add customer email, phone, and address to the "BEREITS EXTRAHIERTE DATEN" section:

```typescript
// Customer section - add email, phone, address
if (data.customer) {
  const c = data.customer;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name;
  if (name) parts.push(`Kunde: ${name}`);
  if (c.email) parts.push(`E-Mail: ${c.email}`);
  if (c.phone) parts.push(`Telefon: ${c.phone}`);
  if (c.address) {
    const addr = c.address;
    const addrStr = [addr.street, addr.zip, addr.city, addr.country].filter(Boolean).join(", ");
    if (addrStr) parts.push(`Adresse: ${addrStr}`);
  }
}
```

Add participant birth_date and discipline:

```typescript
// Participants - include birth_date
const ageInfo = p.age ? `${p.age}J` : p.birth_date ? `Geb. ${p.birth_date}` : "";
const level = p.skill_level && p.skill_level !== "unknown" ? p.skill_level : "";
const discipline = p.discipline || "";
return [name, ageInfo, level, discipline].filter(Boolean).join(" ");
```

### 2. Filter `missing_information` against actually-extracted data
**File:** `supabase/functions/generate-reply/index.ts` (around line 343)

After loading `extractedData`, filter the `missing_information` list to remove fields that were actually extracted:

```typescript
// Remove fields from missingInfo that are actually present in extractedData
let missingInfo = extractedData.missing_information || [];
if (extractedData.customer?.email) {
  missingInfo = missingInfo.filter(f => f !== "customer_contact" && f !== "customer_email");
}
if (extractedData.customer?.phone) {
  missingInfo = missingInfo.filter(f => f !== "customer_contact" && f !== "customer_phone");
}
if (extractedData.customer?.address?.street) {
  missingInfo = missingInfo.filter(f => f !== "customer_address");
}
if (extractedData.participants?.every(p => p.birth_date || p.age)) {
  missingInfo = missingInfo.filter(f => f !== "participant_birthdates");
}
if (extractedData.participants?.every(p => p.first_name || p.name)) {
  missingInfo = missingInfo.filter(f => f !== "participant_names");
}
```

### 3. Add explicit instruction to not re-ask for provided data
**File:** `supabase/functions/generate-reply/index.ts` (in `buildReplySystemPrompt`, around line 676)

Add a rule:

```text
**KRITISCH: Frage NIEMALS nach Daten, die unter "BEREITS EXTRAHIERTE DATEN" aufgelistet sind.
Wenn dort E-Mail, Adresse, Telefon oder Geburtsdatum stehen, sind diese bereits bekannt.**
```

## Files Modified
1. `supabase/functions/generate-reply/index.ts` -- expand extracted data display, filter missing fields, add instruction

## Deployment
Redeploy `generate-reply` edge function after changes.

