import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received email webhook:", JSON.stringify(payload).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract email data - handle multiple provider formats (Resend, Mailgun, SendGrid)
    const senderEmail = payload.from?.email || payload.sender || payload.from || "";
    const senderName = payload.from?.name || extractNameFromEmail(senderEmail);
    const subject = payload.subject || "";
    const bodyText = payload.text || payload["body-plain"] || stripHtml(payload.html || payload["body-html"] || "");
    const messageId = payload.messageId || payload["Message-Id"] || payload.id || crypto.randomUUID();

    // Store incoming message in conversations
    const { data: conversation, error: insertError } = await supabase
      .from("conversations")
      .insert({
        channel: "email",
        direction: "inbound",
        contact_identifier: senderEmail,
        contact_name: senderName,
        subject: subject,
        content: bodyText,
        status: "unread",
        raw_payload: payload,
        external_message_id: messageId,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to store message:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to store message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Stored conversation:", conversation.id);

    // Trigger AI processing asynchronously
    try {
      const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-ai-message`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ conversationId: conversation.id }),
      });

      if (!processResponse.ok) {
        console.error("AI processing failed:", await processResponse.text());
      } else {
        console.log("AI processing triggered successfully");
      }
    } catch (aiError) {
      console.error("Failed to trigger AI processing:", aiError);
      // Don't fail the webhook - message is stored, AI can be retried
    }

    return new Response(
      JSON.stringify({ success: true, conversationId: conversation.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractNameFromEmail(email: string): string {
  if (!email) return "";
  const localPart = email.split("@")[0] || "";
  // Convert "john.doe" or "john_doe" to "John Doe"
  return localPart
    .replace(/[._-]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function stripHtml(html: string): string {
  // Simple HTML to text conversion
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}
