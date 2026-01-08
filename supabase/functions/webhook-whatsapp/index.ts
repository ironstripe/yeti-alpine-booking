import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle WhatsApp webhook verification (GET request)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (mode === "subscribe" && token === verifyToken) {
      console.log("WhatsApp webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received WhatsApp webhook:", JSON.stringify(payload).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Process WhatsApp message (Meta/Twilio format)
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const message = change.value?.messages?.[0];
        if (!message) continue;

        const contact = change.value?.contacts?.[0];
        const phoneNumber = message.from;
        const messageId = message.id;

        // Extract message content based on type
        let content = "";
        if (message.type === "text") {
          content = message.text?.body || "";
        } else if (message.type === "image" || message.type === "document") {
          content = message.caption || `[${message.type} received]`;
        }

        if (!content.trim()) continue;

        // Store incoming message in conversations
        const { data: conversation, error: insertError } = await supabase
          .from("conversations")
          .insert({
            channel: "whatsapp",
            direction: "inbound",
            contact_identifier: phoneNumber,
            contact_name: contact?.profile?.name || null,
            content: content,
            status: "unread",
            raw_payload: payload,
            external_message_id: messageId,
          })
          .select()
          .single();

        if (insertError) {
          console.error("Failed to store WhatsApp message:", insertError);
          continue;
        }

        console.log("Stored WhatsApp conversation:", conversation.id);

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
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
