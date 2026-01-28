import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SetBookingConfirmationRequest {
  ticketItemId: string;
  action: "confirm" | "decline";
  reason?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Validate authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse and validate request body
    const { ticketItemId, action, reason } = await req.json() as SetBookingConfirmationRequest;

    if (!ticketItemId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing ticketItemId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action !== "confirm" && action !== "decline") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid action. Must be 'confirm' or 'decline'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "decline" && !reason) {
      return new Response(
        JSON.stringify({ success: false, error: "Reason is required when declining a booking" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // User-scoped client for auth validation
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client for database operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Validate JWT and get user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Find instructor by user's email (same logic as get_instructor_for_user)
    const { data: instructor, error: instructorError } = await supabaseAdmin
      .from("instructors")
      .select("id, first_name, last_name, email")
      .eq("email", user.email?.toLowerCase() ?? "")
      .maybeSingle();

    if (instructorError) {
      console.error("Error fetching instructor:", instructorError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to verify instructor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!instructor) {
      return new Response(
        JSON.stringify({ success: false, error: "You are not registered as an instructor" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Fetch ticket_item and verify instructor is assigned
    const { data: ticketItem, error: ticketItemError } = await supabaseAdmin
      .from("ticket_items")
      .select("id, instructor_id, date, time_start, time_end")
      .eq("id", ticketItemId)
      .maybeSingle();

    if (ticketItemError) {
      console.error("Error fetching ticket item:", ticketItemError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch booking" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ticketItem) {
      return new Response(
        JSON.stringify({ success: false, error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (ticketItem.instructor_id !== instructor.id) {
      return new Response(
        JSON.stringify({ success: false, error: "You are not assigned to this booking" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Prepare update based on action
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      instructor_confirmation: action === "confirm" ? "confirmed" : "declined",
    };

    if (action === "confirm") {
      updateData.instructor_confirmed_at = now;
    } else {
      updateData.instructor_declined_at = now;
      updateData.instructor_decline_reason = reason;
    }

    // 8. Update ticket_items
    const { error: updateError } = await supabaseAdmin
      .from("ticket_items")
      .update(updateData)
      .eq("id", ticketItemId);

    if (updateError) {
      console.error("Error updating ticket item:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update booking" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Log to instructor_activity_log
    const activityType = action === "confirm" ? "booking_confirmed" : "booking_declined";
    const description = action === "confirm"
      ? `Instructor ${instructor.first_name} ${instructor.last_name} confirmed booking for ${ticketItem.date}`
      : `Instructor ${instructor.first_name} ${instructor.last_name} declined booking for ${ticketItem.date}. Reason: ${reason}`;

    const { error: logError } = await supabaseAdmin
      .from("instructor_activity_log")
      .insert({
        instructor_id: instructor.id,
        ticket_item_id: ticketItemId,
        activity_type: activityType,
        description: description,
        created_by_user_id: user.id,
        metadata: {
          action,
          reason: reason || null,
          date: ticketItem.date,
          time_start: ticketItem.time_start,
          time_end: ticketItem.time_end,
        },
      });

    if (logError) {
      // Log error but don't fail the request - the main operation succeeded
      console.error("Error logging activity:", logError);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
