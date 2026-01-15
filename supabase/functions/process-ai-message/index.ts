import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_PROMPT = `Du bist ein Assistent für eine Skischule in Liechtenstein/Schweiz.
Analysiere die folgende Nachricht und extrahiere alle relevanten Buchungsinformationen.

WICHTIG:
- Klassifiziere die Absicht der Nachricht (z.B. Neubuchung, Storno, Änderung, allgemeine Anfrage, Beschwerde).
- Erkenne die Sprache der Nachricht (Deutsch oder Englisch).
- Identifiziere explizit, welche Informationen für die jeweilige Anfrage fehlen.
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

    // 2. Customer Lookup (Pre-AI Call)
    const senderIdentifier = conversation.contact_identifier;
    let matchedCustomerId: string | null = null;
    let isExistingCustomer = false;

    if (senderIdentifier) {
      // Try to find existing customer by email or phone
      const { data: existingCustomer, error: customerError } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email, phone")
        .or(`email.eq.${senderIdentifier},phone.eq.${senderIdentifier}`)
        .maybeSingle();

      if (!customerError && existingCustomer) {
        matchedCustomerId = existingCustomer.id;
        isExistingCustomer = true;
        console.log(`Existing customer found: ${existingCustomer.first_name} ${existingCustomer.last_name} (${matchedCustomerId})`);
      } else {
        console.log(`No existing customer found for: ${senderIdentifier}`);
      }
    }

    // 3. Prepare message content for AI
    const messageContent = conversation.subject
      ? `Betreff: ${conversation.subject}\n\n${conversation.content}`
      : conversation.content;

    // 4. Call Lovable AI Gateway with enhanced tool calling
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
                  // NEW: Classification
                  classification: {
                    type: "string",
                    enum: ["new_booking", "cancellation", "modification", "general_inquiry", "complaint", "other"],
                    description: "Klassifiziere die Hauptabsicht der Nachricht",
                  },
                  // NEW: Language detection
                  detected_language: {
                    type: "string",
                    enum: ["de", "en"],
                    description: "Die erkannte Sprache der Nachricht (Deutsch oder Englisch)",
                  },
                  // NEW: Missing information
                  missing_information: {
                    type: "array",
                    items: { type: "string" },
                    description: "Eine Liste von Informationen, die für die Bearbeitung der Anfrage fehlen (z.B., 'start_date', 'number_of_participants', 'participant_ages', 'skill_level', 'contact_phone')",
                  },
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
                required: ["classification", "confidence", "is_booking_request"],
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

    // 5. Validate and clean extracted data
    const cleanedData = validateAndCleanExtraction(extractedData);
    
    // Add customer matching info to extracted data
    cleanedData.matched_customer_id = matchedCustomerId;
    cleanedData.is_existing_customer = isExistingCustomer;

    // 6. Update conversation with AI data and new columns
    const updateData: Record<string, unknown> = {
      ai_extracted_data: cleanedData,
      ai_confidence_score: cleanedData.confidence || 0.5,
      notes: cleanedData.notes,
      classification: cleanedData.classification || "other",
      detected_language: cleanedData.detected_language || "de",
    };

    // Link matched customer if found
    if (matchedCustomerId) {
      updateData.matched_customer_id = matchedCustomerId;
    }

    await supabase
      .from("conversations")
      .update(updateData)
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({
        success: true,
        isBookingRequest: cleanedData.is_booking_request,
        classification: cleanedData.classification,
        detectedLanguage: cleanedData.detected_language,
        missingInformation: cleanedData.missing_information || [],
        confidence: cleanedData.confidence,
        isExistingCustomer,
        matchedCustomerId,
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

function validateAndCleanExtraction(data: Record<string, unknown>): Record<string, unknown> {
  // Ensure classification has a default
  if (!data.classification) {
    data.classification = "other";
  }

  // Ensure detected_language has a default
  if (!data.detected_language) {
    data.detected_language = "de";
  }

  // Ensure missing_information is an array
  if (!Array.isArray(data.missing_information)) {
    data.missing_information = [];
  }

  // Ensure dates are valid
  const booking = data.booking as Record<string, unknown> | undefined;
  if (booking?.dates && Array.isArray(booking.dates)) {
    booking.dates = (booking.dates as Array<{ date: string }>).filter((d) => {
      try {
        return d.date && !isNaN(new Date(d.date).getTime());
      } catch {
        return false;
      }
    });
  }

  // Normalize phone numbers
  const customer = data.customer as Record<string, unknown> | undefined;
  if (customer?.phone && typeof customer.phone === "string") {
    customer.phone = normalizePhoneNumber(customer.phone);
  }

  // Ensure confidence is between 0 and 1
  data.confidence = Math.max(0, Math.min(1, (data.confidence as number) || 0.5));

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
