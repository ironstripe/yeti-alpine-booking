import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Deterministic test password based on token (only for test accounts)
function getTestPassword(token: string): string {
  return `TestPass_${token}_2026!`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Validate the token and get the instructor
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from("instructor_test_tokens")
      .select("instructor_id, expires_at")
      .eq("token", token)
      .single();

    if (tokenError || !tokenRecord) {
      console.error("Token lookup failed:", tokenError);
      return new Response(
        JSON.stringify({ error: "Invalid test token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiration
    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Test token has expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get instructor details
    const { data: instructor, error: instructorError } = await supabaseAdmin
      .from("instructors")
      .select("id, email, first_name, last_name")
      .eq("id", tokenRecord.instructor_id)
      .single();

    if (instructorError || !instructor) {
      console.error("Instructor lookup failed:", instructorError);
      return new Response(
        JSON.stringify({ error: "Instructor not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const testPassword = getTestPassword(token);

    // 3. Check if auth user exists for this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let userId: string;
    
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === instructor.email.toLowerCase()
    );

    if (existingUser) {
      userId = existingUser.id;
      
      // Update the password to the test password
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: testPassword,
      });
    } else {
      // Create a new auth user for this instructor
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: instructor.email,
        password: testPassword,
        email_confirm: true,
        user_metadata: {
          first_name: instructor.first_name,
          last_name: instructor.last_name,
          is_test_user: true,
        },
      });

      if (createError || !newUser.user) {
        console.error("User creation failed:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create test user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;
    }

    // 4. Ensure the user has the teacher role
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "teacher")
      .single();

    if (!existingRole) {
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "teacher" });
    }

    // 5. Sign in to get session tokens
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: instructor.email,
      password: testPassword,
    });

    if (signInError || !signInData.session) {
      console.error("Sign in failed:", signInError);
      return new Response(
        JSON.stringify({ error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        instructor: {
          id: instructor.id,
          name: `${instructor.first_name} ${instructor.last_name}`,
          email: instructor.email,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
