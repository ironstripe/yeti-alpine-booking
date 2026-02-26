
# Resend Full Setup: API Key + Webhook + Sender Domain

## Overview

Three changes to fully configure Resend for your project:

1. **Update RESEND_API_KEY** with your new key
2. **Configure Resend webhook** to forward inbound emails to your existing `webhook-email` edge function
3. **Update sender domain** in all edge functions from `onboarding@resend.dev` to your verified domain

---

## Task 1: Update RESEND_API_KEY

Use the secrets tool to prompt you to enter the new Resend API key value, replacing the existing one.

---

## Task 2: Webhook URL for Inbound Emails

Your project already has the `webhook-email` edge function ready to receive inbound emails. The webhook URL to configure in Resend's dashboard is:

```
https://pgrlrsrjwyixndmrzhct.supabase.co/functions/v1/webhook-email
```

You need to add this URL in your **Resend dashboard** under **Webhooks** (or **Inbound Emails** settings) so that incoming emails are forwarded to your backend. No code changes needed -- the edge function already handles parsing Resend's payload format.

---

## Task 3: Update Sender Domain in Edge Functions

Once you have a verified domain in Resend, update the `from` address in these 3 edge functions:

**Files to update:**
- `supabase/functions/send-notification/index.ts` (line 32): Change `from: "Schneesportschule Malbun <onboarding@resend.dev>"` to your domain
- `supabase/functions/send-instructor-notification/index.ts` (line 44): Same change
- `supabase/functions/invite-instructor/index.ts` (line 278): Change `from: "Schneesportschule <onboarding@resend.dev>"` to your domain

I will ask you for the sender email address (e.g., `noreply@schneesportschule-malbun.li`) and update all three functions.

---

## Implementation Order

1. Ask for new RESEND_API_KEY value via secrets tool
2. Ask for your verified sender domain/email
3. Update all 3 edge functions with the new sender address
4. Provide you the webhook URL to paste into Resend's dashboard
