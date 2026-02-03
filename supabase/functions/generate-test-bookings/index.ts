import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  startDate: string;
  bookingCount: number;
  daysSpread: number;
  generateGroupCourses?: boolean;
  weeksToGenerate?: number;
  includeCapacityScenarios?: boolean;
}

interface GroupCourseResult {
  trainingGroups: number;
  enrollments: number;
  customersCreated: number;
}

// Time slots with realistic distribution:
// 35% Morning 09:00-11:00, 25% Morning 10:00-12:00, 25% Afternoon 14:00-16:00, 15% Half-day
const TIME_SLOTS = [
  { start: "09:00", end: "11:00", type: "morning-early", weight: 0.35 },
  { start: "10:00", end: "12:00", type: "morning-late", weight: 0.25 },
  { start: "14:00", end: "16:00", type: "afternoon", weight: 0.25 },
  { start: "09:00", end: "12:00", type: "half-day-morning", weight: 0.075 },
  { start: "13:00", end: "16:00", type: "half-day-afternoon", weight: 0.075 },
];

// Swiss/German names for realistic test data
const CHILD_FIRST_NAMES = [
  'Emma', 'Mia', 'Sofia', 'Anna', 'Lena', 'Laura', 'Julia', 'Sara',
  'Noah', 'Liam', 'Leon', 'Lucas', 'Felix', 'Tim', 'Max', 'Paul',
  'Leonie', 'Nina', 'Lara', 'Elena', 'Emilia', 'Valentina',
  'David', 'Jan', 'Lukas', 'Nico', 'Julian', 'Finn', 'Ben', 'Luis',
  'Marie', 'Hannah', 'Lea', 'Sophie', 'Ella', 'Clara', 'Lina', 'Mila'
];

const SWISS_LAST_NAMES = [
  'Müller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Huber', 'Schneider',
  'Meyer', 'Steiner', 'Fischer', 'Gerber', 'Brunner', 'Baumann', 'Frei',
  'Moser', 'Widmer', 'Wyss', 'Graf', 'Roth', 'Bühler', 'Berger', 'Koch',
  'Suter', 'Kaufmann', 'Hofer', 'Baumgartner', 'Wirth', 'Pfister'
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
  let cumulative = 0;
  for (const slot of TIME_SLOTS) {
    cumulative += slot.weight;
    if (rand < cumulative) {
      return slot;
    }
  }
  return TIME_SLOTS[0]; // Fallback
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

// Group course helper functions
function getRandomScenario(): 'ok' | 'overbooked' | 'underbooked' | 'empty' {
  const rand = Math.random();
  if (rand < 0.5) return 'ok';           // 50% correct capacity
  if (rand < 0.7) return 'overbooked';   // 20% overbooked
  if (rand < 0.9) return 'underbooked';  // 20% underbooked
  return 'empty';                         // 10% empty
}

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function getRandomChildFirstName(): string {
  return randomElement(CHILD_FIRST_NAMES);
}

function getRandomSwissLastName(): string {
  return randomElement(SWISS_LAST_NAMES);
}

function getRandomChildBirthDate(): string {
  // Children between 4-14 years old
  const now = new Date();
  const minAge = 4;
  const maxAge = 14;
  const age = minAge + Math.floor(Math.random() * (maxAge - minAge + 1));
  const birthYear = now.getFullYear() - age;
  const birthMonth = Math.floor(Math.random() * 12) + 1;
  const birthDay = Math.floor(Math.random() * 28) + 1;
  return `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
}

function getRandomEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'bluewin.ch', 'outlook.com', 'gmx.ch', 'hispeed.ch'];
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const rand = Math.floor(Math.random() * 1000);
  return `${cleanFirst}.${cleanLast}${rand}@${randomElement(domains)}`;
}

function getRandomPhone(): string {
  const prefix = randomElement(['079', '078', '076', '077']);
  const number = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
  return `${prefix} ${number.slice(0, 3)} ${number.slice(3, 5)} ${number.slice(5)}`;
}

async function getOrCreateTestCustomer(supabase: any): Promise<any> {
  // 70% chance to create new customer, 30% to reuse existing
  if (Math.random() < 0.3) {
    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("id, last_name")
      .limit(50);
    
    if (existingCustomers && existingCustomers.length > 0) {
      return randomElement(existingCustomers);
    }
  }

  // Create new customer
  const firstName = getRandomChildFirstName(); // Parents can have same names
  const lastName = getRandomSwissLastName();
  const email = getRandomEmail(firstName, lastName);

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: email,
      phone: getRandomPhone(),
      holiday_address: `Hotel ${randomElement(['Alpenrose', 'Edelweiss', 'Bergblick', 'Sonnenhof', 'Alpina'])}`,
      language: randomElement(['de', 'en', 'fr']),
      notes: 'Test customer generated automatically',
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    throw error;
  }

  return customer;
}

async function generateGroupCourseData(
  supabase: any,
  startDate: Date,
  weeks: number,
  includeScenarios: boolean
): Promise<GroupCourseResult> {
  const results: GroupCourseResult = {
    trainingGroups: 0,
    enrollments: 0,
    customersCreated: 0,
  };

  // Fetch active weekly group courses
  const { data: groupCourses, error: coursesError } = await supabase
    .from('group_courses')
    .select('*')
    .eq('is_active', true)
    .eq('course_type', 'weekly');

  if (coursesError) {
    console.error("Error fetching group courses:", coursesError);
    throw new Error("Failed to fetch group courses");
  }

  if (!groupCourses || groupCourses.length === 0) {
    console.log("No active weekly group courses found, skipping group course generation");
    return results;
  }

  console.log(`Found ${groupCourses.length} active weekly courses`);

  // Get group course instructors for assignment
  const { data: groupInstructors } = await supabase
    .from('training_groups')
    .select('instructor_id')
    .not('instructor_id', 'is', null);

  const instructorIds = [...new Set((groupInstructors || []).map((g: { instructor_id: string }) => g.instructor_id))];
  
  // Fetch all instructors for random assignment
  const { data: allInstructors } = await supabase
    .from('instructors')
    .select('id')
    .eq('status', 'active');

  const availableInstructors: { id: string }[] = allInstructors || [];

  // Generate data for each week
  for (let week = 0; week < weeks; week++) {
    const weekStartDate = new Date(startDate);
    weekStartDate.setDate(weekStartDate.getDate() + (week * 7));
    const weekStart = getMonday(weekStartDate);

    console.log(`Generating week ${week + 1}, starting ${weekStart}`);

    for (const course of groupCourses) {
      // Determine target participants based on scenario
      let targetParticipants: number;
      const minParticipants = course.min_participants || 4;
      const maxParticipants = course.max_participants || 12;

      if (includeScenarios) {
        const scenario = getRandomScenario();
        switch (scenario) {
          case 'overbooked':
            targetParticipants = maxParticipants + Math.floor(Math.random() * 9) + 4; // 4-12 over
            break;
          case 'underbooked':
            targetParticipants = Math.max(1, minParticipants - Math.floor(Math.random() * 3) - 1); // 1-3 under min
            break;
          case 'empty':
            targetParticipants = 0;
            break;
          default: // 'ok'
            targetParticipants = minParticipants + 
              Math.floor(Math.random() * (maxParticipants - minParticipants + 1));
        }
      } else {
        // Random between min and max
        targetParticipants = minParticipants + 
          Math.floor(Math.random() * (maxParticipants - minParticipants + 1));
      }

      // Create training group for this course/week
      const assignedInstructor = availableInstructors.length > 0 
        ? randomElement(availableInstructors).id 
        : null;

      const { data: trainingGroup, error: tgError } = await supabase
        .from('training_groups')
        .insert({
          course_id: course.id,
          week_start: weekStart,
          group_number: 1,
          instructor_id: assignedInstructor,
          status: 'active',
        })
        .select()
        .single();

      if (tgError) {
        console.error('Error creating training group:', tgError);
        continue;
      }
      results.trainingGroups++;

      // Find or create instances for this course in this week (Mon-Fri)
      const weekDays: string[] = [];
      for (let d = 0; d < 5; d++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + d);
        weekDays.push(dayDate.toISOString().split('T')[0]);
      }

      // Fetch existing instances for this course in this week
      const { data: existingInstances } = await supabase
        .from('group_course_instances')
        .select('*')
        .eq('course_id', course.id)
        .in('date', weekDays);

      // If no instances exist, we'll create enrollments without instance links
      // (the capacity planning feature will still work via training_groups)
      const instanceMap = new Map();
      if (existingInstances) {
        for (const inst of existingInstances) {
          instanceMap.set(inst.date, inst);
        }
      }

      // Create enrollments
      for (let i = 0; i < targetParticipants; i++) {
        try {
          // Get or create customer
          const customer = await getOrCreateTestCustomer(supabase);
          results.customersCreated++;

          // Create participant (child)
          const { data: participant, error: partError } = await supabase
            .from('customer_participants')
            .insert({
              customer_id: customer.id,
              first_name: getRandomChildFirstName(),
              last_name: customer.last_name,
              birth_date: getRandomChildBirthDate(),
            })
            .select()
            .single();

          if (partError) {
            console.error('Error creating participant:', partError);
            continue;
          }

          // Create ticket
          const isPaid = Math.random() < 0.7; // 70% paid
          const weekPrice = (course.price_full_week || course.price_per_day * 5);
          const ticketNumber = await generateTicketNumber(supabase);

          const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert({
              ticket_number: ticketNumber,
              customer_id: customer.id,
              status: 'confirmed',
              total_amount: weekPrice,
              paid_amount: isPaid ? weekPrice : 0,
              payment_method: isPaid ? randomElement(['cash', 'card', 'twint']) : null,
              notes: `Test group course booking - ${course.name}`,
            })
            .select()
            .single();

          if (ticketError) {
            console.error('Error creating ticket:', ticketError);
            continue;
          }

          // Create ticket item for each day of the week
          const firstDay = weekDays[0];
          const instance = instanceMap.get(firstDay);
          
          const { data: ticketItem, error: itemError } = await supabase
            .from('ticket_items')
            .insert({
              ticket_id: ticket.id,
              product_id: course.product_id,
              participant_id: participant.id,
              instructor_id: assignedInstructor,
              date: firstDay,
              time_start: '09:00',
              time_end: '12:00',
              unit_price: weekPrice,
              status: 'confirmed',
              instructor_confirmation: 'confirmed',
            })
            .select()
            .single();

          if (itemError) {
            console.error('Error creating ticket item:', itemError);
            continue;
          }

          // Create enrollment linking to instance (if exists) and training group
          if (instance) {
            const { error: enrollError } = await supabase
              .from('group_course_enrollments')
              .insert({
                instance_id: instance.id,
                ticket_item_id: ticketItem.id,
                participant_id: participant.id,
                training_group_id: trainingGroup.id,
                original_course_id: course.id,
                attendance_status: 'registered',
              });

            if (enrollError) {
              console.error('Error creating enrollment:', enrollError);
              continue;
            }
          }

          results.enrollments++;
        } catch (err) {
          console.error('Error in enrollment creation loop:', err);
          continue;
        }
      }
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      startDate, 
      bookingCount, 
      daysSpread,
      generateGroupCourses = false,
      weeksToGenerate = 8,
      includeCapacityScenarios = true,
    }: GenerateRequest = await req.json();
    
    const startDateObj = new Date(startDate);
    
    // Fetch reference data
    const [instructorsRes, customersRes, participantsRes, productsRes, groupInstructorsRes] = await Promise.all([
      supabase.from("instructors").select("id, first_name, last_name").eq("status", "active"),
      supabase.from("customers").select("id, first_name, last_name, email"),
      supabase.from("customer_participants").select("id, customer_id, first_name"),
      supabase.from("products").select("id, name, type, price").eq("is_active", true),
      // Get instructors assigned to training groups (group course teachers)
      supabase.from("training_groups").select("instructor_id").not("instructor_id", "is", null),
    ]);

    console.log("Instructors query:", { data: instructorsRes.data?.length, error: instructorsRes.error });
    console.log("Customers query:", { data: customersRes.data?.length, error: customersRes.error });
    console.log("Products query:", { data: productsRes.data?.length, error: productsRes.error });
    console.log("Group instructors query:", { data: groupInstructorsRes.data?.length, error: groupInstructorsRes.error });

    const allInstructors = instructorsRes.data || [];
    const customers = customersRes.data || [];
    const participants = participantsRes.data || [];
    const products = productsRes.data || [];
    
    // Build set of instructor IDs assigned to group courses
    const groupInstructorIds = new Set(
      (groupInstructorsRes.data || []).map(g => g.instructor_id)
    );
    
    // Filter out group course instructors - only ~20 remaining for private lessons
    const instructors = allInstructors.filter(i => !groupInstructorIds.has(i.id));
    
    console.log("Private lesson instructor pool:", instructors.length, "of", allInstructors.length, "total");

    if (instructors.length === 0 || customers.length === 0 || products.length === 0) {
      console.log("Missing data - instructors:", instructors.length, "customers:", customers.length, "products:", products.length);
      return new Response(
        JSON.stringify({ 
          error: "Not enough reference data (instructors, customers, or products)",
          debug: {
            totalInstructors: allInstructors.length,
            privateInstructors: instructors.length,
            groupInstructors: groupInstructorIds.size,
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

    // Only use private products - group enrollments handled separately
    const privateProducts = products.filter((p) => p.type === "private");
    
    const createdTickets: string[] = [];
    const createdItems: string[] = [];

    for (let i = 0; i < bookingCount; i++) {
      const customer = randomElement(customers);
      const customerParticipants = participants.filter(p => p.customer_id === customer.id);
      
      // Private lessons only - 60% 2h, 25% 1h, 15% half-day (3h)
      // Time slot selection already handles duration distribution
      const product = privateProducts.length > 0 
        ? randomElement(privateProducts) 
        : randomElement(products);

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

    // Generate group course data if enabled
    let groupCourseResult: GroupCourseResult | undefined;
    if (generateGroupCourses) {
      console.log("Starting group course generation...");
      try {
        groupCourseResult = await generateGroupCourseData(
          supabase,
          startDateObj,
          weeksToGenerate,
          includeCapacityScenarios
        );
        console.log("Group course generation complete:", groupCourseResult);
      } catch (err) {
        console.error("Group course generation failed:", err);
        // Don't fail the whole request, just log the error
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
        groupCourses: groupCourseResult,
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
