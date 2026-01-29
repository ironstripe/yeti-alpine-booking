import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLISHED_URL = "https://yeti-alpine-booking.lovable.app";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "E-Mail-System nicht konfiguriert" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client for auth operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract the token and verify it using the admin client
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData?.user) {
      console.error("JWT validation error:", userError);
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;
    console.log("Authenticated user:", user.id);

    // Verify the caller has admin/office role
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

    // Get instructor data from request
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

    // Determine redirect URL dynamically (preview vs published)
    const origin = req.headers.get("origin") || PUBLISHED_URL;
    const redirectTo = `${origin}/set-password?next=/instructor`;
    console.log("Using redirect URL:", redirectTo);

    // Find existing user by email (with pagination to handle >50 users)
    let existingUser = null;
    let page = 1;
    const perPage = 50;
    
    while (true) {
      const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      
      if (listError) {
        console.error("List users error:", listError);
        return new Response(
          JSON.stringify({ error: "Fehler beim Prüfen bestehender Accounts" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      existingUser = usersPage?.users?.find(
        (u) => u.email?.toLowerCase() === instructor.email.toLowerCase()
      );

      if (existingUser || !usersPage?.users?.length || usersPage.users.length < perPage) {
        break;
      }
      page++;
    }

    let authUserId: string;

    if (existingUser) {
      // User already exists - always allow resending invitation
      // Recovery links expire anyway and generate fresh tokens each time
      authUserId = existingUser.id;
      console.log("Existing user found, will resend invitation:", authUserId, 
        existingUser.last_sign_in_at ? "(has signed in before)" : "(never signed in)");
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: instructor.email,
        email_confirm: false,
        user_metadata: {
          first_name: instructor.first_name,
          last_name: instructor.last_name,
        },
      });

      if (createError) {
        console.error("Create user error:", createError);
        return new Response(
          JSON.stringify({ error: `Account konnte nicht erstellt werden: ${createError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      authUserId = newUser.user.id;
      console.log("Created new user:", authUserId);
    }

    // Ensure teacher role (idempotent upsert)
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: authUserId, role: "teacher" },
        { onConflict: "user_id,role" }
      );

    if (roleError) {
      console.error("Role assignment error:", roleError);
      // Don't fail the whole request - continue with invitation
    }

    // Generate magic link for password setup
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: instructor.email,
      options: {
        redirectTo,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Generate link error:", linkError);
      return new Response(
        JSON.stringify({ error: "Einladungslink konnte nicht erstellt werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actionLink = linkData.properties.action_link;
    console.log("Generated action link for:", instructor.email);

    // Send invitation email via Resend
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #0ea5e9; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .button:hover { background: #0284c7; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎿 Willkommen im Lehrer-Portal!</h1>
          </div>
          <div class="content">
            <p>Hallo ${instructor.first_name},</p>
            <p>Du wurdest als Skilehrer zur Schneesportschule eingeladen. Mit dem Lehrer-Portal kannst du:</p>
            <ul>
              <li>Deine Lektionen und Gruppenkurse einsehen</li>
              <li>Buchungen bestätigen oder ablehnen</li>
              <li>Deine Verfügbarkeit verwalten</li>
            </ul>
            <p>Klicke auf den Button, um dein Passwort zu setzen und loszulegen:</p>
            <p style="text-align: center;">
              <a href="${actionLink}" class="button">Konto aktivieren</a>
            </p>
            <p style="font-size: 14px; color: #6b7280;">
              Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
              <a href="${actionLink}" style="color: #0ea5e9; word-break: break-all;">${actionLink}</a>
            </p>
          </div>
          <div class="footer">
            <p>Bei Fragen wende dich an das Büro der Schneesportschule.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Schneesportschule <onboarding@resend.dev>",
        to: [instructor.email],
        subject: "Einladung zum Lehrer-Portal",
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json();

    // Log to email_logs
    const emailLogData = {
      recipient_email: instructor.email,
      recipient_name: `${instructor.first_name} ${instructor.last_name}`.trim(),
      subject: "Einladung zum Lehrer-Portal",
      status: resendResponse.ok ? "sent" : "failed",
      sent_at: resendResponse.ok ? new Date().toISOString() : null,
      error_message: resendResponse.ok ? null : JSON.stringify(resendData),
      provider_message_id: resendData?.id || null,
      metadata: {
        type: "instructor.invite",
        instructor_id: instructor.id,
        redirect_to: redirectTo,
        environment: origin.includes("preview") ? "preview" : "published",
      },
    };

    await supabaseAdmin.from("email_logs").insert(emailLogData);

    if (!resendResponse.ok) {
      console.error("Resend error:", resendData);
      
      // Check for sandbox limitation error
      const errorMessage = resendData?.message || JSON.stringify(resendData);
      if (errorMessage.includes("testing emails") || errorMessage.includes("verify a domain")) {
        return new Response(
          JSON.stringify({ 
            error: "E-Mail-System im Testmodus: Einladungen können nur an die eigene E-Mail-Adresse gesendet werden. Bitte Domain in Resend verifizieren.",
            resend_error: true,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `E-Mail konnte nicht gesendet werden: ${errorMessage}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully invited instructor ${instructor.email}, email ID: ${resendData.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Einladung an ${instructor.email} gesendet`,
        email_id: resendData.id,
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
