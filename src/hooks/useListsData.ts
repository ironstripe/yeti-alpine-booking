import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// Types for lists data
export interface LunchChild {
  id: string;
  firstName: string;
  lastName: string | null;
  age: number;
  allergies: string | null;
  emergencyContact: string | null;
  groupName: string | null;
}

export interface GroupParticipant {
  id: string;
  firstName: string;
  lastName: string | null;
  age: number;
  level: string | null;
  language: string | null;
  hasLunch: boolean;
}

export interface GroupData {
  id: string;
  name: string;
  level: string;
  instructorName: string | null;
  instructorId: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  meetingPoint: string | null;
  participants: GroupParticipant[];
  maxParticipants: number;
}

export interface DailyBooking {
  id: string;
  ticketNumber: string;
  customerName: string;
  productName: string;
  instructorName: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  paymentStatus: string | null;
  contactPhone: string | null;
  total: number;
}

export interface InstructorScheduleItem {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string | null;
  productName: string;
  timeStart: string | null;
  timeEnd: string | null;
  meetingPoint: string | null;
  notes: string | null;
  participants: Array<{
    name: string;
    age: number;
    level: string | null;
    sport: string | null;
  }>;
  language: string | null;
}

export interface InstructorSchedule {
  id: string;
  name: string;
  specialization: string | null;
  level: string | null;
  items: InstructorScheduleItem[];
  totalHours: number;
  privateHours: number;
  groupHours: number;
}

export interface ListsSummary {
  lunchChildrenCount: number;
  groupsCount: number;
  bookingsCount: number;
  instructorsCount: number;
}

// Hook to fetch lunch children for a date
export function useLunchChildren(date: Date) {
  const dateStr = format(date, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["lunch-children", dateStr],
    queryFn: async (): Promise<LunchChild[]> => {
      // For MVP, we'll query ticket_items for the date
      // and look for group courses that have lunch included
      // Since we don't have a lunch_care field, we'll simulate with group courses
      const { data: items, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          participant:customer_participants!ticket_items_participant_id_fkey (
            id,
            first_name,
            last_name,
            birth_date,
            notes
          ),
          ticket:tickets!ticket_items_ticket_id_fkey (
            customer:customers!tickets_customer_id_fkey (
              phone,
              language
            )
          ),
          product:products!ticket_items_product_id_fkey (
            type
          )
        `)
        .eq("date", dateStr);

      if (error) throw error;

      // Filter to group courses and map participants
      const children: LunchChild[] = [];
      const seenIds = new Set<string>();

      (items || []).forEach((item) => {
        const participant = item.participant as any;
        const product = item.product as any;
        
        // Only include group courses and unique participants
        if (!participant || product?.type !== "group") return;
        if (seenIds.has(participant.id)) return;
        seenIds.add(participant.id);

        const birthDate = new Date(participant.birth_date);
        const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

        const customer = (item.ticket as any)?.customer;

        children.push({
          id: participant.id,
          firstName: participant.first_name,
          lastName: participant.last_name,
          age,
          allergies: participant.notes, // Using notes as allergies placeholder
          emergencyContact: customer?.phone || null,
          groupName: null,
        });
      });

      return children.sort((a, b) => a.firstName.localeCompare(b.firstName));
    },
  });
}

// Hook to fetch groups for a date
export function useGroups(date: Date) {
  const dateStr = format(date, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["groups", dateStr],
    queryFn: async (): Promise<GroupData[]> => {
      // Fetch groups that are active on this date
      const { data: groups, error } = await supabase
        .from("groups")
        .select(`
          id,
          name,
          level,
          meeting_point,
          time_morning_start,
          time_morning_end,
          time_afternoon_start,
          time_afternoon_end,
          max_participants,
          instructor:instructors!groups_instructor_id_fkey (
            id,
            first_name,
            last_name
          )
        `)
        .lte("start_date", dateStr)
        .gte("end_date", dateStr)
        .eq("status", "active");

      if (error) throw error;

      // For each group, get participants from ticket_items
      const groupsWithParticipants: GroupData[] = await Promise.all(
        (groups || []).map(async (group) => {
          const instructor = group.instructor as any;
          
          // Get ticket items for this date that might be group bookings
          const { data: items } = await supabase
            .from("ticket_items")
            .select(`
              participant:customer_participants!ticket_items_participant_id_fkey (
                id,
                first_name,
                last_name,
                birth_date,
                level_current_season,
                customer:customers!customer_participants_customer_id_fkey (
                  language
                )
              )
            `)
            .eq("date", dateStr)
            .eq("instructor_id", group.instructor?.id);

          const participants: GroupParticipant[] = [];
          const seenIds = new Set<string>();

          (items || []).forEach((item) => {
            const participant = item.participant as any;
            if (!participant || seenIds.has(participant.id)) return;
            seenIds.add(participant.id);

            const birthDate = new Date(participant.birth_date);
            const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

            participants.push({
              id: participant.id,
              firstName: participant.first_name,
              lastName: participant.last_name,
              age,
              level: participant.level_current_season,
              language: participant.customer?.language,
              hasLunch: true, // Simplified for MVP
            });
          });

          const timeStart = group.time_morning_start || "10:00";
          const timeEnd = group.time_afternoon_end || group.time_morning_end || "16:00";

          return {
            id: group.id,
            name: group.name,
            level: group.level,
            instructorName: instructor ? `${instructor.first_name} ${instructor.last_name}` : null,
            instructorId: instructor?.id || null,
            timeStart,
            timeEnd,
            meetingPoint: group.meeting_point,
            participants,
            maxParticipants: group.max_participants || 10,
          };
        })
      );

      return groupsWithParticipants;
    },
  });
}

// Hook to fetch daily bookings overview
export function useDailyBookings(date: Date) {
  const dateStr = format(date, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["daily-bookings", dateStr],
    queryFn: async (): Promise<DailyBooking[]> => {
      const { data: items, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          time_start,
          time_end,
          line_total,
          product:products!ticket_items_product_id_fkey (
            name
          ),
          instructor:instructors!ticket_items_instructor_id_fkey (
            first_name,
            last_name
          ),
          ticket:tickets!ticket_items_ticket_id_fkey (
            id,
            ticket_number,
            status,
            total_amount,
            customer:customers!tickets_customer_id_fkey (
              first_name,
              last_name,
              phone
            )
          )
        `)
        .eq("date", dateStr)
        .order("time_start", { ascending: true });

      if (error) throw error;

      // Deduplicate by ticket
      const ticketMap = new Map<string, DailyBooking>();

      (items || []).forEach((item) => {
        const ticket = item.ticket as any;
        if (!ticket || ticketMap.has(ticket.id)) return;

        const customer = ticket.customer as any;
        const instructor = item.instructor as any;
        const product = item.product as any;

        ticketMap.set(ticket.id, {
          id: ticket.id,
          ticketNumber: ticket.ticket_number,
          customerName: `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim(),
          productName: product?.name || "Unbekannt",
          instructorName: instructor ? `${instructor.first_name} ${instructor.last_name}` : null,
          timeStart: item.time_start,
          timeEnd: item.time_end,
          paymentStatus: ticket.status,
          contactPhone: customer?.phone,
          total: ticket.total_amount || 0,
        });
      });

      return Array.from(ticketMap.values());
    },
  });
}

// Hook to fetch instructor schedules
export function useInstructorSchedules(date: Date) {
  const dateStr = format(date, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["instructor-schedules", dateStr],
    queryFn: async (): Promise<InstructorSchedule[]> => {
      const { data: items, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          time_start,
          time_end,
          meeting_point,
          instructor_notes,
          product:products!ticket_items_product_id_fkey (
            name,
            type,
            duration_minutes
          ),
          instructor:instructors!ticket_items_instructor_id_fkey (
            id,
            first_name,
            last_name,
            specialization,
            level
          ),
          participant:customer_participants!ticket_items_participant_id_fkey (
            first_name,
            last_name,
            birth_date,
            level_current_season,
            sport
          ),
          ticket:tickets!ticket_items_ticket_id_fkey (
            ticket_number,
            notes,
            customer:customers!tickets_customer_id_fkey (
              first_name,
              last_name,
              phone,
              language
            )
          )
        `)
        .eq("date", dateStr)
        .not("instructor_id", "is", null)
        .order("time_start", { ascending: true });

      if (error) throw error;

      // Group items by instructor
      const instructorMap = new Map<string, InstructorSchedule>();

      (items || []).forEach((item) => {
        const instructor = item.instructor as any;
        if (!instructor) return;

        const product = item.product as any;
        const ticket = item.ticket as any;
        const customer = ticket?.customer as any;
        const participant = item.participant as any;

        const durationMinutes = product?.duration_minutes || 60;
        const hours = durationMinutes / 60;
        const isGroup = product?.type === "group";

        if (!instructorMap.has(instructor.id)) {
          instructorMap.set(instructor.id, {
            id: instructor.id,
            name: `${instructor.first_name} ${instructor.last_name}`,
            specialization: instructor.specialization,
            level: instructor.level,
            items: [],
            totalHours: 0,
            privateHours: 0,
            groupHours: 0,
          });
        }

        const entry = instructorMap.get(instructor.id)!;
        entry.totalHours += hours;
        if (isGroup) {
          entry.groupHours += hours;
        } else {
          entry.privateHours += hours;
        }

        // Build participant info
        const participants: Array<{ name: string; age: number; level: string | null; sport: string | null }> = [];
        if (participant) {
          const birthDate = new Date(participant.birth_date);
          const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          participants.push({
            name: `${participant.first_name} ${participant.last_name || ""}`.trim(),
            age,
            level: participant.level_current_season,
            sport: participant.sport,
          });
        }

        // Check if we already have this ticket in items
        const existingItem = entry.items.find((i) => i.ticketNumber === ticket?.ticket_number);
        if (existingItem) {
          // Add participant to existing item
          existingItem.participants.push(...participants);
        } else {
          entry.items.push({
            id: item.id,
            ticketNumber: ticket?.ticket_number || "",
            customerName: `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim(),
            customerPhone: customer?.phone,
            productName: product?.name || "Unbekannt",
            timeStart: item.time_start,
            timeEnd: item.time_end,
            meetingPoint: item.meeting_point,
            notes: item.instructor_notes || ticket?.notes,
            participants,
            language: customer?.language,
          });
        }
      });

      return Array.from(instructorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

// Hook to get lists summary counts
export function useListsSummary(date: Date) {
  const { data: lunchChildren } = useLunchChildren(date);
  const { data: groups } = useGroups(date);
  const { data: bookings } = useDailyBookings(date);
  const { data: instructors } = useInstructorSchedules(date);

  return {
    lunchChildrenCount: lunchChildren?.length || 0,
    groupsCount: groups?.length || 0,
    bookingsCount: bookings?.length || 0,
    instructorsCount: instructors?.length || 0,
  };
}
