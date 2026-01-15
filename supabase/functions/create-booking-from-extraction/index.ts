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
  vegetarian?: boolean;
  special_requests?: string;
}

interface ExtractedData {
  customer?: ExtractedCustomer;
  participants?: ExtractedParticipant[];
  booking?: ExtractedBooking;
  booking_ready?: boolean;
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

    // 1. Load conversation with extracted data
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error("Conversation not found");
    }

    const extractedData = conversation.ai_extracted_data as ExtractedData;
    if (!extractedData) {
      throw new Error("No extracted data available");
    }

    // 2. Check if booking is ready
    if (!conversation.booking_ready && !extractedData.booking_ready) {
      throw new Error("Booking data is incomplete. Please collect missing information first.");
    }

    // 3. Get or create customer
    let finalCustomerId = customerId;
    
    if (!finalCustomerId) {
      // Check for matched customer
      if (conversation.matched_customer_id) {
        finalCustomerId = conversation.matched_customer_id;
      } else {
        // Create new customer
        const customerData = extractedData.customer || {};
        const nameParts = (customerData.name || "").split(" ");
        
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert({
            first_name: customerData.first_name || nameParts[0] || "",
            last_name: customerData.last_name || nameParts.slice(1).join(" ") || "Unbekannt",
            email: customerData.email || conversation.contact_identifier || "unknown@example.com",
            phone: customerData.phone || "",
            street: customerData.address?.street || "",
            zip: customerData.address?.zip || "",
            city: customerData.address?.city || "",
            country: customerData.address?.country || "LI",
            holiday_address: "",
          })
          .select()
          .single();

        if (customerError) {
          throw new Error(`Failed to create customer: ${customerError.message}`);
        }
        
        finalCustomerId = newCustomer.id;
      }
    }

    // 4. Create or match participants
    const participantIds: string[] = [];
    const participants = extractedData.participants || [];

    for (const participant of participants) {
      const firstName = participant.first_name || participant.name?.split(" ")[0] || "Teilnehmer";
      
      // Check if participant already exists for this customer
      const { data: existingParticipant } = await supabase
        .from("customer_participants")
        .select("id")
        .eq("customer_id", finalCustomerId)
        .ilike("first_name", firstName)
        .maybeSingle();

      if (existingParticipant) {
        participantIds.push(existingParticipant.id);
      } else {
        // Calculate birth date from age if needed
        let birthDate = participant.birth_date;
        if (!birthDate && participant.age) {
          const year = new Date().getFullYear() - participant.age;
          birthDate = `${year}-01-01`;
        }
        if (!birthDate) {
          birthDate = "2010-01-01"; // Default
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
      }
    }

    // 5. Find appropriate product
    const bookingData = extractedData.booking || {};
    const productType = bookingData.product_type || "private";
    
    const { data: product, error: productError } = await supabase
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
      throw new Error(`No active product found`);
    }

    // 6. Generate ticket number
    const ticketNumber = `T-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    // 7. Calculate totals
    const dates = bookingData.dates || [];
    const unitPrice = selectedProduct.price || 0;
    const participantCount = participantIds.length || 1;
    const dateCount = dates.length || 1;
    const totalAmount = participantCount * dateCount * unitPrice;

    // 8. Create ticket with pending_confirmation status
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        ticket_number: ticketNumber,
        customer_id: finalCustomerId,
        status: "pending_confirmation", // Human-in-the-loop: requires approval
        total_amount: totalAmount,
        total_participants: participantCount,
        notes: bookingData.special_requests || "",
        internal_notes: `Erstellt aus Konversation. Wartet auf Bestätigung.\nQuelle: ${conversation.channel}\nSend confirmation after approval: ${sendConfirmationAfterApproval}`,
        ticket_type: productType,
      })
      .select()
      .single();

    if (ticketError) {
      throw new Error(`Failed to create ticket: ${ticketError.message}`);
    }

    // 9. Create ticket items for each date and participant
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
      }
    }

    // 10. Link conversation to ticket
    await supabase
      .from("conversations")
      .update({ 
        related_ticket_id: ticket.id,
        status: "converted"
      })
      .eq("id", conversationId);

    // 11. Return success with ticket details
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
        error: errorMessage 
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
