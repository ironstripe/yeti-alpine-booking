import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedData {
  classification?: string;
  detected_language?: string;
  missing_information?: string[];
  customer?: {
    first_name?: string;
    last_name?: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: {
      street?: string;
      zip?: string;
      city?: string;
      country?: string;
    };
  };
  participants?: Array<{
    first_name?: string;
    name?: string;
    age?: number;
    birth_date?: string;
    skill_level?: string;
    discipline?: string;
  }>;
  booking?: {
    product_type?: string;
    dates?: Array<{
      date: string;
      start_time?: string;
      end_time?: string;
      time_preference?: string;
    }>;
    date_description?: string;
    start_date?: string;
    end_date?: string;
    lunch_supervision?: boolean;
    vegetarian?: boolean;
    special_requests?: string;
  };
  notes?: string;
  confidence?: number;
  data_completeness?: number;
  booking_ready?: boolean;
}

interface Conversation {
  id: string;
  contact_identifier: string;
  contact_name: string | null;
  content: string;
  subject: string | null;
  channel: string;
  ai_extracted_data: ExtractedData | null;
  classification: string | null;
  detected_language: string | null;
  matched_customer_id: string | null;
  booking_ready: boolean | null;
}

interface Customer {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();

    console.log("generate-reply called for conversationId:", conversationId);

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: "conversationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1A: Fetch AI Configuration
    const { data: configData, error: configError } = await supabase
      .from("ai_configuration")
      .select("key, value");

    if (configError) {
      console.error("Error fetching AI configuration:", configError);
    }

    const tonalityPrompt =
      configData?.find((c: { key: string; value: string }) => c.key === "tonality_prompt")?.value ||
      "Antworte professionell, aber herzlich und nahbar. Kunden immer mit 'Sie' ansprechen. Positive und lösungsorientierte Sprache verwenden.";
    const signaturePrompt =
      configData?.find((c: { key: string; value: string }) => c.key === "signature_prompt")?.value ||
      "Freundliche Grüsse aus dem verschneiten Malbun,\nIhr Yeti Team";

    // Step 1B: Fetch and read Knowledge Documents
    const { data: documents, error: docError } = await supabase
      .from("ai_knowledge_documents")
      .select("storage_path, file_name");

    let knowledgeBaseContent = "";
    if (documents && documents.length > 0 && !docError) {
      console.log(`Found ${documents.length} knowledge documents`);
      for (const doc of documents) {
        try {
          const { data: fileContent, error: fileError } = await supabase.storage
            .from("ai_knowledge_base")
            .download(doc.storage_path);

          if (fileContent && !fileError) {
            const textContent = await fileContent.text();
            if (textContent.trim()) {
              knowledgeBaseContent += `\n\n--- WISSENSDOKUMENT: ${doc.file_name} ---\n${textContent}\n--- ENDE WISSENSDOKUMENT ---`;
            }
          }
        } catch (e) {
          console.error(`Error reading document ${doc.file_name}:`, e);
        }
      }
    }

    // Step 2: Fetch conversation data
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("Error fetching conversation:", convError);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const conv = conversation as Conversation;
    const extractedData = (conv.ai_extracted_data || {}) as ExtractedData;
    const classification = conv.classification || extractedData.classification || "other";
    const detectedLanguage = conv.detected_language || extractedData.detected_language || "de";
    const missingInfo = extractedData.missing_information || [];
    const bookingReady = conv.booking_ready || extractedData.booking_ready || false;

    // Step 3: Fetch customer context if available
    let customerName = conv.contact_name || "";
    let isExistingCustomer = false;
    let bookingHistory = "";

    if (conv.matched_customer_id) {
      const { data: customer, error: custError } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email")
        .eq("id", conv.matched_customer_id)
        .single();

      if (customer && !custError) {
        const cust = customer as Customer;
        customerName = [cust.first_name, cust.last_name].filter(Boolean).join(" ");
        isExistingCustomer = true;

        // Fetch recent bookings for context
        const { data: tickets } = await supabase
          .from("tickets")
          .select("id, created_at, total_amount, status")
          .eq("customer_id", cust.id)
          .order("created_at", { ascending: false })
          .limit(3);

        if (tickets && tickets.length > 0) {
          bookingHistory = `\nDer Kunde hat ${tickets.length} frühere Buchung(en).`;
        }
      }
    }

    // Use customer name from extraction if not found elsewhere
    if (!customerName && extractedData.customer) {
      const custData = extractedData.customer;
      customerName =
        [custData.first_name, custData.last_name].filter(Boolean).join(" ") ||
        custData.name ||
        "";
    }

    // Build the intelligent system prompt
    const systemPrompt = buildReplySystemPrompt(
      classification,
      detectedLanguage,
      isExistingCustomer,
      customerName,
      missingInfo,
      extractedData,
      bookingHistory,
      bookingReady,
      tonalityPrompt,
      signaturePrompt,
      knowledgeBaseContent
    );

    const userMessage = `Bitte formuliere eine Antwort auf die folgende Kundenanfrage:

Betreff: ${conv.subject || "Kein Betreff"}
Kanal: ${conv.channel}

Nachricht:
${conv.content}`;

    // Step 4: Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const generatedReply = aiData.choices?.[0]?.message?.content || "";

    // Step 5: Construct and return the response
    const subject = conv.subject ? `Re: ${conv.subject}` : `Re: Ihre Anfrage bei der Yeti Skischule`;

    return new Response(
      JSON.stringify({
        suggested_reply: {
          to: conv.contact_identifier,
          subject: subject,
          body: generatedReply.trim(),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-reply:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildReplySystemPrompt(
  classification: string,
  detectedLanguage: string,
  isExistingCustomer: boolean,
  customerName: string,
  missingFields: string[],
  extractedData: ExtractedData,
  bookingHistory: string,
  bookingReady: boolean,
  tonalityPrompt: string,
  signaturePrompt: string,
  knowledgeBaseContent: string
): string {
  // Group missing fields by category for natural questioning
  const missingCustomer = missingFields.filter((f) => f.startsWith("customer_"));
  const missingParticipant = missingFields.filter((f) => f.startsWith("participant_"));
  const missingBooking = missingFields.filter(
    (f) => f.startsWith("booking_") || f === "lunch_supervision" || f === "vegetarian_preference"
  );

  // Determine course type for conditional questions
  const courseType = extractedData?.booking?.product_type || "unknown";
  const isPrivate = courseType === "private";
  const isGroup = courseType === "group";

  // Build context-specific instructions
  let questionStrategy = "";

  if (bookingReady || missingFields.length === 0) {
    questionStrategy = `
**ALLE DATEN VORHANDEN:**
Die Buchung kann erstellt werden. Bestätige die Anfrage und fasse die Details zusammen.
Informiere über die nächsten Schritte (Verfügbarkeitsprüfung, Bestätigung folgt).`;
  } else if (missingFields.length <= 3) {
    questionStrategy = `
**WENIGE DATEN FEHLEN (${missingFields.length}):**
Stelle die fehlenden Fragen in einem natürlichen Absatz. Nicht als nummerierte Liste.
Fehlend: ${missingFields.map((f) => getMissingFieldLabel(f)).join(", ")}`;
  } else {
    // Prioritize questions - most important first
    const prioritizedMissing = prioritizeMissingFields(missingFields, isPrivate, isGroup);
    questionStrategy = `
**MEHRERE DATEN FEHLEN (${missingFields.length}):**
Priorisiere die wichtigsten 3-4 Fragen. Bündle zusammengehörige Fragen.

Priorität 1 (jetzt fragen): ${prioritizedMissing.slice(0, 4).map((f) => getMissingFieldLabel(f)).join(", ")}
${prioritizedMissing.length > 4 ? `Priorität 2 (später): ${prioritizedMissing.slice(4).map((f) => getMissingFieldLabel(f)).join(", ")}` : ""}

Priorisierungslogik:
1. Konkrete Daten (wenn "nächste Woche" o.ä. genannt wurde)
2. Teilnehmer-Details (Namen, Alter/Geburtsdatum)
3. Kurstyp (falls unklar)
4. Zeiten (nur bei Privatstunden)
5. Mittagsbetreuung (nur bei Ganztags-Gruppenkursen)`;
  }

  // Customer data handling
  let customerDataInstruction = "";
  if (isExistingCustomer) {
    customerDataInstruction = `
**BESTANDSKUNDE:**
${customerName || "Kunde"} ist bereits im System. Adresse und Kontaktdaten sind vorhanden.
Frage NICHT nach: Adresse, E-Mail, Telefonnummer (ausser zur Bestätigung).`;
  } else if (missingCustomer.length > 0) {
    customerDataInstruction = `
**NEUKUNDE:**
Frage nach Kontaktdaten/Adresse nur, wenn alle anderen wichtigen Daten bereits vorliegen.
Bündle Kontaktdaten-Fragen: "Für die Buchungsbestätigung benötigen wir noch Ihre Adresse und Telefonnummer."`;
  }

  // Course-type specific instructions
  let courseTypeInstruction = "";
  if (isPrivate) {
    courseTypeInstruction = `
**PRIVATSTUNDE:**
- Frage nach gewünschter Uhrzeit (Start und Ende)
- Übliche Zeiten: 09:00-12:00 (Vormittag), 13:00-16:00 (Nachmittag)
- Mittagsbetreuung ist bei Privatstunden nicht relevant`;
  } else if (isGroup) {
    courseTypeInstruction = `
**GRUPPENKURS:**
- Zeiten sind fix (Vormittag: 10:00-12:00, Nachmittag: 14:00-16:00, Ganztag: 10:00-16:00)
- Bei Ganztags-Kursen: Frage nach Mittagsbetreuung
- Bei Mittagsbetreuung: Frage ob vegetarisch`;
  } else if (missingBooking.includes("booking_course_type")) {
    courseTypeInstruction = `
**KURSTYP UNKLAR:**
Frage höflich nach, ob Privatunterricht oder Gruppenkurs gewünscht ist.
Kurzer Hinweis: Privatunterricht = individueller Unterricht, Gruppenkurs = mit anderen Kindern im gleichen Alter/Level.`;
  }

  // Format what was already extracted
  const extractedSummary = formatExtractedForPrompt(extractedData);

  return `Du bist ein freundlicher und effizienter Assistent für die Yeti Skischule in Malbun, Liechtenstein.
Deine Aufgabe ist es, eine passende Antwort auf eine Kundenanfrage zu formulieren.

**GLOBALE ANWEISUNGEN ZUR TONALITÄT:**
${tonalityPrompt}

**WISSENSDATENBANK (nutze dieses Wissen für allgemeine Fragen):**
${knowledgeBaseContent || "Kein Zusatzwissen vorhanden."}

**KONTEXT DER ANFRAGE:**
- Klassifizierung: ${getClassificationLabel(classification)}
- Sprache: ${detectedLanguage === "en" ? "Englisch" : "Deutsch"}
- Kunde: ${customerName || "Unbekannt"}
- Bestandskunde: ${isExistingCustomer ? "Ja" : "Nein"}
${bookingHistory}
${extractedSummary}

${customerDataInstruction}
${courseTypeInstruction}
${questionStrategy}

**STIL-REGELN FÜR DIE ANTWORT:**

1. Beginne mit einer freundlichen Begrüssung und Dank für die Anfrage
2. Fasse kurz zusammen, was du verstanden hast (zeigt dem Kunden, dass die Nachricht gelesen wurde)
3. Stelle fehlende Fragen NATÜRLICH und GEBÜNDELT – NICHT als nummerierte Liste!
4. Maximal 3-4 Fragen pro Nachricht, um den Kunden nicht zu überfordern
5. Bei mehreren Teilnehmern: "Könnten Sie uns die Vornamen und Geburtsdaten aller Teilnehmer mitteilen?"
6. Beende mit der vorgegebenen Grussformel

**BEISPIEL FÜR NATÜRLICHE NACHFRAGE:**
"Vielen Dank für Ihre Anfrage! Gerne organisieren wir den Skikurs für Ihre Familie.

Wir haben verstanden, dass Sie für 4 Personen in der Woche vom 15. Januar buchen möchten.

Um die Buchung abzuschliessen, benötigen wir noch einige Angaben: Könnten Sie uns die Vornamen und Geburtsdaten der Teilnehmer mitteilen? Ausserdem wäre es hilfreich zu wissen, welche Vorkenntnisse die einzelnen Personen mitbringen.

Freundliche Grüsse,
Ihr Yeti Team"

**VORGEGEBENE GRUSSFORMEL:**
${signaturePrompt}

Formuliere NUR die Antwort. Keine zusätzlichen Kommentare oder Erklärungen.
Sprache der Antwort: ${detectedLanguage === "en" ? "Englisch" : "Deutsch"}`;
}

function getClassificationLabel(classification: string): string {
  const labels: Record<string, string> = {
    new_booking: "Neue Buchungsanfrage",
    cancellation: "Stornierung",
    modification: "Umbuchung/Änderung",
    general_inquiry: "Allgemeine Anfrage",
    complaint: "Beschwerde",
    other: "Sonstige Anfrage",
  };
  return labels[classification] || "Sonstige Anfrage";
}

function getMissingFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    customer_name: "Vor- und Nachname",
    customer_contact: "E-Mail oder Telefon",
    customer_address: "Adresse",
    participant_names: "Teilnehmernamen",
    participant_birthdates: "Geburtsdaten/Alter",
    participant_skill_levels: "Könnensstufe",
    booking_dates: "Konkrete Daten",
    booking_course_type: "Kurstyp",
    booking_times: "Uhrzeiten",
    lunch_supervision: "Mittagsbetreuung",
    vegetarian_preference: "Vegetarisch",
  };
  return labels[field] || field.replace(/_/g, " ");
}

function prioritizeMissingFields(fields: string[], isPrivate: boolean, isGroup: boolean): string[] {
  const priority: Record<string, number> = {
    booking_dates: 1,
    booking_course_type: 2,
    participant_names: 3,
    participant_birthdates: 4,
    participant_skill_levels: 5,
    booking_times: isPrivate ? 3 : 10, // Only important for private
    lunch_supervision: isGroup ? 6 : 10,
    vegetarian_preference: isGroup ? 7 : 10,
    customer_name: 8,
    customer_contact: 9,
    customer_address: 10,
  };

  return [...fields].sort((a, b) => (priority[a] || 99) - (priority[b] || 99));
}

function formatExtractedForPrompt(data: ExtractedData): string {
  const parts: string[] = [];

  // Booking info
  if (data.booking) {
    const b = data.booking;
    if (b.product_type && b.product_type !== "unknown") {
      parts.push(`Kurstyp: ${b.product_type === "private" ? "Privatstunde" : "Gruppenkurs"}`);
    }
    if (b.dates && b.dates.length > 0) {
      parts.push(`Termine: ${b.dates.map((d) => d.date).join(", ")}`);
    } else if (b.date_description) {
      parts.push(`Zeitraum (unspezifisch): "${b.date_description}"`);
    }
    if (b.lunch_supervision !== undefined) {
      parts.push(`Mittagsbetreuung: ${b.lunch_supervision ? "Ja" : "Nein"}`);
    }
  }

  // Participants
  if (data.participants && data.participants.length > 0) {
    const pInfo = data.participants.map((p) => {
      const name = p.first_name || p.name || "Unbekannt";
      const ageInfo = p.age ? `${p.age}J` : p.birth_date ? `Geb. ${p.birth_date}` : "";
      const level = p.skill_level && p.skill_level !== "unknown" ? p.skill_level : "";
      return [name, ageInfo, level].filter(Boolean).join(" ");
    });
    parts.push(`Teilnehmer (${data.participants.length}): ${pInfo.join("; ")}`);
  }

  // Customer
  if (data.customer) {
    const c = data.customer;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name;
    if (name) parts.push(`Kunde: ${name}`);
  }

  return parts.length > 0 ? `\n**BEREITS EXTRAHIERTE DATEN:**\n${parts.join("\n")}` : "";
}
