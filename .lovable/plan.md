

# Fix: Retrieve Email Body from Resend API

## Problem
Resend inbound webhooks intentionally do **not** include the email body (html/text). They only send metadata (from, subject, to, email_id, attachments). That's why every incoming email only shows the subject as the message content.

## Solution
After receiving the webhook, call the **Resend Received Emails API** to fetch the full email body before storing it in the database.

**API endpoint:** `GET https://api.resend.com/emails/receiving/{email_id}`
**Auth:** `Authorization: Bearer RESEND_API_KEY`

## Changes

**File:** `supabase/functions/webhook-email/index.ts`

1. After detecting the Resend format and extracting `emailData`, use the `email_id` from `emailData` to call the Resend API
2. Fetch the full email content (html + text) from `https://api.resend.com/emails/receiving/{email_id}`
3. Use the retrieved `text` or `html` as the body, falling back to `subject` only if the API call fails
4. Keep the existing fallback chain for non-Resend providers

### Updated flow:

```text
Webhook received
  -> Detect Resend format
  -> Extract email_id from payload.data
  -> Call GET /emails/receiving/{email_id} with RESEND_API_KEY
  -> Use response.text or response.html as body content
  -> Fall back to subject if API call fails
  -> Store in conversations table
  -> Trigger AI processing
```

### Technical detail:

```typescript
// After extracting emailData...
let bodyText = "";

if (isResendInbound && emailData.email_id) {
  // Fetch full email body from Resend API
  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailResponse = await fetch(
      `https://api.resend.com/emails/receiving/${emailData.email_id}`,
      { headers: { Authorization: `Bearer ${resendApiKey}` } }
    );
    if (emailResponse.ok) {
      const fullEmail = await emailResponse.json();
      bodyText = fullEmail.text || stripHtml(fullEmail.html || "") || "";
    }
  } catch (e) {
    console.error("Failed to fetch email body from Resend:", e);
  }
}

// Fallback for non-Resend or if API call failed
if (!bodyText) {
  bodyText = emailData.text || emailData.html || emailData["body-plain"]
    || stripHtml(emailData["body-html"] || "") || subject || "No body";
}
```

No database changes needed. Only the edge function is updated. It will be redeployed automatically.

