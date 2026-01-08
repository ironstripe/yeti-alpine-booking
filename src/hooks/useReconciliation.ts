import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

export interface ReconciliationData {
  id: string;
  date: string;
  status: "open" | "closed" | "no_revenue";
  total_revenue: number;
  total_bookings: number;
  total_instructors: number;
  total_hours: number;
  cash_expected: number;
  cash_actual: number | null;
  card_expected: number;
  card_actual: number | null;
  twint_expected: number;
  twint_actual: number | null;
  difference: number;
  difference_reason: string | null;
  difference_acknowledged: boolean;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  notes: string | null;
}

export interface DayPaymentBreakdown {
  method: string;
  count: number;
  total: number;
}

export interface DayBooking {
  id: string;
  ticket_number: string;
  customer_name: string;
  product_name: string;
  payment_method: string | null;
  total: number;
}

export interface InstructorHours {
  id: string;
  name: string;
  bookings: number;
  totalHours: number;
  privateHours: number;
  groupHours: number;
}

export interface DaySummary {
  totalRevenue: number;
  totalBookings: number;
  totalInstructors: number;
  totalHours: number;
  paymentBreakdown: DayPaymentBreakdown[];
  bookings: DayBooking[];
  instructorHours: InstructorHours[];
}

// Fetch or create reconciliation record for a date
export function useReconciliation(date: Date) {
  const dateStr = format(date, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["reconciliation", dateStr],
    queryFn: async () => {
      // Try to fetch existing reconciliation
      const { data: existing, error: fetchError } = await supabase
        .from("daily_reconciliations")
        .select("*")
        .eq("date", dateStr)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        return existing as ReconciliationData;
      }

      // No existing record - return null (will be created on first save)
      return null;
    },
  });
}

// Fetch day's data for summary
export function useDaySummary(date: Date) {
  const dateStr = format(date, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["day-summary", dateStr],
    queryFn: async (): Promise<DaySummary> => {
      // Fetch payments made on this date
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select(`
          id,
          amount,
          payment_method,
          ticket:tickets!payments_ticket_id_fkey (
            id,
            ticket_number,
            customer:customers!tickets_customer_id_fkey (
              first_name,
              last_name
            )
          )
        `)
        .eq("payment_date", dateStr);

      if (paymentsError) throw paymentsError;

      // Fetch ticket_items for the date
      const { data: items, error: itemsError } = await supabase
        .from("ticket_items")
        .select(`
          id,
          line_total,
          time_start,
          time_end,
          instructor_id,
          product:products!ticket_items_product_id_fkey (
            name,
            type,
            duration_minutes
          ),
          instructor:instructors!ticket_items_instructor_id_fkey (
            id,
            first_name,
            last_name
          ),
          ticket:tickets!ticket_items_ticket_id_fkey (
            id,
            ticket_number,
            payment_method,
            total_amount,
            customer:customers!tickets_customer_id_fkey (
              first_name,
              last_name
            )
          )
        `)
        .eq("date", dateStr);

      if (itemsError) throw itemsError;

      // Calculate payment breakdown from payments table
      const paymentMethodTotals: Record<string, { count: number; total: number }> = {};
      (payments || []).forEach((p) => {
        const method = p.payment_method || "other";
        if (!paymentMethodTotals[method]) {
          paymentMethodTotals[method] = { count: 0, total: 0 };
        }
        paymentMethodTotals[method].count += 1;
        paymentMethodTotals[method].total += p.amount || 0;
      });

      const paymentBreakdown: DayPaymentBreakdown[] = Object.entries(paymentMethodTotals).map(
        ([method, data]) => ({
          method,
          count: data.count,
          total: data.total,
        })
      );

      // Calculate total revenue from payments
      const totalRevenue = paymentBreakdown.reduce((sum, p) => sum + p.total, 0);

      // Build unique bookings list from items
      const bookingsMap = new Map<string, DayBooking>();
      (items || []).forEach((item) => {
        const ticket = item.ticket as any;
        if (!ticket || bookingsMap.has(ticket.id)) return;
        
        const customer = ticket.customer as any;
        bookingsMap.set(ticket.id, {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          customer_name: `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim(),
          product_name: (item.product as any)?.name || "Unbekannt",
          payment_method: ticket.payment_method,
          total: ticket.total_amount || 0,
        });
      });

      // Calculate instructor hours
      const instructorMap = new Map<string, InstructorHours>();
      (items || []).forEach((item) => {
        const instructor = item.instructor as any;
        if (!instructor) return;

        const product = item.product as any;
        const durationMinutes = product?.duration_minutes || 60;
        const hours = durationMinutes / 60;
        const isGroup = product?.type === "group";

        if (!instructorMap.has(instructor.id)) {
          instructorMap.set(instructor.id, {
            id: instructor.id,
            name: `${instructor.first_name} ${instructor.last_name}`,
            bookings: 0,
            totalHours: 0,
            privateHours: 0,
            groupHours: 0,
          });
        }

        const entry = instructorMap.get(instructor.id)!;
        entry.bookings += 1;
        entry.totalHours += hours;
        if (isGroup) {
          entry.groupHours += hours;
        } else {
          entry.privateHours += hours;
        }
      });

      // Count unique instructors
      const totalInstructors = instructorMap.size;
      const totalHours = Array.from(instructorMap.values()).reduce((sum, i) => sum + i.totalHours, 0);

      return {
        totalRevenue,
        totalBookings: bookingsMap.size,
        totalInstructors,
        totalHours,
        paymentBreakdown,
        bookings: Array.from(bookingsMap.values()),
        instructorHours: Array.from(instructorMap.values()),
      };
    },
  });
}

// Save/update reconciliation
export function useSaveReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<ReconciliationData> & { date: string }) => {
      const { data: existing } = await supabase
        .from("daily_reconciliations")
        .select("id")
        .eq("date", data.date)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("daily_reconciliations")
          .update(data)
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("daily_reconciliations")
          .insert(data);

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation", variables.date] });
      toast.success("Änderungen gespeichert");
    },
    onError: (error) => {
      toast.error("Fehler beim Speichern: " + error.message);
    },
  });
}

// Close reconciliation
export function useCloseReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ date, userName }: { date: string; userName: string }) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("daily_reconciliations")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: user.user?.id,
          closed_by_name: userName,
        })
        .eq("date", date);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation", variables.date] });
      toast.success("Tag erfolgreich abgeschlossen");
    },
    onError: (error) => {
      toast.error("Fehler beim Abschliessen: " + error.message);
    },
  });
}
