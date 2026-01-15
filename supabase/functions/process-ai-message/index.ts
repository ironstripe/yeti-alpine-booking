import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced extraction prompt for maximum information extraction
const EXTRACTION_PROMPT = `Du bist ein Experte für die Analyse von Buchungsanfragen einer Skischule in Liechtenstein/Schweiz.

**DEINE AUFGABE:** Extrahiere ALLE verfügbaren Informationen aus der Nachricht. Sei gründlich und nutze auch implizite Hinweise.

**EXTRAKTIONSREGELN:**

1. **Kundendaten:**
   - Suche nach Namen in der Signatur, Grussformel oder im Text
   - E-Mail-Adressen und Telefonnummern aus Signatur extrahieren
   - Wenn jemand "ich" oder "wir" schreibt, ist der Absender wahrscheinlich auch Teilnehmer oder Elternteil

2. **Teilnehmer:**
   - "Meine beiden Kinder" = 2 Teilnehmer
   - "Wir sind zu viert" = 4 Teilnehmer
   - "Für mich und meinen Mann" = 2 Erwachsene
   - Alter aus Kontext ableiten: "Kinder" = unter 16, "Erwachsene" = über 16
   - Geburtsdaten im Format TT.MM.JJJJ suchen und zu YYYY-MM-DD konvertieren

3. **Daten und Zeiten:**
   - "Nächste Woche" oder "im Januar" ist NICHT spezifisch genug → als fehlend markieren, aber in date_description speichern
   - "15. bis 20. Januar" = 6 spezifische Tage
   - "Montag bis Freitag" ohne konkretes Datum = fehlend
   - Bei Privatstunden: Uhrzeiten wie "09:00-12:00" oder "Vormittag" extrahieren

4. **Kurstyp:**
   - "Privatunterricht", "Privatstunde", "nur für uns" = private
   - "Gruppenkurs", "Skikurs", "Kinderskikurs" = group
   - Wenn unklar, als "unknown" markieren

5. **Könnensstufe:**
   - "Anfänger", "noch nie", "erste Mal" = beginner
   - "Kann schon ein bisschen", "war letztes Jahr" = intermediate
   - "Fährt schon gut", "rote Pisten" = advanced
   - "Experte", "schwarze Pisten" = expert

6. **Mittagsbetreuung (nur bei Gruppenkursen):**
   - Explizit erwähnt: "mit Mittagessen", "Mittagsbetreuung"
   - "Ganztags" impliziert oft Mittagsbetreuung

7. **Adressen (CH/LI/AT/DE Format) - WICHTIG:**
   - Erkenne Adressen auch OHNE explizite Labels wie "Adresse:"
   - Typisches Format: "[Strasse] [Hausnummer]" gefolgt von "[PLZ] [Ort]" auf gleicher oder nächster Zeile
   - Die Adresse kann direkt nach dem Namen stehen
   - Beispiele die du erkennen MUSST:
     * "Im Riet 58, 9495 Triesen" → street: "Im Riet 58", zip: "9495", city: "Triesen"
     * "Julia Holste\\nIm Riet 58\\n9495 Triesen" → Vor-/Nachname + Adresse
     * "Landstrasse 123, 9490 Vaduz" → street: "Landstrasse 123", zip: "9490", city: "Vaduz"
     * "Hauptstrasse 1, CH-8000 Zürich" → street: "Hauptstrasse 1", zip: "8000", city: "Zürich", country: "CH"
   - PLZ-Bereiche zur Landerkennung:
     * 9490-9498: Liechtenstein (LI)
     * 8000-8999, 9000-9499 (ausser 9490-9498): Schweiz (CH)
     * 6800-6899: Österreich/Vorarlberg (AT)
   - Wenn Adresse auf mehreren Zeilen steht, zusammenführen
   - "country" ableiten aus PLZ wenn nicht explizit genannt

**WICHTIG:**
- Extrahiere ALLES was du findest, auch wenn es unvollständig ist
- Markiere fehlende Pflichtfelder explizit in "missing_information"
- Bei Unsicherheit: extrahieren und niedrige Konfidenz angeben
- Unterscheide zwischen "nicht vorhanden" und "nicht erwähnt"

**FEHLENDE INFORMATIONEN - Liste alle Pflichtfelder auf, die für eine vollständige Buchung noch fehlen:**
- customer_name (Vor- und Nachname)
- customer_address (nur bei Neukunden)
- customer_email
- customer_phone
- participant_names (Vornamen aller Teilnehmer)
- participant_birthdates (Geburtsdaten oder Alter)
- participant_skill_levels (Könnensstufe)
- booking_dates (konkrete Daten)
- booking_times (Start/Ende, nur bei Privatstunden)
- booking_course_type (Privat/Gruppe)
- lunch_supervision (nur bei Ganztags-Gruppenkursen)
- vegetarian_preference (nur wenn Mittagsbetreuung)

Du MUSST die Funktion "extract_booking_info" aufrufen mit den extrahierten Daten.`;

// Enhanced tool schema for comprehensive extraction
const extractionTools = [
  {
    type: "function",
    function: {
      name: "extract_booking_info",
      description: "Extrahiert Buchungsinformationen aus einer Kundenanfrage",
      parameters: {
        type: "object",
        properties: {
          is_booking_request: {
            type: "boolean",
            description: "Ist dies eine Buchungsanfrage?",
          },
          classification: {
            type: "string",
            enum: ["new_booking", "cancellation", "modification", "general_inquiry", "complaint", "other"],
            description: "Art der Anfrage",
          },
          detected_language: {
            type: "string",
            enum: ["de", "en"],
            description: "Erkannte Sprache",
          },
          customer: {
            type: "object",
            properties: {
              first_name: { type: "string", description: "Vorname des Kunden" },
              last_name: { type: "string", description: "Nachname des Kunden" },
              name: { type: "string", description: "Vollständiger Name (falls nicht in Vor-/Nachname trennbar)" },
              email: { type: "string", description: "E-Mail-Adresse" },
              phone: { type: "string", description: "Telefonnummer" },
              address: {
                type: "object",
                description: "Vollständige Adresse des Kunden. Erkenne CH/LI/AT Formate: Strasse + Hausnummer, dann PLZ + Ort",
                properties: {
                  street: { type: "string", description: "Strasse und Hausnummer, z.B. 'Im Riet 58', 'Landstrasse 123'" },
                  zip: { type: "string", description: "Postleitzahl, z.B. '9495', '8000'" },
                  city: { type: "string", description: "Ort, z.B. 'Triesen', 'Vaduz', 'Zürich'" },
                  country: { type: "string", description: "Ländercode ableiten aus PLZ: 9490-9498=LI, 8000-9489=CH, 6800-6899=AT" },
                },
              },
              hotel: { type: "string", description: "Hotel/Unterkunft Name" },
            },
          },
          participants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                first_name: { type: "string", description: "Vorname des Teilnehmers" },
                name: { type: "string", description: "Vollständiger Name (Fallback)" },
                birth_date: { type: "string", description: "Geburtsdatum im Format YYYY-MM-DD" },
                age: { type: "number", description: "Alter, falls Geburtsdatum unbekannt" },
                skill_level: {
                  type: "string",
                  enum: ["beginner", "intermediate", "advanced", "expert", "unknown"],
                  description: "Können des Teilnehmers",
                },
                discipline: {
                  type: "string",
                  enum: ["ski", "snowboard", "unknown"],
                  description: "Sportart (default: ski)",
                },
                notes: { type: "string", description: "Zusätzliche Infos zum Teilnehmer" },
              },
            },
          },
          booking: {
            type: "object",
            properties: {
              product_type: {
                type: "string",
                enum: ["private", "group", "unknown"],
                description: "Art der Buchung (Privatstunde oder Gruppenkurs)",
              },
              dates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string", description: "Datum im Format YYYY-MM-DD" },
                    start_time: { type: "string", description: "Startzeit im Format HH:MM" },
                    end_time: { type: "string", description: "Endzeit im Format HH:MM" },
                    time_preference: {
                      type: "string",
                      enum: ["morning", "afternoon", "full_day", "any"],
                      description: "Gewünschte Tageszeit",
                    },
                  },
                  required: ["date"],
                },
              },
              date_description: {
                type: "string",
                description: "Ursprüngliche Datumsbeschreibung wenn nicht konkret (z.B. 'nächste Woche', 'im Januar')",
              },
              date_range: {
                type: "object",
                properties: {
                  start: { type: "string", description: "Startdatum YYYY-MM-DD" },
                  end: { type: "string", description: "Enddatum YYYY-MM-DD" },
                },
              },
              start_date: { type: "string", description: "Startdatum YYYY-MM-DD" },
              end_date: { type: "string", description: "Enddatum YYYY-MM-DD" },
              flexibility: {
                type: "string",
                enum: ["fixed", "flexible", "unknown"],
                description: "Flexibilität bei Terminen",
              },
              instructor_preference: { type: "string", description: "Gewünschter Lehrer" },
              lunch_supervision: { type: "boolean", description: "Mittagsbetreuung gewünscht" },
              vegetarian: { type: "boolean", description: "Vegetarisches Mittagessen" },
              special_requests: { type: "string", description: "Besondere Wünsche" },
            },
          },
          missing_information: {
            type: "array",
            items: { type: "string" },
            description: "Liste aller fehlenden Pflichtfelder für eine vollständige Buchung",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Konfidenz der Extraktion (0.0-1.0)",
          },
          notes: {
            type: "string",
            description: "Anmerkungen zu Unklarheiten oder wichtige Hinweise",
          },
        },
        required: ["is_booking_request", "classification", "missing_information"],
      },
    },
  },
];

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
    let existingCustomerData: Record<string, unknown> | null = null;

    if (senderIdentifier) {
      // Try to find existing customer by email or phone
      const { data: existingCustomer, error: customerError } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email, phone, street, city, zip, country")
        .or(`email.eq.${senderIdentifier},phone.eq.${senderIdentifier}`)
        .maybeSingle();

      if (!customerError && existingCustomer) {
        matchedCustomerId = existingCustomer.id;
        isExistingCustomer = true;
        existingCustomerData = existingCustomer;
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
        tools: extractionTools,
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
    const cleanedData = validateAndCleanExtraction(extractedData, isExistingCustomer);

    // Add customer matching info to extracted data
    cleanedData.matched_customer_id = matchedCustomerId;
    cleanedData.is_existing_customer = isExistingCustomer;

    // 6. Update conversation with AI data and new rule-based scores
    const updateData: Record<string, unknown> = {
      ai_extracted_data: cleanedData,
      ai_confidence_score: cleanedData.data_completeness || 0,
      data_completeness: cleanedData.data_completeness || 0,
      booking_ready: cleanedData.booking_ready || false,
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
        dataCompleteness: cleanedData.data_completeness,
        bookingReady: cleanedData.booking_ready,
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

function validateAndCleanExtraction(
  data: Record<string, unknown>,
  isExistingCustomer: boolean
): Record<string, unknown> {
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

  // Merge first_name/last_name into name field if needed (for backwards compatibility)
  if (customer && !customer.name && (customer.first_name || customer.last_name)) {
    customer.name = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  }

  // Normalize participant names
  const participants = data.participants as Array<Record<string, unknown>> | undefined;
  if (participants) {
    for (const p of participants) {
      if (!p.name && p.first_name) {
        p.name = p.first_name as string;
      }
    }
  }

  // Calculate rule-based completeness with context awareness
  const completenessResult = calculateDataCompleteness(data, isExistingCustomer);

  // Store both the AI's original confidence and the calculated completeness
  data.ai_original_confidence = data.confidence;
  data.confidence = completenessResult.score;
  data.data_completeness = completenessResult.score;
  data.booking_ready = completenessResult.bookingReady;
  
  // Use the calculated missing fields (more accurate than AI-reported)
  data.missing_information = completenessResult.missingRequired;

  return data;
}

interface CompletenessResult {
  score: number;
  missingRequired: string[];
  bookingReady: boolean;
}

// Enhanced rule-based data completeness calculation
function calculateDataCompleteness(
  data: Record<string, unknown>,
  isExistingCustomer: boolean
): CompletenessResult {
  const missing: string[] = [];
  let score = 0;

  const customer = (data.customer as Record<string, unknown>) || {};
  const participants = (data.participants as Array<Record<string, unknown>>) || [];
  const booking = (data.booking as Record<string, unknown>) || {};

  const isPrivate = booking.product_type === "private";
  const isGroup = booking.product_type === "group";
  const bookingDates = booking.dates as Array<Record<string, unknown>> | undefined;

  // Check if any date is full day (for lunch supervision logic)
  const hasFullDayBooking = bookingDates?.some((d) => {
    const startTime = d.start_time as string | undefined;
    const endTime = d.end_time as string | undefined;
    const timePref = d.time_preference as string | undefined;
    if (timePref === "full_day") return true;
    if (startTime && endTime) {
      const start = parseInt(startTime.split(":")[0]);
      const end = parseInt(endTime.split(":")[0]);
      return (end - start) >= 5; // 5+ hours = full day
    }
    return false;
  });

  // === CUSTOMER DATA (25 points) ===
  // Name (10 points)
  const hasFirstName = !!(customer.first_name || customer.name);
  const hasLastName = !!customer.last_name;
  
  if (hasFirstName && hasLastName) {
    score += 10;
  } else if (hasFirstName || hasLastName || customer.name) {
    score += 5;
    missing.push("customer_name");
  } else {
    missing.push("customer_name");
  }

  // Contact: Email OR Phone (10 points)
  if (customer.email || customer.phone) {
    score += 10;
  } else {
    missing.push("customer_contact");
  }

  // Address (5 points) - only required for new customers
  // FIXED: Check for street OR city with zip (more lenient)
  if (isExistingCustomer) {
    score += 5; // Existing customers get this for free
  } else {
    const address = customer.address as Record<string, unknown> | undefined;
    const hasValidAddress = address && (
      (address.street && address.zip) || 
      (address.street && address.city) ||
      (address.zip && address.city)
    );
    if (hasValidAddress) {
      score += 5;
    } else {
      missing.push("customer_address");
    }
  }

  // === PARTICIPANT DATA (35 points) ===
  if (participants.length > 0) {
    let hasAllNames = true;
    let hasAllBirthdates = true;
    let hasAllLevels = true;

    for (const p of participants) {
      // Name check - reject placeholder names
      const name = (p.first_name || p.name) as string | undefined;
      if (!name || name.match(/^Teilnehmer \d+$/i)) {
        hasAllNames = false;
      }

      // Birthdate/Age check
      if (!p.birth_date && !p.age) {
        hasAllBirthdates = false;
      }

      // Skill level check
      const level = p.skill_level as string | undefined;
      if (!level || level === "unknown") {
        hasAllLevels = false;
      }
    }

    if (hasAllNames) {
      score += 15;
    } else {
      missing.push("participant_names");
    }

    if (hasAllBirthdates) {
      score += 12;
    } else {
      missing.push("participant_birthdates");
    }

    if (hasAllLevels) {
      score += 8;
    } else {
      missing.push("participant_skill_levels");
    }
  } else {
    missing.push("participant_names");
    missing.push("participant_birthdates");
    missing.push("participant_skill_levels");
  }

  // === BOOKING DATA (40 points) ===
  // Specific dates (20 points)
  const hasSpecificDates =
    (bookingDates && bookingDates.length > 0 && bookingDates.every((d) => d.date && !String(d.date).includes("unknown"))) ||
    (booking.start_date && !String(booking.start_date).includes("unknown"));

  if (hasSpecificDates) {
    score += 20;
  } else {
    missing.push("booking_dates");
  }

  // Course type (10 points)
  if (booking.product_type && booking.product_type !== "unknown") {
    score += 10;
  } else {
    missing.push("booking_course_type");
  }

  // Times - only for private lessons (10 points)
  if (isPrivate) {
    const hasAllTimes = bookingDates?.every((d) => d.start_time && d.end_time);
    if (hasAllTimes) {
      score += 10;
    } else {
      missing.push("booking_times");
    }
  } else if (isGroup) {
    // Group courses have fixed times, so we give the points
    score += 10;
  }
  // If course type unknown, we don't add to missing yet (will be asked first)

  // Lunch supervision - only for full-day group courses (bonus points, not blocking)
  if (isGroup && hasFullDayBooking) {
    if (booking.lunch_supervision !== undefined) {
      score += 3; // Bonus points
      // Vegetarian only if lunch = yes
      if (booking.lunch_supervision && booking.vegetarian !== undefined) {
        score += 2; // Bonus points
      } else if (booking.lunch_supervision) {
        missing.push("vegetarian_preference");
      }
    } else {
      missing.push("lunch_supervision");
    }
  }

  // Calculate if booking is ready (all REQUIRED fields present)
  const requiredFields = [
    "customer_name",
    "customer_contact",
    "participant_names",
    "participant_birthdates",
    "booking_dates",
    "booking_course_type",
  ];

  // Add conditional required fields
  if (isPrivate) {
    requiredFields.push("booking_times");
  }
  if (!isExistingCustomer) {
    requiredFields.push("customer_address");
  }

  const requiredMissing = missing.filter((f) => requiredFields.includes(f));
  const bookingReady = requiredMissing.length === 0;

  return {
    score: Math.round(score) / 100, // Return as 0-1 scale
    missingRequired: missing,
    bookingReady,
  };
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
