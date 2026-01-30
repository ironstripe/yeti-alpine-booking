import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced extraction prompt for maximum information extraction with participant-specific booking support
const EXTRACTION_PROMPT = `Du bist ein Experte für die Analyse von Buchungsanfragen einer Skischule in Liechtenstein/Schweiz.

**DEINE AUFGABE:** Extrahiere ALLE verfügbaren Informationen aus der Nachricht. Sei gründlich und nutze auch implizite Hinweise.

**WICHTIG - TEILNEHMER-SPEZIFISCHE BUCHUNGEN:**
Jeder Teilnehmer kann individuelle Buchungsdetails haben (unterschiedliche Produkte, Tage, Zeiten).
Erkenne unterschiedliche Skill-Levels und schlage passende Produkte vor:
- beginner + Alter 3-4 → product_suggestion: "windel-wedel" (nur 10:00-12:00)
- beginner + Alter 5+ → product_suggestion: "anfaenger-gruppenkurs"
- intermediate → product_suggestion: "fortgeschrittenen-gruppenkurs"
- advanced/expert → product_suggestion: "experten-kurs" oder "privat"

Wenn Teilnehmer unterschiedliche Levels/Tage haben:
- Setze booking_summary.has_different_levels/has_different_dates: true
- Füge Warnungen hinzu
- Erfasse für JEDEN Teilnehmer sein eigenes booking-Objekt mit dates und product_suggestion

Zeiten für Gruppenkurse:
- Standard: 10:00-12:00 und 13:30-15:30 (Halbtageskurse)
- Mit Mittagsbetreuung: 10:00-15:30 (Ganztageskurs)
- Windel-Wedel (3-4 Jahre): nur 10:00-12:00

**EXTRAKTIONSREGELN:**

1. **Kundendaten:**
   - Suche nach Namen in der Signatur, Grussformel oder im Text
   - E-Mail-Adressen und Telefonnummern aus Signatur extrahieren
   - Wenn jemand "ich" oder "wir" schreibt, ist der Absender wahrscheinlich auch Teilnehmer oder Elternteil

2. **Teilnehmer (MIT individuellen Buchungen):**
   - "Meine beiden Kinder" = 2 Teilnehmer
   - "Wir sind zu viert" = 4 Teilnehmer
   - "Für mich und meinen Mann" = 2 Erwachsene
   - Alter aus Kontext ableiten: "Kinder" = unter 16, "Erwachsene" = über 16
   - Geburtsdaten im Format TT.MM.JJJJ suchen und zu YYYY-MM-DD konvertieren
   - **WICHTIG:** Für jeden Teilnehmer ein booking-Objekt mit dates und product_suggestion erstellen!

3. **Daten und Zeiten:**
   - "Nächste Woche" oder "im Januar" ist NICHT spezifisch genug → als fehlend markieren, aber in date_description speichern
   - "15. bis 20. Januar" = 6 spezifische Tage
   - "Montag bis Freitag" ohne konkretes Datum = fehlend
   - Bei Privatstunden: Uhrzeiten wie "09:00-12:00" oder "Vormittag" extrahieren
   - **BEACHTE:** Verschiedene Teilnehmer können unterschiedliche Tage haben!

**DATUM UND WOCHENTAG EXTRAKTION (WICHTIG!):**
   - Wenn der Kunde einen Wochentag MIT einem Datum nennt, extrahiere BEIDES!
   - Das Feld "mentioned_weekday" speichert den vom Kunden genannten Wochentag
   - Beispiele:
     * "am Montag, 17. Januar" → date: "2026-01-17", mentioned_weekday: "Montag"
     * "Samstag, den 18.01.2026" → date: "2026-01-18", mentioned_weekday: "Samstag"
     * "am 17.01." (ohne Wochentag) → date: "2026-01-17", mentioned_weekday: null
     * "nächsten Freitag" → date: [berechne nächsten Freitag], mentioned_weekday: "Freitag"
   - WICHTIG: Extrahiere den genannten Wochentag IMMER, auch wenn er nicht zum Datum passt!
     Die Validierung erfolgt in einem separaten Schritt.

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

**BEISPIEL für Familie mit unterschiedlichen Levels:**
{
  "participants": [
    {
      "name": "Emma Streiff",
      "age": 8,
      "skill_level": "beginner",
      "booking": {
        "product_type": "group",
        "product_suggestion": "anfaenger-gruppenkurs",
        "dates": [{"date": "2026-01-15"}, {"date": "2026-01-16"}],
        "lunch_supervision": true
      }
    },
    {
      "name": "Lukas Streiff",
      "age": 11,
      "skill_level": "intermediate",
      "booking": {
        "product_type": "group",
        "product_suggestion": "fortgeschrittenen-gruppenkurs",
        "dates": [{"date": "2026-01-15"}, {"date": "2026-01-16"}, {"date": "2026-01-17"}]
      }
    }
  ],
  "booking_summary": {
    "has_different_levels": true,
    "has_different_dates": true,
    "warnings": ["Teilnehmer haben unterschiedliche Niveaus", "Teilnehmer haben unterschiedliche Kurstage"]
  }
}

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
            description: "Liste der Teilnehmer mit individuellen Buchungsdetails",
            items: {
              type: "object",
              properties: {
                first_name: { type: "string", description: "Vorname des Teilnehmers" },
                last_name: { type: "string", description: "Nachname des Teilnehmers" },
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
                booking: {
                  type: "object",
                  description: "Individuelle Buchungsdetails für diesen Teilnehmer",
                  properties: {
                    product_type: {
                      type: "string",
                      enum: ["private", "group", "unknown"],
                      description: "Art der Buchung für diesen Teilnehmer",
                    },
                    product_suggestion: {
                      type: "string",
                      description: "Vorgeschlagenes Produkt basierend auf Alter und Level (z.B. 'windel-wedel', 'anfaenger-gruppenkurs', 'fortgeschrittenen-gruppenkurs')",
                    },
                    dates: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          date: { type: "string", description: "Datum im Format YYYY-MM-DD" },
                          mentioned_weekday: { 
                            type: "string", 
                            description: "Der vom Kunden genannte Wochentag (z.B. 'Montag', 'Mo', 'Samstag'), null wenn kein Wochentag genannt wurde" 
                          },
                          start_time: { type: "string", description: "Startzeit im Format HH:MM" },
                          end_time: { type: "string", description: "Endzeit im Format HH:MM" },
                        },
                        required: ["date"],
                      },
                    },
                    lunch_supervision: { type: "boolean", description: "Mittagsbetreuung für diesen Teilnehmer" },
                    is_vegetarian: { type: "boolean", description: "Vegetarisches Mittagessen" },
                  },
                },
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
                    mentioned_weekday: { 
                      type: "string", 
                      description: "Der vom Kunden genannte Wochentag (z.B. 'Montag', 'Mo'), null wenn nicht genannt" 
                    },
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
          booking_summary: {
            type: "object",
            description: "Zusammenfassung für schnelle Analyse bei mehreren Teilnehmern",
            properties: {
              total_participants: { type: "number", description: "Anzahl Teilnehmer" },
              has_different_levels: { 
                type: "boolean", 
                description: "True wenn Teilnehmer unterschiedliche Skill-Levels haben" 
              },
              has_different_dates: { 
                type: "boolean", 
                description: "True wenn Teilnehmer unterschiedliche Buchungstage haben" 
              },
              has_different_products: { 
                type: "boolean", 
                description: "True wenn Teilnehmer unterschiedliche Produkte brauchen" 
              },
              date_range: {
                type: "object",
                properties: {
                  start: { type: "string", description: "Frühestes Datum YYYY-MM-DD" },
                  end: { type: "string", description: "Spätestes Datum YYYY-MM-DD" },
                },
              },
              warnings: {
                type: "array",
                items: { type: "string" },
                description: "Liste von Warnungen (z.B. 'Unterschiedliche Niveaus')",
              },
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

    // 5. Apply fallback parsing for booking data that AI might have missed
    // Pass notes as additional source for time parsing
    const extractedNotes = extractedData.notes as string | undefined;
    const enrichedData = extractBookingDataFallback(messageContent, extractedData, extractedNotes);

    // 6. Validate and clean extracted data
    const cleanedData = validateAndCleanExtraction(enrichedData, isExistingCustomer);

    // Add customer matching info to extracted data
    cleanedData.matched_customer_id = matchedCustomerId;
    cleanedData.is_existing_customer = isExistingCustomer;

    // 7. Update conversation with AI data and new rule-based scores
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

  // Generate or enhance booking_summary for participant-specific bookings
  data.booking_summary = generateBookingSummary(data);

  // Validate date/weekday matches and add conflicts to booking_summary
  const dateConflicts = validateAllDates(data);
  if (dateConflicts.length > 0) {
    const summary = (data.booking_summary as Record<string, unknown>) || {};
    summary.date_conflicts = dateConflicts;
    summary.has_date_conflicts = true;
    
    const warnings = (summary.warnings as string[]) || [];
    warnings.push(
      `Datum/Wochentag-Konflikt: ${dateConflicts.length} Datum(e) stimmen nicht mit dem genannten Wochentag überein`
    );
    summary.warnings = warnings;
    data.booking_summary = summary;
  }

  // Ensure backwards compatibility: populate global booking object from participant bookings
  ensureBackwardsCompatibility(data);

  // Calculate rule-based completeness with context awareness
  const completenessResult = calculateDataCompleteness(data, isExistingCustomer);

  // Store both the AI's original confidence and the calculated completeness
  data.ai_original_confidence = data.confidence;
  data.confidence = completenessResult.score;
  data.data_completeness = completenessResult.score;
  
  // Date conflicts prevent booking from being ready
  const bookingSummary = data.booking_summary as Record<string, unknown> | undefined;
  const hasDateConflicts = bookingSummary?.has_date_conflicts === true;
  data.booking_ready = hasDateConflicts ? false : completenessResult.bookingReady;
  
  // Use the calculated missing fields (more accurate than AI-reported)
  // Add date conflict warning to missing fields if conflicts exist
  const missingFields = [...completenessResult.missingRequired];
  if (hasDateConflicts && !missingFields.includes("date_weekday_conflict")) {
    missingFields.push("date_weekday_conflict");
  }
  data.missing_information = missingFields;

  return data;
}

// Generate booking summary from participant-specific bookings
function generateBookingSummary(data: Record<string, unknown>): Record<string, unknown> {
  const participants = (data.participants as Array<Record<string, unknown>>) || [];
  const globalBooking = (data.booking as Record<string, unknown>) || {};
  const existingSummary = (data.booking_summary as Record<string, unknown>) || {};
  
  if (participants.length === 0) {
    return existingSummary;
  }

  // Collect unique levels
  const levels = new Set<string>();
  const productTypes = new Set<string>();
  const allDates: string[] = [];
  const dateSets: Set<string>[] = [];

  for (const p of participants) {
    const level = p.skill_level as string | undefined;
    if (level && level !== "unknown") {
      levels.add(level);
    }

    const pBooking = (p.booking as Record<string, unknown>) || {};
    const productType = (pBooking.product_type || globalBooking.product_type) as string | undefined;
    if (productType && productType !== "unknown") {
      productTypes.add(productType);
    }

    const pDates = (pBooking.dates || globalBooking.dates) as Array<Record<string, unknown>> | undefined;
    const dateSet = new Set<string>();
    if (pDates) {
      for (const d of pDates) {
        const dateStr = d.date as string;
        if (dateStr) {
          allDates.push(dateStr);
          dateSet.add(dateStr);
        }
      }
    }
    dateSets.push(dateSet);
  }

  // Check if participants have different dates
  let hasDifferentDates = false;
  if (dateSets.length > 1) {
    const firstSet = dateSets[0];
    for (let i = 1; i < dateSets.length; i++) {
      if (dateSets[i].size !== firstSet.size || 
          ![...dateSets[i]].every(d => firstSet.has(d))) {
        hasDifferentDates = true;
        break;
      }
    }
  }

  // Generate warnings
  const warnings: string[] = [];
  if (levels.size > 1) {
    const levelLabels: Record<string, string> = {
      beginner: "Anfänger",
      intermediate: "Fortgeschritten",
      advanced: "Experte",
      expert: "Experte"
    };
    const levelNames = [...levels].map(l => levelLabels[l] || l).join(", ");
    warnings.push(`Teilnehmer haben unterschiedliche Niveaus (${levelNames})`);
  }
  if (hasDifferentDates) {
    warnings.push("Teilnehmer haben unterschiedliche Kurstage");
  }
  if (productTypes.size > 1) {
    warnings.push("Teilnehmer haben unterschiedliche Kurstypen");
  }

  // Calculate date range
  const sortedDates = [...new Set(allDates)].sort();
  const dateRange = sortedDates.length > 0 ? {
    start: sortedDates[0],
    end: sortedDates[sortedDates.length - 1]
  } : undefined;

  return {
    ...existingSummary,
    total_participants: participants.length,
    has_different_levels: levels.size > 1,
    has_different_dates: hasDifferentDates,
    has_different_products: productTypes.size > 1,
    date_range: dateRange,
    warnings: warnings.length > 0 ? warnings : (existingSummary.warnings || [])
  };
}

// Date/Weekday Validation Types
interface DateValidationResult {
  date: string;
  mentioned_weekday: string | null;
  actual_weekday: string;
  is_valid: boolean;
  conflict_type: "none" | "weekday_mismatch";
  suggestion: string | null;
  participant_name?: string;
}

// German weekday names for validation
const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Format date in German format
function formatDateGerman(dateStr: string): string {
  const date = new Date(dateStr);
  const weekday = WEEKDAYS[date.getDay()];
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${weekday}, ${day}.${month}.${year}`;
}

// Validate a single date against its mentioned weekday
function validateDateWeekday(
  dateStr: string,
  mentionedWeekday: string | null
): DateValidationResult {
  const date = new Date(dateStr);
  const actualWeekday = WEEKDAYS[date.getDay()];
  const actualWeekdayShort = WEEKDAYS_SHORT[date.getDay()];

  // No weekday mentioned = no conflict possible
  if (!mentionedWeekday) {
    return {
      date: dateStr,
      mentioned_weekday: null,
      actual_weekday: actualWeekday,
      is_valid: true,
      conflict_type: "none",
      suggestion: null,
    };
  }

  // Normalize mentioned weekday for comparison
  const normalizedMentioned = mentionedWeekday.toLowerCase().trim();
  const normalizedActual = actualWeekday.toLowerCase();
  const normalizedActualShort = actualWeekdayShort.toLowerCase();

  // Check for match (including partial matches like "Mo" for "Montag")
  const isMatch =
    normalizedActual === normalizedMentioned ||
    normalizedActualShort === normalizedMentioned ||
    normalizedActual.startsWith(normalizedMentioned.slice(0, 2)) ||
    normalizedMentioned.startsWith(normalizedActualShort);

  if (isMatch) {
    return {
      date: dateStr,
      mentioned_weekday: mentionedWeekday,
      actual_weekday: actualWeekday,
      is_valid: true,
      conflict_type: "none",
      suggestion: null,
    };
  }

  // Conflict detected - find next occurrence of mentioned weekday
  const mentionedDayIndex = WEEKDAYS.findIndex((w) =>
    w.toLowerCase().startsWith(normalizedMentioned.slice(0, 2))
  );

  let nextOccurrence: string | null = null;
  if (mentionedDayIndex !== -1) {
    const tempDate = new Date(dateStr);
    const daysUntilNext = (mentionedDayIndex - tempDate.getDay() + 7) % 7 || 7;
    tempDate.setDate(tempDate.getDate() + daysUntilNext);
    nextOccurrence = tempDate.toISOString().split("T")[0];
  }

  return {
    date: dateStr,
    mentioned_weekday: mentionedWeekday,
    actual_weekday: actualWeekday,
    is_valid: false,
    conflict_type: "weekday_mismatch",
    suggestion: nextOccurrence
      ? `Der ${mentionedWeekday} wäre der ${formatDateGerman(nextOccurrence)}`
      : null,
  };
}

// Validate all dates in extracted data
function validateAllDates(data: Record<string, unknown>): DateValidationResult[] {
  const dateConflicts: DateValidationResult[] = [];
  const participants = (data.participants as Array<Record<string, unknown>>) || [];
  const globalBooking = (data.booking as Record<string, unknown>) || {};

  // Check participant-level dates
  for (const participant of participants) {
    const pBooking = (participant.booking as Record<string, unknown>) || {};
    const dates = (pBooking.dates as Array<Record<string, unknown>>) || [];
    const participantName = (participant.name as string) || (participant.first_name as string);

    for (const dateInfo of dates) {
      const dateStr = dateInfo.date as string;
      const mentionedWeekday = dateInfo.mentioned_weekday as string | null;

      if (dateStr) {
        const validation = validateDateWeekday(dateStr, mentionedWeekday);

        // Add actual weekday to date info for display
        dateInfo.actual_weekday = validation.actual_weekday;
        dateInfo.is_valid = validation.is_valid;

        if (!validation.is_valid) {
          dateConflicts.push({
            ...validation,
            participant_name: participantName,
          });
        }
      }
    }
  }

  // Check global booking dates
  const globalDates = (globalBooking.dates as Array<Record<string, unknown>>) || [];
  for (const dateInfo of globalDates) {
    const dateStr = dateInfo.date as string;
    const mentionedWeekday = dateInfo.mentioned_weekday as string | null;

    if (dateStr) {
      const validation = validateDateWeekday(dateStr, mentionedWeekday);

      dateInfo.actual_weekday = validation.actual_weekday;
      dateInfo.is_valid = validation.is_valid;

      if (!validation.is_valid) {
        // Avoid duplicates if already added from participant
        const isDuplicate = dateConflicts.some(
          (c) => c.date === validation.date && c.mentioned_weekday === validation.mentioned_weekday
        );
        if (!isDuplicate) {
          dateConflicts.push(validation);
        }
      }
    }
  }

  return dateConflicts;
}

// Ensure backwards compatibility by populating global booking from participant bookings
function ensureBackwardsCompatibility(data: Record<string, unknown>): void {
  const participants = (data.participants as Array<Record<string, unknown>>) || [];
  const globalBooking = (data.booking as Record<string, unknown>) || {};

  // If participants have individual bookings, merge into global booking for legacy support
  if (participants.some(p => p.booking)) {
    const allDates: Array<Record<string, unknown>> = [];
    let dominantProductType: string | undefined;

    for (const p of participants) {
      const pBooking = (p.booking as Record<string, unknown>) || {};
      const pDates = (pBooking.dates as Array<Record<string, unknown>>) || [];
      
      for (const d of pDates) {
        const dateStr = d.date as string;
        if (dateStr && !allDates.some(existing => existing.date === dateStr)) {
          allDates.push({ ...d });
        }
      }

      if (!dominantProductType && pBooking.product_type) {
        dominantProductType = pBooking.product_type as string;
      }
    }

    // Update global booking with merged data
    if (allDates.length > 0 && (!globalBooking.dates || (globalBooking.dates as Array<unknown>).length === 0)) {
      globalBooking.dates = allDates.sort((a, b) => 
        (a.date as string).localeCompare(b.date as string)
      );
    }
    if (dominantProductType && !globalBooking.product_type) {
      globalBooking.product_type = dominantProductType;
    }

    data.booking = globalBooking;
  }
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

/**
 * Fallback extraction for booking data that AI might have missed.
 * Parses dates, times, and product type from raw conversation content.
 * Uses scoring heuristics to select the best time when multiple are found.
 */
function extractBookingDataFallback(
  content: string,
  extractedData: Record<string, unknown>,
  notes?: string
): Record<string, unknown> {
  console.log("=== extractBookingDataFallback START ===");
  console.log("Content length:", content.length);
  
  // Ensure booking object exists
  const booking = (extractedData.booking || {}) as Record<string, unknown>;
  const dates = ((booking.dates || []) as Array<Record<string, unknown>>).slice();
  
  console.log("Existing dates before fallback:", JSON.stringify(dates));
  console.log("Existing product_type:", booking.product_type);
  
  // If no dates extracted, try to parse from content
  if (dates.length === 0) {
    // Match German date formats: "17.01.2026", "15. Januar"
    const dateRegex = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;
    let dateMatch;
    while ((dateMatch = dateRegex.exec(content)) !== null) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      const year = dateMatch[3];
      const isoDate = `${year}-${month}-${day}`;
      // Avoid duplicates
      if (!dates.some(d => d.date === isoDate)) {
        dates.push({ date: isoDate });
        console.log("Fallback: Extracted date", isoDate);
      }
    }
    
    // Also try "Samstag, 17.01.2026" or similar
    const namedDateRegex = /(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)[,\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})/gi;
    let namedMatch;
    while ((namedMatch = namedDateRegex.exec(content)) !== null) {
      const day = namedMatch[1].padStart(2, '0');
      const month = namedMatch[2].padStart(2, '0');
      const year = namedMatch[3];
      const isoDate = `${year}-${month}-${day}`;
      if (!dates.some(d => d.date === isoDate)) {
        dates.push({ date: isoDate });
        console.log("Fallback: Extracted named date", isoDate);
      }
    }
  }
  
  // --- IMPROVED TIME EXTRACTION WITH SCORING ---
  // Find ALL time candidates and their positions, then score them
  interface TimeCandidate {
    start: string;
    end: string;
    position: number;
    matchText: string;
    score: number;
  }
  
  const timeCandidates: TimeCandidate[] = [];
  
  // Time patterns to search for
  const timePatternRegex = /(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(?:Uhr|h)?/gi;
  
  let timeMatch;
  while ((timeMatch = timePatternRegex.exec(content)) !== null) {
    const startHour = parseInt(timeMatch[1]);
    const startMin = timeMatch[2] || '00';
    const endHour = parseInt(timeMatch[3]);
    const endMin = timeMatch[4] || '00';
    
    // Validate hours are reasonable (09-16 for ski school)
    if (startHour >= 8 && startHour <= 16 && endHour >= 9 && endHour <= 17 && endHour > startHour) {
      timeCandidates.push({
        start: `${startHour.toString().padStart(2, '0')}:${startMin}`,
        end: `${endHour.toString().padStart(2, '0')}:${endMin}`,
        position: timeMatch.index,
        matchText: timeMatch[0],
        score: 0
      });
    }
  }
  
  console.log("Fallback: Found", timeCandidates.length, "time candidates");
  
  // Score each candidate based on surrounding context
  const negativePatterns = [
    /leider/gi,
    /keine\s*(freien?\s*)?Kapazit/gi,
    /nicht\s*(mehr\s*)?verfügbar/gi,
    /nicht\s*möglich/gi,
    /ausgebucht/gi,
    /bereits\s*belegt/gi,
  ];
  
  const positivePatterns = [
    /buchen/gi,
    /bestätigt/gi,
    /reserviert/gi,
    /möchte/gi,
    /würde\s*gerne/gi,
    /bitte/gi,
    /perfekt/gi,
    /passt/gi,
  ];
  
  for (const candidate of timeCandidates) {
    // Get surrounding context (100 chars before and after)
    const contextStart = Math.max(0, candidate.position - 100);
    const contextEnd = Math.min(content.length, candidate.position + candidate.matchText.length + 100);
    const context = content.substring(contextStart, contextEnd).toLowerCase();
    
    // Check for negative patterns (penalize)
    for (const pattern of negativePatterns) {
      if (pattern.test(context)) {
        candidate.score -= 10;
        console.log(`Fallback: Penalizing "${candidate.matchText}" for negative context`);
      }
    }
    
    // Check for positive patterns (boost)
    for (const pattern of positivePatterns) {
      if (pattern.test(context)) {
        candidate.score += 5;
      }
    }
    
    // Later positions in the text often represent confirmed times (boost slightly)
    candidate.score += candidate.position / content.length * 2;
    
    console.log(`Fallback: Candidate "${candidate.matchText}" score: ${candidate.score}`);
  }
  
  // Select the best candidate
  let extractedTime: { start: string; end: string } | null = null;
  
  if (timeCandidates.length > 0) {
    // Sort by score descending and pick the best
    timeCandidates.sort((a, b) => b.score - a.score);
    const best = timeCandidates[0];
    extractedTime = { start: best.start, end: best.end };
    console.log("Fallback: Selected best time:", extractedTime.start, "-", extractedTime.end, "with score", best.score);
  }
  
  // Also try parsing from notes as additional source
  if (!extractedTime && notes) {
    const notesTimeMatch = notes.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (notesTimeMatch) {
      extractedTime = {
        start: `${notesTimeMatch[1].padStart(2, '0')}:${notesTimeMatch[2]}`,
        end: `${notesTimeMatch[3].padStart(2, '0')}:${notesTimeMatch[4]}`
      };
      console.log("Fallback: Extracted time from notes:", extractedTime.start, "-", extractedTime.end);
    }
  }
  
  // Apply extracted time to ALL dates that don't have times yet
  if (extractedTime && dates.length > 0) {
    for (const d of dates) {
      if (!d.start_time) {
        d.start_time = extractedTime.start;
        d.end_time = extractedTime.end;
        console.log("Fallback: Applied time to date", d.date);
      }
    }
  }
  
  // Detect product type from keywords if not already set or unknown
  if (!booking.product_type || booking.product_type === "unknown") {
    if (/privat|private|einzelstunde|einzelunterricht/i.test(content)) {
      booking.product_type = "private";
      console.log("Fallback: Detected product_type = private");
    } else if (/gruppe|gruppenkurs|kinderskikurs|skikurs|snowli/i.test(content)) {
      booking.product_type = "group";
      console.log("Fallback: Detected product_type = group");
    }
  }

  // Parse address if it's a string instead of an object
  const customer = extractedData.customer as Record<string, unknown> | undefined;
  if (customer) {
    if (typeof customer.address === "string" && customer.address.length > 5) {
      const parsed = parseAddressString(customer.address);
      if (parsed) {
        customer.address = parsed;
        console.log("Fallback: Parsed address:", JSON.stringify(parsed));
      }
    }
  }
  
  // Extract participant count if mentioned
  const participantMatch = content.match(/(?:für\s+)?(\d+)\s*(?:Person(?:en)?|Teilnehmer|Kind(?:er)?)/i);
  if (participantMatch && !booking.participant_count) {
    booking.participant_count = parseInt(participantMatch[1]);
    console.log("Fallback: Detected participant count:", booking.participant_count);
  }
  
  // CRITICAL: Always persist booking object with dates
  booking.dates = dates;
  extractedData.booking = booking;
  
  console.log("=== extractBookingDataFallback END ===");
  console.log("Final dates:", JSON.stringify(dates));
  console.log("Final product_type:", booking.product_type);
  
  return extractedData;
}

/**
 * Parse a Swiss/Liechtenstein address string into structured components.
 * E.g., "Im Riet 58, 9495 Triesen" → { street: "Im Riet 58", zip: "9495", city: "Triesen", country: "LI" }
 */
function parseAddressString(addressString: string): Record<string, string> | null {
  // Pattern: "Street Number, ZIP City" or "Street Number\nZIP City"
  const match = addressString.match(/^(.+?)[,\n]\s*(?:CH-|LI-|AT-|DE-)?(\d{4,5})\s+(.+)$/);
  if (match) {
    const zip = match[2];
    let country = "CH";
    // Determine country from ZIP
    const zipNum = parseInt(zip);
    if (zip.length === 4 && zipNum >= 9490 && zipNum <= 9498) {
      country = "LI";
    } else if (zip.length === 4 && zipNum >= 6800 && zipNum <= 6899) {
      country = "AT";
    } else if (zip.length === 5 && zipNum >= 10000) {
      country = "DE";
    }
    
    return {
      street: match[1].trim(),
      zip: zip,
      city: match[3].trim(),
      country: country
    };
  }
  return null;
}
