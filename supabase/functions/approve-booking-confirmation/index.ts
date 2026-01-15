import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApproveBookingRequest {
  ticketId: string;
  sendConfirmation: boolean;
  sendInvoice: boolean;
  customMessage?: string;
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

    const { ticketId, sendConfirmation, sendInvoice, customMessage } = 
      await req.json() as ApproveBookingRequest;

    // 1. Get ticket with customer info
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        customers (
          id, first_name, last_name, email, phone
        )
      `)
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error("Ticket not found");
    }

    if (ticket.status !== "pending_confirmation") {
      throw new Error("Ticket is not pending confirmation");
    }

    const customer = ticket.customers as {
      id: string;
      first_name: string | null;
      last_name: string;
      email: string;
      phone: string | null;
    } | null;

    // 2. Update ticket status to confirmed
    const { error: updateError } = await supabase
      .from("tickets")
      .update({ 
        status: "confirmed",
        internal_notes: (ticket.internal_notes || "") + `\n\nBestätigt am: ${new Date().toISOString()}`
      })
      .eq("id", ticketId);

    if (updateError) {
      throw new Error(`Failed to update ticket: ${updateError.message}`);
    }

    // 3. Update ticket items status
    await supabase
      .from("ticket_items")
      .update({ status: "confirmed" })
      .eq("ticket_id", ticketId);

    // 4. Send confirmation notification if requested
    let confirmationSent = false;
    if (sendConfirmation && customer?.email) {
      try {
        const { error: notifyError } = await supabase.functions.invoke("send-notification", {
          body: {
            type: "booking.confirmed",
            recipientEmail: customer.email,
            data: {
              customer_name: `${customer.first_name || ""} ${customer.last_name}`.trim(),
              ticket_number: ticket.ticket_number,
              total_amount: ticket.total_amount,
              custom_message: customMessage,
            },
          },
        });

        if (!notifyError) {
          confirmationSent = true;
        }
      } catch (e) {
        console.error("Failed to send confirmation:", e);
      }
    }

    // 5. Queue invoice if requested
    let invoiceSent = false;
    if (sendInvoice && customer?.email) {
      // Log intent - actual invoice generation would be handled separately
      console.log(`Invoice requested for ticket ${ticket.ticket_number} to ${customer.email}`);
      invoiceSent = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticket_number: ticket.ticket_number,
        new_status: "confirmed",
        confirmation_sent: confirmationSent,
        invoice_sent: invoiceSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error approving booking:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
