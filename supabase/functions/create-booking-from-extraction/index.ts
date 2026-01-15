import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateBookingRequest {
  conversationId: string;
  customerId?: string;
  sendConfirmationAfterApproval?: boolean;
}

interface ExtractedCustomer {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    zip?: string;
    city?: string;
    country?: string;
  };
}

interface ExtractedParticipant {
  name?: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  age?: number;
  skill_level?: string;
  discipline?: string;
}

interface ExtractedBooking {
  product_type?: string;
  dates?: Array<{
    date: string;
    start_time?: string;
    end_time?: string;
    time_preference?: string;
  }>;
  date_range?: {
    start?: string;
    end?: string;
  };
  start_date?: string;
  end_date?: string;
  vegetarian?: boolean;
  special_requests?: string;
}

interface ExtractedData {
  customer?: ExtractedCustomer;
  participants?: ExtractedParticipant[];
  booking?: ExtractedBooking;
  booking_ready?: boolean;
  is_booking_request?: boolean;
}

// Check minimum viable fields for booking creation
function checkBookingReadiness(data: ExtractedData, contactIdentifier: string): { ready: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  // 1. Must be a booking request
  if (!data.is_booking_request) {
    missingFields.push("booking_intent");
  }

  // 2. Customer contact - need at least one way to reach them
  const hasCustomerContact = 
    data.customer?.email || 
    data.customer?.phone || 
    contactIdentifier;
  if (!hasCustomerContact) {
    missingFields.push("customer_contact");
  }

  // 3. Customer name (at least last name or full name)
  const hasCustomerName = 
    data.customer?.last_name || 
    data.customer?.name ||
    data.customer?.first_name;
  if (!hasCustomerName) {
    missingFields.push("customer_name");
  }

  // 4. At least one participant
  const hasParticipants = data.participants && data.participants.length > 0;
  if (!hasParticipants) {
    missingFields.push("participants");
  } else {
    // Check if participants have names
    const hasParticipantNames = data.participants!.some(p => p.name || p.first_name);
    if (!hasParticipantNames) {
      missingFields.push("participant_names");
    }
  }

  // 5. At least one date or date range
  const hasDates = 
    (data.booking?.dates && data.booking.dates.length > 0) ||
    data.booking?.date_range?.start ||
    data.booking?.start_date;
  if (!hasDates) {
    missingFields.push("booking_dates");
  }

  return {
    ready: missingFields.length === 0,
    missingFields,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { conversationId, customerId, sendConfirmationAfterApproval = true } = 
      await req.json() as CreateBookingRequest;

    console.log("Creating booking from conversation:", conversationId);

    // 1. Load conversation with extracted data
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("Conversation not found:", convError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Konversation nicht gefunden",
          code: "CONVERSATION_NOT_FOUND"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extractedData = conversation.ai_extracted_data as ExtractedData;
    if (!extractedData) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Keine extrahierten Daten verfügbar. Bitte zuerst KI-Analyse durchführen.",
          code: "NO_EXTRACTED_DATA"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if booking is ready using robust field validation
    const readinessCheck = checkBookingReadiness(extractedData, conversation.contact_identifier);
    
    // If explicitly marked as ready in DB, trust that
    const isReady = conversation.booking_ready || extractedData.booking_ready || readinessCheck.ready;
    
    if (!isReady) {
      const missingFieldsDE: Record<string, string> = {
        booking_intent: "Buchungsanfrage",
        customer_contact: "Kontaktdaten (E-Mail/Telefon)",
        customer_name: "Kundenname",
        participants: "Teilnehmer",
        participant_names: "Teilnehmernamen",
        booking_dates: "Buchungsdaten",
      };
      
      const missingReadable = readinessCheck.missingFields.map(f => missingFieldsDE[f] || f);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Buchungsdaten unvollständig. Fehlend: ${missingReadable.join(", ")}`,
          code: "INCOMPLETE_DATA",
          missingFields: readinessCheck.missingFields,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Booking readiness check passed");

    // 3. Get or create customer
    let finalCustomerId = customerId;
    const customerData = extractedData.customer || {};
    
    if (!finalCustomerId) {
      // Check for matched customer from conversation
      if (conversation.matched_customer_id) {
        finalCustomerId = conversation.matched_customer_id;
        console.log("Using matched customer from conversation:", finalCustomerId);
      } 
      // Try to find customer by email before creating (synchronized with ConvertToBookingButton)
      else if (customerData.email) {
        const { data: existingByEmail } = await supabase
          .from("customers")
          .select("id")
          .eq("email", customerData.email)
          .maybeSingle();
        
        if (existingByEmail) {
          finalCustomerId = existingByEmail.id;
          console.log("Found existing customer by email:", finalCustomerId);
        }
      }
      
      // If still no customer, create new one
      if (!finalCustomerId) {
        const nameParts = (customerData.name || "").split(" ");
        
        const newCustomerData = {
          first_name: customerData.first_name || nameParts[0] || "",
          last_name: customerData.last_name || nameParts.slice(1).join(" ") || "Unbekannt",
          email: customerData.email || conversation.contact_identifier || "unknown@example.com",
          phone: customerData.phone || "",
          street: customerData.address?.street || "",
          zip: customerData.address?.zip || "",
          city: customerData.address?.city || "",
          country: customerData.address?.country || "CH",
          holiday_address: "",
        };
        
        console.log("Creating new customer:", newCustomerData);
        
        try {
          const { data: newCustomer, error: customerError } = await supabase
            .from("customers")
            .insert(newCustomerData)
            .select()
            .single();

          if (customerError) {
            // Handle duplicate email - try to fetch existing customer
            if (customerError.code === "23505" && newCustomerData.email) {
              console.log("Duplicate email detected, fetching existing customer:", newCustomerData.email);
              const { data: existingCustomer } = await supabase
                .from("customers")
                .select("id")
                .eq("email", newCustomerData.email)
                .maybeSingle();
              
              if (existingCustomer) {
                finalCustomerId = existingCustomer.id;
                console.log("Found existing customer after duplicate error:", finalCustomerId);
              } else {
                throw customerError;
              }
            } else {
              throw customerError;
            }
          } else {
            finalCustomerId = newCustomer.id;
            console.log("Created new customer:", finalCustomerId);
          }
        } catch (customerError: any) {
          console.error("Failed to create customer:", customerError);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Kunde konnte nicht erstellt werden: ${customerError.message}`,
              code: "CUSTOMER_CREATE_FAILED"
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // 4. Create or match participants (improved matching logic)
    const participantIds: string[] = [];
    const participants = extractedData.participants || [];

    for (const participant of participants) {
      const firstName = participant.first_name || participant.name?.split(" ")[0] || "Teilnehmer";
      
      // Check if participant already exists for this customer
      // Match by first name (case-insensitive) and optionally birth date
      const { data: potentialMatches } = await supabase
        .from("customer_participants")
        .select("id, first_name, birth_date")
        .eq("customer_id", finalCustomerId)
        .ilike("first_name", firstName);

      let existingParticipant = null;
      if (potentialMatches && potentialMatches.length > 0) {
        // If we have birth date info, prefer exact match
        if (participant.birth_date) {
          existingParticipant = potentialMatches.find(
            p => p.birth_date === participant.birth_date
          );
        }
        // Otherwise take first match by name
        if (!existingParticipant) {
          existingParticipant = potentialMatches[0];
        }
      }

      if (existingParticipant) {
        participantIds.push(existingParticipant.id);
        console.log("Found existing participant:", existingParticipant.id, firstName);
      } else {
        // Calculate birth date from age if needed
        let birthDate = participant.birth_date;
        if (!birthDate && participant.age) {
          const year = new Date().getFullYear() - participant.age;
          birthDate = `${year}-01-01`;
        }
        if (!birthDate) {
          birthDate = "2015-01-01"; // Default
        }

        // Create new participant
        const { data: newParticipant, error: partError } = await supabase
          .from("customer_participants")
          .insert({
            customer_id: finalCustomerId,
            first_name: firstName,
            last_name: participant.last_name || participant.name?.split(" ").slice(1).join(" ") || "",
            birth_date: birthDate,
            level_current_season: participant.skill_level || null,
            sport: participant.discipline || "ski",
          })
          .select()
          .single();

        if (partError) {
          console.error("Failed to create participant:", partError);
          continue;
        }
        
        participantIds.push(newParticipant.id);
        console.log("Created new participant:", newParticipant.id, firstName);
      }
    }

    // 5. Find appropriate product
    const bookingData = extractedData.booking || {};
    const productType = bookingData.product_type || "private";
    
    const { data: product } = await supabase
      .from("products")
      .select("id, price, name, type")
      .eq("type", productType)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    // Fallback to any active product if specific type not found
    let selectedProduct = product;
    if (!selectedProduct) {
      const { data: fallbackProduct } = await supabase
        .from("products")
        .select("id, price, name, type")
        .eq("is_active", true)
        .limit(1)
        .single();
      selectedProduct = fallbackProduct;
    }

    if (!selectedProduct) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Kein aktives Produkt gefunden",
          code: "NO_PRODUCT"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Generate ticket number
    const ticketNumber = `T-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    // 7. Parse dates from various formats
    let dates: Array<{ date: string; start_time?: string; end_time?: string }> = [];
    
    if (bookingData.dates && bookingData.dates.length > 0) {
      dates = bookingData.dates;
    } else if (bookingData.date_range?.start) {
      // Generate dates from range
      const startDate = new Date(bookingData.date_range.start);
      const endDate = bookingData.date_range.end ? new Date(bookingData.date_range.end) : startDate;
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push({ date: d.toISOString().split("T")[0] });
      }
    } else if (bookingData.start_date) {
      const startDate = new Date(bookingData.start_date);
      const endDate = bookingData.end_date ? new Date(bookingData.end_date) : startDate;
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push({ date: d.toISOString().split("T")[0] });
      }
    }

    // 8. Calculate totals
    const unitPrice = selectedProduct.price || 0;
    const participantCount = participantIds.length || 1;
    const dateCount = dates.length || 1;
    const totalAmount = participantCount * dateCount * unitPrice;

    console.log("Creating ticket:", { ticketNumber, totalAmount, participantCount, dateCount });

    // 9. Create ticket with pending_confirmation status
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        ticket_number: ticketNumber,
        customer_id: finalCustomerId,
        status: "pending_confirmation",
        total_amount: totalAmount,
        total_participants: participantCount,
        notes: bookingData.special_requests || "",
        internal_notes: `Erstellt aus Konversation. Wartet auf Bestätigung.\nQuelle: ${conversation.channel}\nSend confirmation after approval: ${sendConfirmationAfterApproval}`,
        ticket_type: productType,
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Failed to create ticket:", ticketError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Buchung konnte nicht erstellt werden: ${ticketError.message}`,
          code: "TICKET_CREATE_FAILED"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 10. Create ticket items for each date and participant
    const ticketItems = [];
    
    if (dates.length > 0 && participantIds.length > 0) {
      for (const dateInfo of dates) {
        for (let i = 0; i < participantIds.length; i++) {
          const participantId = participantIds[i];
          const participant = participants[i];
          
          ticketItems.push({
            ticket_id: ticket.id,
            participant_id: participantId,
            product_id: selectedProduct.id,
            date: dateInfo.date,
            time_start: dateInfo.start_time || null,
            time_end: dateInfo.end_time || null,
            unit_price: unitPrice,
            line_total: unitPrice,
            skill_level: participant?.skill_level || null,
            is_vegetarian: bookingData.vegetarian || false,
            status: "pending",
          });
        }
      }
    } else {
      // Create at least one item
      const today = new Date().toISOString().split("T")[0];
      ticketItems.push({
        ticket_id: ticket.id,
        participant_id: participantIds[0] || null,
        product_id: selectedProduct.id,
        date: dates[0]?.date || today,
        unit_price: unitPrice,
        line_total: unitPrice,
        status: "pending",
      });
    }

    if (ticketItems.length > 0) {
      const { error: itemsError } = await supabase
        .from("ticket_items")
        .insert(ticketItems);

      if (itemsError) {
        console.error("Failed to create ticket items:", itemsError);
      } else {
        console.log("Created", ticketItems.length, "ticket items");
      }
    }

    // 11. Link conversation to ticket
    await supabase
      .from("conversations")
      .update({ 
        related_ticket_id: ticket.id,
        status: "converted"
      })
      .eq("id", conversationId);

    // 12. Return success with ticket details
    return new Response(
      JSON.stringify({
        success: true,
        ticket: {
          id: ticket.id,
          ticket_number: ticketNumber,
          status: "pending_confirmation",
          total_amount: totalAmount,
          participant_count: participantCount,
          date_count: dateCount,
        },
        message: "Buchung erstellt. Wartet auf Bestätigung vor dem Versand.",
        next_step: "approve_and_send_confirmation",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error creating booking:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        code: "UNKNOWN_ERROR"
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
