import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const BATCH_SIZE = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InstructorInfo {
  email: string;
  first_name: string;
  last_name: string;
}

interface NotificationRecord {
  id: string;
  instructor_id: string;
  notification_type: string;
  template_data: Record<string, unknown>;
  instructors: InstructorInfo | InstructorInfo[];
}

async function sendEmailWithResend(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<{ id?: string; error?: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Schneesportschule Malbun <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    return { error: result.message || "Failed to send email" };
  }

  return { id: result.id };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch pending notifications with instructor info
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("instructor_notification_queue")
      .select(`
        id,
        instructor_id,
        notification_type,
        template_data,
        instructors!inner (email, first_name, last_name)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("Error fetching notifications:", fetchError);
      throw fetchError;
    }

    if (!pendingNotifications?.length) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No pending notifications" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing ${pendingNotifications.length} notifications`);

    // Get email templates
    const { data: templates, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("is_active", true);

    if (templateError) {
      console.error("Error fetching templates:", templateError);
      throw templateError;
    }

    const templateMap = new Map(templates?.map(t => [t.trigger, t]) || []);

    let processed = 0;
    let failed = 0;

    for (const notification of pendingNotifications as unknown as NotificationRecord[]) {
      try {
        const template = templateMap.get(notification.notification_type);
        if (!template) {
          throw new Error(`No template found for ${notification.notification_type}`);
        }

        // Handle both single object and array (Supabase returns single for !inner)
        const instructorData = Array.isArray(notification.instructors) 
          ? notification.instructors[0] 
          : notification.instructors;
        
        if (!instructorData) {
          throw new Error("No instructor data found");
        }

        const data: Record<string, unknown> = {
          ...notification.template_data,
          instructor_name: `${instructorData.first_name} ${instructorData.last_name}`,
        };

        // Replace template variables
        let subject = template.subject;
        let body = template.body_html;
        let textBody = template.body_text || "";
        
        for (const [key, value] of Object.entries(data)) {
          const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
          subject = subject.replace(regex, String(value ?? ""));
          body = body.replace(regex, String(value ?? ""));
          textBody = textBody.replace(regex, String(value ?? ""));
        }

        // Wrap in email layout
        const fullHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                h1, h2 { color: #1e3a5f; }
                .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #1e3a5f; margin-bottom: 20px; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
                a { color: #1e3a5f; }
              </style>
            </head>
            <body>
              <div class="header">
                <h2>⛷️ Schneesportschule Malbun</h2>
              </div>
              ${body}
              <div class="footer">
                <p>Schneesportschule Malbun · Talstation Malbun · +423 123 45 67</p>
                <p>info@schneesportschule-malbun.li · www.schneesportschule-malbun.li</p>
              </div>
            </body>
          </html>
        `;

        // Send the email
        const emailResult = await sendEmailWithResend(
          instructorData.email,
          subject,
          fullHtml,
          textBody || undefined
        );

        if (emailResult.error) {
          throw new Error(emailResult.error);
        }

        console.log(`Email sent to ${instructorData.email}: ${emailResult.id}`);

        // Mark as sent
        await supabase
          .from("instructor_notification_queue")
          .update({
            status: "sent",
            processed_at: new Date().toISOString(),
          })
          .eq("id", notification.id);

        // Log to email_logs table
        await supabase.from("email_logs").insert({
          template_id: template.id,
          recipient_email: instructorData.email,
          recipient_name: `${instructorData.first_name} ${instructorData.last_name}`,
          subject,
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: emailResult.id,
          metadata: notification.template_data,
        });

        processed++;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error(`Failed to process notification ${notification.id}:`, errorMessage);

        // Mark as failed
        await supabase
          .from("instructor_notification_queue")
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
            error_message: errorMessage,
          })
          .eq("id", notification.id);

        failed++;
      }
    }

    console.log(`Processed: ${processed}, Failed: ${failed}`);

    return new Response(
      JSON.stringify({ processed, failed }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-instructor-notification:", errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
