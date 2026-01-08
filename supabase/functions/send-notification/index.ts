import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: string;
  recipientEmail: string;
  recipientName?: string;
  data: Record<string, unknown>;
  userId?: string;
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
      "Authorization": `Bearer ${RESEND_API_KEY}`,
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

    const { type, recipientEmail, recipientName, data, userId }: NotificationRequest = await req.json();

    console.log(`Processing notification: ${type} to ${recipientEmail}`);

    // Get the email template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("trigger", type)
      .eq("is_active", true)
      .maybeSingle();

    if (templateError) {
      console.error("Template fetch error:", templateError);
      throw new Error(`Failed to fetch template: ${templateError.message}`);
    }

    if (!template) {
      console.log(`No active template found for type: ${type}`);
      return new Response(
        JSON.stringify({ success: false, message: `No active template for ${type}` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Simple template variable replacement
    const replaceVariables = (text: string, variables: Record<string, unknown>): string => {
      let result = text;
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        result = result.replace(regex, String(value ?? ''));
      }
      return result;
    };

    const subject = replaceVariables(template.subject, data);
    const htmlBody = replaceVariables(template.body_html, data);
    const textBody = template.body_text ? replaceVariables(template.body_text, data) : undefined;

    // Wrap HTML in email layout
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            h1 { color: #1e3a5f; }
            .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #1e3a5f; margin-bottom: 20px; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
            .button { display: inline-block; padding: 12px 24px; background: #1e3a5f; color: white; text-decoration: none; border-radius: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>⛷️ Schneesportschule Malbun</h2>
          </div>
          ${htmlBody}
          <div class="footer">
            <p>Schneesportschule Malbun · Talstation Malbun · +423 123 45 67</p>
            <p>info@schneesportschule-malbun.li · www.schneesportschule-malbun.li</p>
          </div>
        </body>
      </html>
    `;

    // Log the email attempt
    const { data: logEntry, error: logError } = await supabase
      .from("email_logs")
      .insert({
        template_id: template.id,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        subject,
        status: "queued",
        metadata: data,
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Log insert error:", logError);
    }

    // Send the email using Resend API
    const emailResult = await sendEmailWithResend(recipientEmail, subject, fullHtml, textBody);

    if (emailResult.error) {
      console.error("Email send error:", emailResult.error);
      
      // Update log with failure
      if (logEntry?.id) {
        await supabase
          .from("email_logs")
          .update({
            status: "failed",
            error_message: emailResult.error,
          })
          .eq("id", logEntry.id);
      }
      
      throw new Error(emailResult.error);
    }

    console.log("Email sent successfully:", emailResult.id);

    // Update log with success
    if (logEntry?.id) {
      await supabase
        .from("email_logs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: emailResult.id,
        })
        .eq("id", logEntry.id);
    }

    // Create in-app notification if userId is provided
    if (userId) {
      await supabase
        .from("notifications")
        .insert({
          user_id: userId,
          type,
          title: subject,
          message: textBody || htmlBody.replace(/<[^>]*>/g, '').substring(0, 200),
        });
    }

    return new Response(
      JSON.stringify({ success: true, messageId: emailResult.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-notification:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
