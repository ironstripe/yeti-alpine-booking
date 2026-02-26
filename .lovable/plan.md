

# Fix webhook-email Edge Function for Resend Payload Format

## Problem

The Resend inbound email webhook wraps email data inside `payload.data`, but the current code reads from `payload` directly. This causes `senderEmail`, `subject`, and `content` to be empty, failing the `NOT NULL` constraint on the `conversations` table.

Additionally, the `conversations` table lacks an `external_message_id` column, causing a second error (`PGRST204`).

## Changes

### 1. Fix payload extraction in `supabase/functions/webhook-email/index.ts`

- Detect Resend format via `payload.type === 'email.received'`
- Extract fields from `payload.data` when Resend format is detected
- Use `subject` as fallback for missing body text
- Fix `messageId` field name (`message_id` for Resend)
- Remove `external_message_id` from the insert (column doesn't exist in the table)
- Keep backward compatibility for other webhook providers

### 2. Add `external_message_id` column to `conversations` table

- Run a migration to add the missing column so message deduplication works

### 3. Deploy the updated edge function

## Technical Details

Updated extraction logic in `webhook-email/index.ts`:

```typescript
const isResendInbound = payload.type === 'email.received' && payload.data;
const emailData = isResendInbound ? payload.data : payload;

const senderEmail = emailData.from?.email || emailData.from || "";
const senderName = emailData.from?.name || extractNameFromEmail(senderEmail);
const subject = emailData.subject || "";
// Resend inbound webhook doesn't include body text - use subject as fallback
// TODO: Retrieve full body via Resend API if needed
const bodyText = emailData.text || emailData.html || emailData["body-plain"] || subject || "No body";
const messageId = emailData.message_id || emailData.messageId || emailData["Message-Id"] || emailData.id || crypto.randomUUID();
```

Migration SQL:

```sql
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS external_message_id text;
```

