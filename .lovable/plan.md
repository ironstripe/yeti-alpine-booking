
# Fix: Remove non-existent `raw_payload` column from webhook insert

## Problem

The `webhook-email` edge function is failing with error:
```
Could not find the 'raw_payload' column of 'conversations' in the schema cache
```

The `conversations` table does not have a `raw_payload` column, but the INSERT statement on **line 46** of `supabase/functions/webhook-email/index.ts` still includes `raw_payload: payload`.

This is why new emails from Resend are received but never appear in the inbox -- the insert fails every time.

## Fix

**File:** `supabase/functions/webhook-email/index.ts`

Remove line 46 (`raw_payload: payload,`) from the insert object. No other changes needed.

The corrected insert will be:
```typescript
.insert({
  channel: "email",
  direction: "inbound",
  contact_identifier: senderEmail,
  contact_name: senderName,
  subject: subject,
  content: bodyText,
  status: "unread",
  external_message_id: messageId,
})
```

## Deployment

Redeploy the `webhook-email` edge function after the fix.

## Verification

After deployment, send a test email to your Resend inbound address and confirm the message appears in the inbox.
