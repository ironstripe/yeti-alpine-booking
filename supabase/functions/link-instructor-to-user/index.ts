import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Teaching roles from instructor.roles array
const TEACHING_ROLES = ["ski", "snowboard"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, roles } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client to access auth.users
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find auth user by email
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authError) {
      console.error("Error listing users:", authError);
      return new Response(
        JSON.stringify({ linked: false, error: "Failed to query users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUser = authData.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!authUser) {
      // No auth user exists with this email - that's fine, nothing to link
      return new Response(
        JSON.stringify({ linked: false, reason: "No auth user found with this email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which user_roles to assign based on instructor roles
    const userRolesToAssign: string[] = [];
    
    if (roles && Array.isArray(roles)) {
      // Check if any teaching role is present
      const hasTeachingRole = roles.some((r: string) => TEACHING_ROLES.includes(r));
      if (hasTeachingRole) {
        userRolesToAssign.push("teacher");
      }
      
      // Check if office role is present
      if (roles.includes("office")) {
        userRolesToAssign.push("office");
      }
    }

    if (userRolesToAssign.length === 0) {
      // Default to teacher if no specific mapping
      userRolesToAssign.push("teacher");
    }

    // Insert roles into user_roles table (ignore conflicts)
    const insertPromises = userRolesToAssign.map(async (role) => {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: authUser.id, role },
          { onConflict: "user_id,role", ignoreDuplicates: true }
        );
      
      if (error) {
        console.error(`Error inserting role ${role}:`, error);
        return { role, success: false, error: error.message };
      }
      return { role, success: true };
    });

    const results = await Promise.all(insertPromises);

    console.log(`Linked user ${authUser.id} (${email}) with roles:`, userRolesToAssign);

    return new Response(
      JSON.stringify({
        linked: true,
        userId: authUser.id,
        rolesAssigned: userRolesToAssign,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in link-instructor-to-user:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
