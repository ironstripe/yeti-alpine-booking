

# Create set-booking-confirmation Edge Function

## Overview

This edge function allows instructors to confirm or decline booking assignments from their instructor portal. It validates the instructor's identity, ensures they're authorized to modify the specific booking, updates the `ticket_items` table, and logs the activity to `instructor_activity_log`.

---

## Implementation Details

### 1. Create Edge Function

**File:** `supabase/functions/set-booking-confirmation/index.ts`

### Request Body
```typescript
{
  ticketItemId: string;      // UUID of the ticket_items record
  action: 'confirm' | 'decline';
  reason?: string;           // Required if action is 'decline'
}
```

### Response
```typescript
// Success
{ success: true }

// Error
{ success: false, error: string }
```

---

## Authorization Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. Extract Authorization header                                 │
│    └─> Return 401 if missing                                    │
├─────────────────────────────────────────────────────────────────┤
│ 2. Validate JWT and get user                                    │
│    └─> Return 401 if invalid token                              │
├─────────────────────────────────────────────────────────────────┤
│ 3. Find instructor by user's email                              │
│    └─> Return 403 if not an instructor                          │
├─────────────────────────────────────────────────────────────────┤
│ 4. Fetch ticket_item and verify instructor_id matches           │
│    └─> Return 404 if not found                                  │
│    └─> Return 403 if instructor not assigned to this booking    │
├─────────────────────────────────────────────────────────────────┤
│ 5. Validate action ('confirm' or 'decline')                     │
│    └─> Return 400 if invalid action                             │
│    └─> Return 400 if decline without reason                     │
├─────────────────────────────────────────────────────────────────┤
│ 6. Update ticket_items                                          │
│    - instructor_confirmation = 'confirmed' or 'declined'        │
│    - instructor_confirmed_at (if confirm)                       │
│    - instructor_declined_at + instructor_decline_reason (if     │
│      decline)                                                   │
├─────────────────────────────────────────────────────────────────┤
│ 7. Log to instructor_activity_log                               │
│    - activity_type: 'booking_confirmed' or 'booking_declined'   │
│    - description: Human-readable message                        │
│    - created_by_user_id: Auth user ID                           │
├─────────────────────────────────────────────────────────────────┤
│ 8. Return success response                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Key Patterns from Existing Codebase

1. **CORS Headers** - Required for browser calls:
   ```typescript
   const corsHeaders = {
     "Access-Control-Allow-Origin": "*",
     "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
   };
   ```

2. **Auth Pattern** - Uses authorization header to create user-scoped client:
   ```typescript
   const supabaseClient = createClient(url, anonKey, {
     global: { headers: { Authorization: authHeader } }
   });
   ```

3. **Instructor Lookup** - Match instructor by email (same as `get_instructor_for_user`):
   ```typescript
   const { data: instructor } = await supabaseAdmin
     .from('instructors')
     .select('id, first_name, last_name, email')
     .eq('email', user.email.toLowerCase())
     .maybeSingle();
   ```

### Database Operations

**Update ticket_items (confirm):**
```typescript
{
  instructor_confirmation: 'confirmed',
  instructor_confirmed_at: new Date().toISOString()
}
```

**Update ticket_items (decline):**
```typescript
{
  instructor_confirmation: 'declined',
  instructor_declined_at: new Date().toISOString(),
  instructor_decline_reason: reason
}
```

**Insert activity log:**
```typescript
{
  instructor_id: instructor.id,
  ticket_item_id: ticketItemId,
  activity_type: action === 'confirm' ? 'booking_confirmed' : 'booking_declined',
  description: '...',
  created_by_user_id: user.id
}
```

---

## Configuration

Add to `supabase/config.toml`:
```toml
[functions.set-booking-confirmation]
verify_jwt = false
```

We disable JWT verification at the gateway level and handle auth manually in the function code (following the project's established pattern).

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/set-booking-confirmation/index.ts` | Create | Edge function implementation |
| `supabase/config.toml` | Update | Add function configuration with `verify_jwt = false` |

---

## Error Handling

| Status | Condition |
|--------|-----------|
| 400 | Invalid request body (missing ticketItemId, invalid action) |
| 400 | Action is 'decline' but no reason provided |
| 401 | Missing or invalid authorization header |
| 403 | User is not an instructor |
| 403 | Instructor not assigned to this booking |
| 404 | Ticket item not found |
| 500 | Database error |

---

## Security Considerations

1. **Authorization Check**: Instructor must be the one assigned to the booking (`ticket_items.instructor_id` must match the authenticated instructor)

2. **Email Matching**: Uses case-insensitive email matching (same as `get_instructor_for_user` function)

3. **Service Role for Admin Operations**: Uses service role key for database updates to bypass RLS (instructor may not have direct update rights on ticket_items)

4. **Activity Logging**: All actions are logged for audit trail

