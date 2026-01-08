import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_PROMPT = `Du bist ein Assistent für eine Skischule in Liechtenstein/Schweiz.
Analysiere die folgende Nachricht und extrahiere alle relevanten Buchungsinformationen.

WICHTIG:
- Extrahiere NUR Informationen, die explizit in der Nachricht stehen
- Bei Unsicherheiten setze "unknown" oder null
- Berechne das Alter aus dem Geburtsdatum falls angegeben
- Erkenne Schweizer/Liechtensteinische Datumsformate (DD.MM.YYYY)
- "Privat" = Einzelunterricht, "Gruppe" = Gruppenkurs
- Skill levels: "beginner", "intermediate", "advanced"

Du MUSST die Funktion "extract_booking_info" aufrufen mit den extrahierten Daten.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: "conversationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch the conversation
    const { data: conversation, error: fetchError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (fetchError || !conversation) {
      console.error("Conversation not found:", fetchError);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Prepare message content for AI
    const messageContent = conversation.subject
      ? `Betreff: ${conversation.subject}\n\n${conversation.content}`
      : conversation.content;

    // 3. Call Lovable AI Gateway with tool calling for structured extraction
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: messageContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_booking_info",
              description: "Extrahiere Buchungsinformationen aus der Nachricht",
              parameters: {
                type: "object",
                properties: {
                  customer: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Vollständiger Name des Kunden" },
                      email: { type: "string", description: "E-Mail-Adresse" },
                      phone: { type: "string", description: "Telefonnummer" },
                      address: { type: "string", description: "Adresse" },
                      hotel: { type: "string", description: "Hotel/Unterkunft Name" },
                    },
                  },
                  participants: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Name des Teilnehmers" },
                        age: { type: "number", description: "Alter in Jahren" },
                        birth_date: { type: "string", description: "Geburtsdatum im Format YYYY-MM-DD" },
                        skill_level: { 
                          type: "string", 
                          enum: ["beginner", "intermediate", "advanced", "unknown"],
                          description: "Können des Teilnehmers" 
                        },
                        discipline: { 
                          type: "string", 
                          enum: ["ski", "snowboard", "unknown"],
                          description: "Sportart" 
                        },
                        notes: { type: "string", description: "Besondere Hinweise zum Teilnehmer" },
                      },
                      required: ["name"],
                    },
                  },
                  booking: {
                    type: "object",
                    properties: {
                      product_type: { 
                        type: "string", 
                        enum: ["private", "group", "unknown"],
                        description: "Art der Buchung" 
                      },
                      dates: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            date: { type: "string", description: "Datum im Format YYYY-MM-DD" },
                            time_preference: { 
                              type: "string", 
                              enum: ["morning", "afternoon", "full_day", "any"],
                              description: "Gewünschte Tageszeit" 
                            },
                          },
                          required: ["date"],
                        },
                      },
                      date_range: {
                        type: "object",
                        properties: {
                          start: { type: "string", description: "Startdatum YYYY-MM-DD" },
                          end: { type: "string", description: "Enddatum YYYY-MM-DD" },
                        },
                      },
                      flexibility: { 
                        type: "string", 
                        enum: ["fixed", "flexible", "unknown"],
                        description: "Flexibilität bei Terminen" 
                      },
                      instructor_preference: { type: "string", description: "Gewünschter Lehrer" },
                      lunch_supervision: { type: "boolean", description: "Mittagsbetreuung gewünscht" },
                      special_requests: { type: "string", description: "Besondere Wünsche" },
                    },
                  },
                  confidence: { 
                    type: "number", 
                    minimum: 0, 
                    maximum: 1,
                    description: "Konfidenz der Extraktion (0.0-1.0)" 
                  },
                  notes: { 
                    type: "string", 
                    description: "Anmerkungen zu Unklarheiten oder fehlenden Informationen" 
                  },
                  is_booking_request: {
                    type: "boolean",
                    description: "Handelt es sich um eine Buchungsanfrage?"
                  },
                },
                required: ["confidence", "is_booking_request"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_booking_info" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No extraction result from AI");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log("Extracted data:", extractedData);

    // 4. Validate and clean extracted data
    const cleanedData = validateAndCleanExtraction(extractedData);

    // 5. Check if it's a booking request or spam
    if (!cleanedData.is_booking_request) {
      // Update conversation with AI data but don't create booking request
      await supabase
        .from("conversations")
        .update({
          ai_extracted_data: cleanedData,
          ai_confidence_score: cleanedData.confidence || 0,
          extraction_notes: cleanedData.notes || "Keine Buchungsanfrage erkannt",
        })
        .eq("id", conversationId);

      return new Response(
        JSON.stringify({ success: true, isBookingRequest: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Update conversation with AI data
    await supabase
      .from("conversations")
      .update({
        ai_extracted_data: cleanedData,
        ai_confidence_score: cleanedData.confidence || 0.5,
        extraction_notes: cleanedData.notes,
      })
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({
        success: true,
        isBookingRequest: true,
        confidence: cleanedData.confidence,
        extractedData: cleanedData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Processing error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function validateAndCleanExtraction(data: any): any {
  // Ensure dates are valid
  if (data.booking?.dates) {
    data.booking.dates = data.booking.dates.filter((d: any) => {
      try {
        return d.date && !isNaN(new Date(d.date).getTime());
      } catch {
        return false;
      }
    });
  }

  // Normalize phone numbers
  if (data.customer?.phone) {
    data.customer.phone = normalizePhoneNumber(data.customer.phone);
  }

  // Ensure confidence is between 0 and 1
  data.confidence = Math.max(0, Math.min(1, data.confidence || 0.5));

  return data;
}

function normalizePhoneNumber(phone: string): string {
  // Remove spaces, dashes, etc.
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");

  // Convert 0041 to +41
  if (cleaned.startsWith("0041")) {
    cleaned = "+41" + cleaned.slice(4);
  }
  // Convert 00423 to +423
  if (cleaned.startsWith("00423")) {
    cleaned = "+423" + cleaned.slice(5);
  }
  // Convert leading 0 to +41 (Swiss default)
  if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    cleaned = "+41" + cleaned.slice(1);
  }

  return cleaned;
}
