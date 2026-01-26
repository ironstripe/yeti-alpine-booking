import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  startDate: string;
  bookingCount: number;
  daysSpread: number;
}

const TIME_SLOTS = [
  { start: "09:00", end: "11:00", type: "morning" },
  { start: "10:00", end: "12:00", type: "morning" },
  { start: "14:00", end: "16:00", type: "afternoon" },
  { start: "09:00", end: "12:00", type: "half-day-morning" },
  { start: "13:00", end: "16:00", type: "half-day-afternoon" },
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split("T")[0];
}

function getRandomTimeSlot() {
  const rand = Math.random();
  if (rand < 0.4) {
    // Morning slots
    return randomElement(TIME_SLOTS.filter(s => s.type === "morning"));
  } else if (rand < 0.8) {
    // Afternoon slot
    return TIME_SLOTS.find(s => s.type === "afternoon")!;
  } else {
    // Half day
    return randomElement(TIME_SLOTS.filter(s => s.type.startsWith("half-day")));
  }
}

function calculatePrice(startTime: string, endTime: string): number {
  const [startH] = startTime.split(":").map(Number);
  const [endH] = endTime.split(":").map(Number);
  const hours = endH - startH;
  
  // Simple pricing: 80 CHF base per hour
  return hours * 80;
}

async function generateTicketNumber(supabase: any): Promise<string> {
  const year = new Date().getFullYear();

  const { data, error } = await supabase
    .from("tickets")
    .select("ticket_number")
    .like("ticket_number", `YETY-${year}-%`)
    .order("ticket_number", { ascending: false })
    .limit(1);

  if (error) throw error;

  let nextNumber = 1;
  if (data && data.length > 0) {
    const lastNumber = data[0].ticket_number as string;
    const match = lastNumber.match(/YETY-\d{4}-(\d+)/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }

  return `YETY-${year}-${nextNumber.toString().padStart(5, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { startDate, bookingCount, daysSpread }: GenerateRequest = await req.json();
    
    const startDateObj = new Date(startDate);
    
    // Fetch reference data
    const [instructorsRes, customersRes, participantsRes, productsRes] = await Promise.all([
      supabase.from("instructors").select("id, first_name, last_name").eq("status", "active"),
      supabase.from("customers").select("id, first_name, last_name, email"),
      supabase.from("customer_participants").select("id, customer_id, first_name"),
      // NOTE: In our schema the column is `products.type` (e.g. "private" | "group"), not `product_type`.
      supabase.from("products").select("id, name, type, price").eq("is_active", true),
    ]);

    console.log("Instructors query:", { data: instructorsRes.data?.length, error: instructorsRes.error });
    console.log("Customers query:", { data: customersRes.data?.length, error: customersRes.error });
    console.log("Products query:", { data: productsRes.data?.length, error: productsRes.error });

    const instructors = instructorsRes.data || [];
    const customers = customersRes.data || [];
    const participants = participantsRes.data || [];
    const products = productsRes.data || [];

    if (instructors.length === 0 || customers.length === 0 || products.length === 0) {
      console.log("Missing data - instructors:", instructors.length, "customers:", customers.length, "products:", products.length);
      return new Response(
        JSON.stringify({ 
          error: "Not enough reference data (instructors, customers, or products)",
          debug: {
            instructors: instructors.length,
            customers: customers.length,
            products: products.length,
            instructorsError: instructorsRes.error,
            customersError: customersRes.error,
            productsError: productsRes.error,
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter products
    const privateProducts = products.filter((p) => p.type === "private");
    const groupProducts = products.filter((p) => p.type === "group");
    
    const createdTickets: string[] = [];
    const createdItems: string[] = [];

    for (let i = 0; i < bookingCount; i++) {
      const customer = randomElement(customers);
      const customerParticipants = participants.filter(p => p.customer_id === customer.id);
      
      // Determine product type: 70% private 2h, 20% private 1h, 10% group
      const rand = Math.random();
      let product = privateProducts.length > 0 
        ? randomElement(privateProducts) 
        : randomElement(products);
      
      if (rand > 0.9 && groupProducts.length > 0) {
        product = randomElement(groupProducts);
      }

      // Random date within spread
      const dayOffset = Math.floor(Math.random() * daysSpread);
      const lessonDate = addDays(startDateObj, dayOffset);
      
      // Random time slot
      const timeSlot = getRandomTimeSlot();
      
      // Calculate price
      const price = calculatePrice(timeSlot.start, timeSlot.end);
      
      // Status: 80% confirmed, 20% pending
      const isConfirmed = Math.random() < 0.8;
      const instructor = isConfirmed ? randomElement(instructors) : null;
      
      // Get a participant if available
      const participant = customerParticipants.length > 0 
        ? randomElement(customerParticipants) 
        : null;

      // Create ticket
      const ticketNumber = await generateTicketNumber(supabase);
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          ticket_number: ticketNumber,
          customer_id: customer.id,
          status: isConfirmed ? "confirmed" : "pending_confirmation",
          total_amount: price,
          paid_amount: isConfirmed ? price : 0,
          payment_method: isConfirmed ? randomElement(["cash", "card", "twint"]) : null,
          notes: `Test booking generated on ${new Date().toISOString()}`,
        })
        .select("id")
        .single();

      if (ticketError || !ticket) {
        console.error("Failed to create ticket:", ticketError);
        continue;
      }

      createdTickets.push(ticket.id);

      // Create ticket item
      const { data: item, error: itemError } = await supabase
        .from("ticket_items")
        .insert({
          ticket_id: ticket.id,
          product_id: product.id,
          participant_id: participant?.id || null,
          instructor_id: instructor?.id || null,
          date: lessonDate,
          time_start: timeSlot.start,
          time_end: timeSlot.end,
          unit_price: price,
          status: isConfirmed ? "confirmed" : "pending",
          instructor_confirmation: isConfirmed ? "confirmed" : "pending",
        })
        .select("id")
        .single();

      if (itemError || !item) {
        console.error("Failed to create ticket item:", itemError);
        continue;
      }

      createdItems.push(item.id);

      // Occasionally add a second lesson to the same ticket (30% chance)
      if (Math.random() < 0.3) {
        const nextDayOffset = dayOffset + 1;
        if (nextDayOffset < daysSpread) {
          const nextDate = addDays(startDateObj, nextDayOffset);
          const nextSlot = getRandomTimeSlot();
          const nextPrice = calculatePrice(nextSlot.start, nextSlot.end);

          const { data: item2 } = await supabase
            .from("ticket_items")
            .insert({
              ticket_id: ticket.id,
              product_id: product.id,
              participant_id: participant?.id || null,
              instructor_id: instructor?.id || null,
              date: nextDate,
              time_start: nextSlot.start,
              time_end: nextSlot.end,
              unit_price: nextPrice,
              status: isConfirmed ? "confirmed" : "pending",
              instructor_confirmation: isConfirmed ? "confirmed" : "pending",
            })
            .select("id")
            .single();

          if (item2) {
            createdItems.push(item2.id);
            
            // Update ticket total
            await supabase
              .from("tickets")
              .update({ 
                total_amount: price + nextPrice,
                paid_amount: isConfirmed ? price + nextPrice : 0,
              })
              .eq("id", ticket.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        created: {
          tickets: createdTickets.length,
          items: createdItems.length,
        },
        dateRange: {
          start: startDate,
          end: addDays(startDateObj, daysSpread - 1),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating test bookings:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
