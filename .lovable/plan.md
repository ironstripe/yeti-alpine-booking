
Goal: Fix instructor invitations so “Einladen” reliably results in a delivered email, and the recipient can actually access the instructor portal. Right now the backend successfully creates the invited user, but no email is delivered.

What I found (from logs + DB):
- The backend function `invite-instructor` is being called successfully (HTTP 200) and returns `{ success: true }`.
- The function logs show: “Successfully invited instructor …”.
- The invited user record exists in the authentication system (`auth.users`) with `invited_at` set and `last_sign_in_at` still null → this confirms the invite was created, but the email never reached the recipient.
- The current invite flow relies on the platform’s built-in invitation email delivery (triggered by `inviteUserByEmail`). In your case, that delivery step is unreliable/blocked.
- Additionally, the function uses a hardcoded redirect URL (`https://yeti-alpine-booking.lovable.app/instructor`). In Lovable Cloud there are separate “test/preview” and “live/published” environments; hardcoding the published URL can cause “invite created in test, link opens live” problems later. Even if the email arrives, the link can land in the wrong environment.

High-level solution
1) Stop relying on the built-in invite email delivery.
2) Generate the invite/reset link ourselves in the backend function and send it via your existing Resend integration (which we can also log and troubleshoot).
3) Add a small “Set password” page so invited instructors can set a password and later log in normally (your current Login page is password-only and “Forgot password” is not implemented yet).

Important constraint to be aware of (Resend test mode)
- Your Resend setup is currently in “testing/sandbox” mode. I can see recent `email_logs` errors like:
  “You can only send testing emails to your own email address (ivo.streiff71@gmail.com). To send emails to other recipients, please verify a domain…”
- That means sending invitations to `ivo@shopable.one` will fail until you verify a sending domain in Resend and switch the From address to that domain.
- However, after we implement the Resend-based invitation, invitations to the allowed testing recipient should work immediately, and invitations to other addresses will fail with a clear error message (instead of “success but no email”).

Implementation plan (code changes)

A) Backend function: `supabase/functions/invite-instructor/index.ts`
Replace the current step:
- `supabaseAdmin.auth.admin.inviteUserByEmail(...)`

With a manual + transparent flow:
1. Authenticate caller + role check (keep as-is).
2. Load instructor by `instructor_id` (keep as-is).
3. Determine the correct redirect base URL dynamically:
   - Prefer `req.headers.get("origin")` (this will be preview URL when you invite from preview, and published URL when you invite from published).
   - Fallback to the published URL if origin is missing.
4. Find-or-create the auth user:
   - First try to find by email using `auth.admin.listUsers()` with pagination (the current code only checks the first page; that can break once you have >50 users).
   - If not found: create user with `auth.admin.createUser({ email, user_metadata: {...} })`.
5. Ensure the “teacher” role is present:
   - Use `upsert` into `user_roles` with `onConflict: "user_id,role"` so it’s idempotent.
6. Generate an action link:
   - Use `auth.admin.generateLink({ type: "recovery" (or "invite"), email, options: { redirectTo: `${origin}/set-password?next=/instructor` } })`
   - This gives us a link we can email ourselves.
7. Send the email using Resend (same approach as `send-notification`):
   - If Resend rejects the recipient (sandbox limitation), return a 400/500 with a friendly, actionable message (e.g. “Email system is in test mode; please verify a domain to send to external addresses.”).
8. Write an `email_logs` record for invitations:
   - `template_id: null`
   - `subject: "Einladung Lehrer-Portal"`
   - `metadata: { type: "instructor.invite", instructor_id, email, redirect_to, environment_hint }`
   - Update status `sent/failed` depending on Resend response.

Expected outcome:
- The “Einladen” button will only show success if the email was accepted by Resend.
- If it cannot be sent (e.g. to `ivo@shopable.one` while in Resend test mode), the UI will show a meaningful error instead of silently “success”.

B) Add “Set Password” page (new file): `src/pages/SetPassword.tsx`
Purpose: let invited instructors set a password after clicking the invite link.

Behavior:
- On load: check if the user is authenticated (AuthContext session present). If not:
  - Show “Link ungültig oder abgelaufen” + button to go to `/login`.
- Show a form: new password + confirm (validate min length).
- On submit: call `supabase.auth.updateUser({ password: newPassword })`.
- On success: toast “Passwort gesetzt” and navigate to `next` param (default `/instructor`).

C) Register the route in `src/App.tsx`
- Add a public route:
  - `<Route path="/set-password" element={<SetPassword />} />`

D) (Optional but recommended) Improve the invite UX text in the office UI
In `src/hooks/useInviteInstructor.ts` and/or the toast:
- If backend returns an explicit Resend sandbox error, show a short explanation:
  - “E-Mail konnte nicht gesendet werden (Testmodus). Domain-Verifizierung erforderlich.”

Testing checklist (end-to-end)
1) In preview (test environment):
   - Invite to `ivo.streiff71@gmail.com`.
   - Confirm you receive the email.
   - Click the link → you land on `/set-password`.
   - Set password → redirected to `/instructor`.
   - Sign out → verify you can sign in on `/login` with email+password.
2) Domain verification step (needed for real instructor emails):
   - Verify a domain in Resend and change the “From” address accordingly (we can keep it configurable if you want).
3) Invite to `ivo@shopable.one`:
   - Confirm email is delivered.
   - Confirm link takes them to the correct environment (preview vs published depending on where you clicked “Einladen”).

Notes / risks addressed
- Fixes the “success but no email received” problem by moving delivery to Resend where we can see explicit errors and log outcomes.
- Fixes the “wrong environment redirect” risk by deriving redirect URL from request origin.
- Makes invited instructors usable long-term by giving them a real password flow (your current UI otherwise has no password reset and no magic-link login button).

If you approve this plan, I’ll implement:
- The updated invitation backend function (Resend + logging + dynamic redirect).
- The `/set-password` page + route wiring.
- Small UI/toast improvements so failures are obvious and actionable.
