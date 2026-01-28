import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create admin client for auth operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Create user client to verify caller's role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1. Verify the caller is authenticated
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify the caller has admin/office role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = roles?.map((r) => r.role) || [];
    if (!userRoles.includes("admin") && !userRoles.includes("office")) {
      return new Response(
        JSON.stringify({ error: "Keine Berechtigung. Nur Admin/Büro kann einladen." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get instructor data from request
    const { instructor_id } = await req.json();

    if (!instructor_id) {
      return new Response(
        JSON.stringify({ error: "instructor_id ist erforderlich" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: instructor, error: instructorError } = await supabaseAdmin
      .from("instructors")
      .select("id, email, first_name, last_name")
      .eq("id", instructor_id)
      .single();

    if (instructorError || !instructor) {
      console.error("Instructor fetch error:", instructorError);
      return new Response(
        JSON.stringify({ error: "Skilehrer nicht gefunden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!instructor.email) {
      return new Response(
        JSON.stringify({ error: "Skilehrer hat keine E-Mail-Adresse" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Check if user already exists in auth.users
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("List users error:", listError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Prüfen bestehender Accounts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === instructor.email.toLowerCase()
    );

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: `${instructor.first_name} hat bereits einen Account` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Invite user by email
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      instructor.email,
      {
        data: {
          first_name: instructor.first_name,
          last_name: instructor.last_name,
        },
        redirectTo: "https://yeti-alpine-booking.lovable.app/instructor",
      }
    );

    if (inviteError) {
      console.error("Invite error:", inviteError);
      return new Response(
        JSON.stringify({ error: `Einladung fehlgeschlagen: ${inviteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Assign teacher role to the new user
    if (inviteData.user) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: inviteData.user.id,
          role: "teacher",
        });

      if (roleError) {
        console.error("Role assignment error:", roleError);
        // Don't fail the whole request - the user is already invited
      }
    }

    console.log(`Successfully invited instructor ${instructor.email}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Einladung an ${instructor.email} gesendet`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Ein unerwarteter Fehler ist aufgetreten";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
