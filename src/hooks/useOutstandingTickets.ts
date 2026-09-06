import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DerivedPaymentStatus,
  EXCLUDED_TICKET_STATUSES,
  derivePaymentStatus,
  getOutstanding,
  isActiveItemStatus,
} from "@/lib/finance";

export interface OutstandingTicketRow {
  id: string;
  ticket_number: string;
  status: string | null;
  created_at: string;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  payment_method: string | null;
  payment_due_date: string | null;
  paymentStatus: DerivedPaymentStatus;
  isOverdue: boolean;
  courseDateFrom: string | null;
  courseDateTo: string | null;
  courseSummary: string;
  courseType: "private" | "group" | "other";
  customer: {
    id: string | null;
    name: string;
    email: string | null;
  };
  billingPartner: { id: string; name: string } | null;
  availableCredit: number;
}

export interface OutstandingFilters {
  createdFrom?: string | null;
  createdTo?: string | null;
  courseFrom?: string | null;
  courseTo?: string | null;
  courseType?: "all" | "private" | "group";
  paymentMethod?: string | "all";
  billingPartnerId?: string | "all";
  onlyOverdue?: boolean;
  onlyWithCredit?: boolean;
  search?: string;
}

export const defaultOutstandingFilters: OutstandingFilters = {
  createdFrom: null,
  createdTo: null,
  courseFrom: null,
  courseTo: null,
  courseType: "all",
  paymentMethod: "all",
  billingPartnerId: "all",
  onlyOverdue: false,
  onlyWithCredit: false,
  search: "",
};

function classifyCourseType(items: any[]): "private" | "group" | "other" {
  const types = items.map((i) => i.product?.type).filter(Boolean) as string[];
  if (types.some((t) => t.startsWith("group"))) return "group";
  if (types.some((t) => t === "private")) return "private";
  return "other";
}

/**
 * Single source of truth for "bookings with an open balance".
 * Used by the dashboard counter and the "Unbezahlte Kurse" worklist so
 * the two can never drift apart.
 */
export function useOutstandingTickets() {
  return useQuery({
    queryKey: ["outstanding-tickets"],
    queryFn: async (): Promise<OutstandingTicketRow[]> => {
      const { data: tickets, error } = await supabase
        .from("tickets")
        .select(
          `
          id,
          ticket_number,
          status,
          created_at,
          total_amount,
          paid_amount,
          payment_method,
          payment_due_date,
          billing_partner_id,
          customer:customers!tickets_customer_id_fkey ( id, first_name, last_name, email ),
          billing_partner:billing_partners ( id, name ),
          ticket_items ( id, date, status, product:products!ticket_items_product_id_fkey ( name, type ) )
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const active = (tickets || []).filter((t: any) => {
        const status = (t.status || "").toLowerCase();
        if (EXCLUDED_TICKET_STATUSES.includes(status)) return false;
        return getOutstanding(t.total_amount, t.paid_amount) > 0.009;
      });

      const customerIds = Array.from(
        new Set(active.map((t: any) => t.customer?.id).filter(Boolean))
      ) as string[];

      const creditMap = new Map<string, number>();
      if (customerIds.length > 0) {
        const { data: credits } = await supabase
          .from("customer_credits")
          .select("customer_id, remaining_amount, status")
          .in("customer_id", customerIds);

        (credits || []).forEach((c: any) => {
          if ((c.status || "active") !== "active") return;
          const amount = Number(c.remaining_amount || 0);
          if (amount <= 0) return;
          creditMap.set(c.customer_id, (creditMap.get(c.customer_id) || 0) + amount);
        });
      }

      return active.map((t: any): OutstandingTicketRow => {
        const items = (t.ticket_items || []).filter((i: any) => isActiveItemStatus(i.status));
        const dates = items.map((i: any) => i.date).filter(Boolean).sort();
        const productNames = Array.from(
          new Set(items.map((i: any) => i.product?.name).filter(Boolean))
        ) as string[];

        const total = Number(t.total_amount || 0);
        const paid = Number(t.paid_amount || 0);
        const paymentStatus = derivePaymentStatus({
          totalAmount: total,
          paidAmount: paid,
          dueDate: t.payment_due_date,
        });

        return {
          id: t.id,
          ticket_number: t.ticket_number,
          status: t.status,
          created_at: t.created_at,
          total_amount: total,
          paid_amount: paid,
          outstanding: getOutstanding(total, paid),
          payment_method: t.payment_method,
          payment_due_date: t.payment_due_date,
          paymentStatus,
          isOverdue: paymentStatus === "overdue",
          courseDateFrom: dates[0] ?? null,
          courseDateTo: dates.length ? dates[dates.length - 1] : null,
          courseSummary: productNames.join(", ") || "–",
          courseType: classifyCourseType(items),
          customer: {
            id: t.customer?.id ?? null,
            name: t.customer
              ? `${t.customer.first_name || ""} ${t.customer.last_name || ""}`.trim()
              : "Provisorisch (Website)",
            email: t.customer?.email ?? null,
          },
          billingPartner: t.billing_partner
            ? { id: t.billing_partner.id, name: t.billing_partner.name }
            : null,
          availableCredit: creditMap.get(t.customer?.id) || 0,
        };
      });
    },
  });
}

export function filterOutstandingRows(
  rows: OutstandingTicketRow[],
  filters: OutstandingFilters
): OutstandingTicketRow[] {
  const search = (filters.search || "").trim().toLowerCase();

  return rows.filter((row) => {
    const createdDate = row.created_at.slice(0, 10);
    if (filters.createdFrom && createdDate < filters.createdFrom) return false;
    if (filters.createdTo && createdDate > filters.createdTo) return false;

    if (filters.courseFrom && (!row.courseDateTo || row.courseDateTo < filters.courseFrom)) return false;
    if (filters.courseTo && (!row.courseDateFrom || row.courseDateFrom > filters.courseTo)) return false;

    if (filters.courseType && filters.courseType !== "all" && row.courseType !== filters.courseType) {
      return false;
    }

    if (filters.paymentMethod && filters.paymentMethod !== "all") {
      if ((row.payment_method || "") !== filters.paymentMethod) return false;
    }

    if (filters.billingPartnerId && filters.billingPartnerId !== "all") {
      if (row.billingPartner?.id !== filters.billingPartnerId) return false;
    }

    if (filters.onlyOverdue && !row.isOverdue) return false;
    if (filters.onlyWithCredit && row.availableCredit <= 0) return false;

    if (search) {
      const haystack = `${row.ticket_number} ${row.customer.name} ${row.customer.email || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function useOutstandingCount() {
  const { data, isLoading } = useOutstandingTickets();
  const count = useMemo(() => data?.length ?? 0, [data]);
  const totalOutstanding = useMemo(
    () => (data || []).reduce((sum, row) => sum + row.outstanding, 0),
    [data]
  );
  return { count, totalOutstanding, rows: data ?? [], isLoading };
}
