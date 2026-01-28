

# Test Mode for Instructor Email Notifications

## Overview

Implement a Test Mode in the `send-instructor-notification` Edge Function to safely test the email notification system without sending emails to real instructors. All emails will be redirected to a single test address when enabled.

---

## Current State

The notification system is implemented as an **Edge Function** (`supabase/functions/send-instructor-notification/index.ts`), not a database function. This is actually better because:
- Easier to modify and version control
- No need for Supabase dashboard access
- Can use environment variables for configuration

---

## Implementation Strategy

### Option A: Hardcoded Configuration (Simple)
Add test mode variables directly in the Edge Function code:

```typescript
// =================== TEST MODE CONFIGURATION ===================
const TEST_MODE = true; // Set to `false` to go live
const TEST_EMAIL_RECIPIENT = "ivo.streiff71@gmail.com";
// ===============================================================
```

### Option B: Environment Variable (Recommended)
Use a Supabase secret for flexibility without code changes:

```typescript
const TEST_MODE = Deno.env.get("INSTRUCTOR_EMAIL_TEST_MODE") === "true";
const TEST_EMAIL_RECIPIENT = Deno.env.get("INSTRUCTOR_EMAIL_TEST_RECIPIENT") || "ivo.streiff71@gmail.com";
```

**I recommend Option A for simplicity during development, then migrate to Option B for production.**

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/send-instructor-notification/index.ts` | Add test mode configuration and logic |

---

## Technical Changes

### 1. Add Test Mode Configuration (lines 4-7)

```typescript
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const BATCH_SIZE = 10;

// =================== TEST MODE CONFIGURATION ===================
const TEST_MODE = true; // Set to `false` to go live
const TEST_EMAIL_RECIPIENT = "ivo.streiff71@gmail.com";
// ===============================================================
```

### 2. Modify Email Sending Logic (around line 172)

Replace the current email sending call:

```typescript
// Current code:
const emailResult = await sendEmailWithResend(
  instructorData.email,
  subject,
  fullHtml,
  textBody || undefined
);
```

With test mode logic:

```typescript
// Determine final recipient and subject based on test mode
const finalRecipient = TEST_MODE ? TEST_EMAIL_RECIPIENT : instructorData.email;
const finalSubject = TEST_MODE ? `[TEST] ${subject}` : subject;

// Add test mode info to email body if in test mode
const finalBody = TEST_MODE 
  ? `
    <div style="background: #fff3cd; padding: 10px; margin-bottom: 20px; border-radius: 4px; border: 1px solid #ffc107;">
      <strong>⚠️ TEST MODE</strong><br>
      Original recipient: ${instructorData.email}<br>
      Instructor: ${instructorData.first_name} ${instructorData.last_name}
    </div>
    ${fullHtml}
  `
  : fullHtml;

// Send the email
const emailResult = await sendEmailWithResend(
  finalRecipient,
  finalSubject,
  finalBody,
  textBody || undefined
);
```

### 3. Update Log Messages (line 183)

```typescript
console.log(`Email sent to ${finalRecipient}${TEST_MODE ? ` (original: ${instructorData.email})` : ''}: ${emailResult.id}`);
```

### 4. Update Email Logs Entry (lines 195-204)

Store the original recipient in logs even when in test mode:

```typescript
await supabase.from("email_logs").insert({
  template_id: template.id,
  recipient_email: TEST_MODE ? `${TEST_EMAIL_RECIPIENT} (original: ${instructorData.email})` : instructorData.email,
  recipient_name: `${instructorData.first_name} ${instructorData.last_name}`,
  subject: finalSubject,
  status: "sent",
  sent_at: new Date().toISOString(),
  provider_message_id: emailResult.id,
  metadata: {
    ...notification.template_data,
    test_mode: TEST_MODE,
    original_recipient: instructorData.email,
  },
});
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| `[TEST]` prefix | All test emails have `[TEST]` prepended to subject |
| Original recipient banner | Yellow info box at top of email showing who would have received it |
| Preserved logging | Email logs still record the original intended recipient |
| Console visibility | Log output shows both test and original recipient |
| Single toggle | One boolean to switch between test and live mode |

---

## Testing Checklist

1. **Deploy with TEST_MODE = true**
   - The Edge Function will be auto-deployed on save

2. **Trigger a notification**
   - Assign an instructor to a booking in the app
   - Or manually insert a row in `instructor_notification_queue`

3. **Process the queue**
   - Call the Edge Function manually or wait for cron job

4. **Verify in test inbox**
   - Check `ivo.streiff71@gmail.com`
   - Email should have `[TEST]` prefix
   - Yellow banner should show original recipient

5. **Verify no email to real instructor**
   - Confirm the instructor's real inbox is empty

6. **Check logs**
   - Query `email_logs` table to see entries with `test_mode: true`

7. **Go live (when ready)**
   - Change `TEST_MODE = false`
   - Redeploy the Edge Function

---

## Rollback

To disable test mode and go live:
1. Change `const TEST_MODE = true;` to `const TEST_MODE = false;`
2. Save the file (auto-deploys)

Or if using environment variables (Option B):
1. Remove or set the `INSTRUCTOR_EMAIL_TEST_MODE` secret to `"false"`

