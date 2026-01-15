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
    email?: string;
    phone?: string;
  };
  participants?: Array<{
    name?: string;
    age?: number;
    level?: string;
  }>;
  booking?: {
    type?: string;
    start_date?: string;
    end_date?: string;
    time_preference?: string;
    lesson_type?: string;
    sport?: string;
  };
  notes?: string;
  confidence?: number;
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

    // Step 1: Fetch conversation data
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
    const extractedData = conv.ai_extracted_data || {};
    const classification = conv.classification || extractedData.classification || "other";
    const detectedLanguage = conv.detected_language || extractedData.detected_language || "de";
    const missingInfo = extractedData.missing_information || [];

    // Step 2: Fetch customer context if available
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
      customerName = [custData.first_name, custData.last_name].filter(Boolean).join(" ");
    }

    // Format extracted entities for prompt
    const extractedEntities = formatExtractedEntities(extractedData);
    const missingInfoFormatted = missingInfo.length > 0 
      ? missingInfo.join(", ") 
      : "Keine fehlenden Informationen erkannt";

    // Step 3: Construct the dynamic system prompt
    const systemPrompt = `Du bist ein freundlicher und effizienter Assistent für die Yeti Skischule in Malbun, Liechtenstein.
Deine Aufgabe ist es, eine passende Antwort auf eine Kundenanfrage zu formulieren.

**Anweisungen:**
1.  **Sprache:** Formuliere die Antwort in ${detectedLanguage === "en" ? "Englisch" : "Deutsch"}.
2.  **Ton:** Immer professionell, hilfsbereit und leicht herzlich. Sprich den Kunden mit Namen an, falls bekannt.
3.  **Kontext beachten:**
    - **Klassifizierung:** Die Anfrage wurde als "${getClassificationLabel(classification)}" klassifiziert.
    - **Bestandskunde:** ${isExistingCustomer ? "Ja, Bestandskunde" : "Nein, Neukunde"}. ${isExistingCustomer ? "Bedanke dich für die erneute Kontaktaufnahme." : ""}${bookingHistory}
    - **Extrahierte Daten:** ${extractedEntities}
    - **Kundenname:** ${customerName || "Unbekannt"}
4.  **Zielgerichtet antworten:**
    - **Bei fehlenden Informationen (${missingInfoFormatted}):** Formuliere höfliche und klare Rückfragen, um die fehlenden Details zu erhalten.
    - **Bei vollständigen Informationen:** Bestätige die Anfrage und informiere über die nächsten Schritte (z.B. "Wir prüfen die Verfügbarkeit und senden Ihnen in Kürze eine Bestätigung.").
    - **Bei Storno/Umbuchung:** Zeige Verständnis und frage nach der Buchungsnummer, falls diese fehlt.
    - **Bei Allgemeiner Anfrage:** Beantworte die Frage direkt, falls möglich.

**Beispiel-Struktur:**
1.  Freundliche Anrede (mit Namen, falls bekannt).
2.  Dank für die Anfrage.
3.  Zusammenfassung des erkannten Anliegens (z.B. "Gerne prüfe ich Ihre Anfrage für einen Privatkurs...").
4.  Gezielte Rückfragen für die fehlenden Informationen (falls zutreffend).
5.  Abschliessende, freundliche Grussformel mit "Ihr Yeti Team".

Formuliere nur die Antwort. Keine zusätzlichen Kommentare.`;

    const userMessage = `Bitte formuliere eine Antwort auf die folgende Kundenanfrage:

Betreff: ${conv.subject || "Keine Betreff"}
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
    const subject = conv.subject 
      ? `Re: ${conv.subject}` 
      : `Re: Ihre Anfrage bei der Yeti Skischule`;

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

function formatExtractedEntities(data: ExtractedData): string {
  const parts: string[] = [];

  if (data.booking) {
    const b = data.booking;
    if (b.lesson_type) parts.push(`Unterrichtsart: ${b.lesson_type}`);
    if (b.sport) parts.push(`Sportart: ${b.sport}`);
    if (b.start_date) parts.push(`Startdatum: ${b.start_date}`);
    if (b.end_date) parts.push(`Enddatum: ${b.end_date}`);
    if (b.time_preference) parts.push(`Zeitpräferenz: ${b.time_preference}`);
  }

  if (data.participants && data.participants.length > 0) {
    const pNames = data.participants
      .map(p => p.name || "Unbekannt")
      .join(", ");
    parts.push(`Teilnehmer: ${pNames} (${data.participants.length} Person(en))`);
  }

  return parts.length > 0 ? parts.join("; ") : "Keine spezifischen Details extrahiert";
}
