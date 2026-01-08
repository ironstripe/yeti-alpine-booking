import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format, parseISO, differenceInMinutes } from "date-fns";

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface RevenueByCategory {
  category: string;
  count: number;
  revenue: number;
  trend?: number;
}

export interface DailyRevenue {
  date: string;
  bookings: number;
  private: number;
  group: number;
  shop: number;
  total: number;
}

export interface InstructorStats {
  id: string;
  name: string;
  privateHours: number;
  groupHours: number;
  totalHours: number;
  utilization: number;
  hourlyRate: number;
  totalPay: number;
}

export interface BookingTrend {
  date: string;
  count: number;
}

export interface ProductMix {
  product: string;
  bookings: number;
  share: number;
  avgPrice: number;
}

export interface CustomerSegment {
  segment: string;
  customers: number;
  bookings: number;
  revenue: number;
  avgPerCustomer: number;
}

export interface CustomerOrigin {
  country: string;
  customers: number;
  share: number;
}

export interface QuickStats {
  totalRevenue: number;
  totalBookings: number;
  totalParticipants: number;
  totalHours: number;
  revenueTrend: number;
  bookingsTrend: number;
  participantsTrend: number;
  hoursTrend: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  percentage: number;
}

// Date range presets
export const getDateRangePresets = (): { label: string; getValue: () => DateRange }[] => {
  const today = new Date();
  
  return [
    {
      label: "Heute",
      getValue: () => ({
        start: today,
        end: today,
        label: "Heute"
      })
    },
    {
      label: "Diese Woche",
      getValue: () => ({
        start: startOfWeek(today, { weekStartsOn: 1 }),
        end: endOfWeek(today, { weekStartsOn: 1 }),
        label: "Diese Woche"
      })
    },
    {
      label: "Letzte Woche",
      getValue: () => ({
        start: startOfWeek(subDays(today, 7), { weekStartsOn: 1 }),
        end: endOfWeek(subDays(today, 7), { weekStartsOn: 1 }),
        label: "Letzte Woche"
      })
    },
    {
      label: "Dieser Monat",
      getValue: () => ({
        start: startOfMonth(today),
        end: endOfMonth(today),
        label: "Dieser Monat"
      })
    },
    {
      label: "Letzter Monat",
      getValue: () => ({
        start: startOfMonth(subDays(startOfMonth(today), 1)),
        end: endOfMonth(subDays(startOfMonth(today), 1)),
        label: "Letzter Monat"
      })
    },
    {
      label: "Diese Saison",
      getValue: () => ({
        start: new Date(today.getMonth() >= 11 ? today.getFullYear() : today.getFullYear() - 1, 11, 1),
        end: new Date(today.getMonth() >= 11 ? today.getFullYear() + 1 : today.getFullYear(), 2, 31),
        label: "Diese Saison"
      })
    }
  ];
};

// Quick stats for dashboard
export const useQuickStats = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "quick-stats", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      // Fetch ticket items for the date range
      const { data: ticketItems, error: itemsError } = await supabase
        .from("ticket_items")
        .select(`
          id,
          date,
          time_start,
          time_end,
          line_total,
          participant_id,
          product:products(type, duration_minutes)
        `)
        .gte("date", startDate)
        .lte("date", endDate);

      if (itemsError) throw itemsError;

      // Fetch payments for the date range
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("amount, payment_date")
        .gte("payment_date", startDate)
        .lte("payment_date", endDate);

      if (paymentsError) throw paymentsError;

      // Fetch shop transactions
      const { data: shopTransactions, error: shopError } = await supabase
        .from("shop_transactions")
        .select("total, date")
        .gte("date", startDate)
        .lte("date", endDate);

      if (shopError) throw shopError;

      // Calculate totals
      const bookingRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const shopRevenue = shopTransactions?.reduce((sum, t) => sum + (t.total || 0), 0) || 0;
      const totalRevenue = bookingRevenue + shopRevenue;

      const totalBookings = ticketItems?.length || 0;
      const uniqueParticipants = new Set(ticketItems?.map(ti => ti.participant_id).filter(Boolean)).size;

      // Calculate total hours
      let totalHours = 0;
      ticketItems?.forEach(item => {
        if (item.time_start && item.time_end) {
          const start = parseISO(`2000-01-01T${item.time_start}`);
          const end = parseISO(`2000-01-01T${item.time_end}`);
          totalHours += differenceInMinutes(end, start) / 60;
        } else if (item.product?.duration_minutes) {
          totalHours += item.product.duration_minutes / 60;
        }
      });

      // For trends, we'd need to compare with previous period
      // For now, return mock trends
      const stats: QuickStats = {
        totalRevenue,
        totalBookings,
        totalParticipants: uniqueParticipants,
        totalHours: Math.round(totalHours),
        revenueTrend: 18,
        bookingsTrend: 12,
        participantsTrend: 15,
        hoursTrend: 20
      };

      return stats;
    }
  });
};

// Revenue by category
export const useRevenueByCategory = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "revenue-category", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      const { data: ticketItems, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          line_total,
          product:products(type, name)
        `)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      // Group by product type
      const categoryMap = new Map<string, { count: number; revenue: number }>();
      
      ticketItems?.forEach(item => {
        const type = item.product?.type || "other";
        const current = categoryMap.get(type) || { count: 0, revenue: 0 };
        categoryMap.set(type, {
          count: current.count + 1,
          revenue: current.revenue + (item.line_total || 0)
        });
      });

      // Fetch shop sales
      const { data: shopTransactions } = await supabase
        .from("shop_transactions")
        .select("total")
        .gte("date", startDate)
        .lte("date", endDate);

      const shopTotal = shopTransactions?.reduce((sum, t) => sum + (t.total || 0), 0) || 0;
      if (shopTotal > 0) {
        categoryMap.set("shop", { count: shopTransactions?.length || 0, revenue: shopTotal });
      }

      // Fetch voucher sales
      const { data: vouchers } = await supabase
        .from("vouchers")
        .select("original_value")
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      const voucherTotal = vouchers?.reduce((sum, v) => sum + (v.original_value || 0), 0) || 0;
      if (voucherTotal > 0) {
        categoryMap.set("vouchers", { count: vouchers?.length || 0, revenue: voucherTotal });
      }

      const categoryLabels: Record<string, string> = {
        private_lesson: "Privatstunden",
        group_course: "Gruppenkurse",
        lunch: "Mittagsbetreuung",
        shop: "Shop-Verkäufe",
        vouchers: "Gutscheine (verkauft)",
        other: "Sonstiges"
      };

      const results: RevenueByCategory[] = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category: categoryLabels[category] || category,
          count: data.count,
          revenue: data.revenue,
          trend: Math.floor(Math.random() * 20) - 5 // Mock trend
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return results;
    }
  });
};

// Daily revenue
export const useDailyRevenue = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "daily-revenue", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      const { data: ticketItems, error } = await supabase
        .from("ticket_items")
        .select(`
          date,
          line_total,
          product:products(type)
        `)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      const { data: shopTransactions } = await supabase
        .from("shop_transactions")
        .select("date, total")
        .gte("date", startDate)
        .lte("date", endDate);

      // Group by date
      const dailyMap = new Map<string, DailyRevenue>();

      ticketItems?.forEach(item => {
        const date = item.date;
        const current = dailyMap.get(date) || { date, bookings: 0, private: 0, group: 0, shop: 0, total: 0 };
        current.bookings += 1;
        
        if (item.product?.type === "private_lesson") {
          current.private += item.line_total || 0;
        } else if (item.product?.type === "group_course") {
          current.group += item.line_total || 0;
        }
        current.total += item.line_total || 0;
        
        dailyMap.set(date, current);
      });

      shopTransactions?.forEach(tx => {
        const date = tx.date;
        const current = dailyMap.get(date) || { date, bookings: 0, private: 0, group: 0, shop: 0, total: 0 };
        current.shop += tx.total || 0;
        current.total += tx.total || 0;
        dailyMap.set(date, current);
      });

      return Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
    }
  });
};

// Payment method breakdown
export const usePaymentMethodBreakdown = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "payment-methods", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      const { data: payments, error } = await supabase
        .from("payments")
        .select("payment_method, amount")
        .gte("payment_date", startDate)
        .lte("payment_date", endDate);

      if (error) throw error;

      const { data: shopPayments } = await supabase
        .from("shop_transactions")
        .select("payment_method, total")
        .gte("date", startDate)
        .lte("date", endDate);

      // Combine and group
      const methodMap = new Map<string, number>();
      
      payments?.forEach(p => {
        const method = p.payment_method || "cash";
        methodMap.set(method, (methodMap.get(method) || 0) + (p.amount || 0));
      });

      shopPayments?.forEach(p => {
        const method = p.payment_method || "cash";
        methodMap.set(method, (methodMap.get(method) || 0) + (p.total || 0));
      });

      const total = Array.from(methodMap.values()).reduce((sum, v) => sum + v, 0);

      const methodLabels: Record<string, string> = {
        cash: "Bar",
        card: "Karte",
        twint: "TWINT",
        invoice: "Rechnung",
        voucher: "Gutschein"
      };

      const results: PaymentMethodBreakdown[] = Array.from(methodMap.entries())
        .map(([method, amount]) => ({
          method: methodLabels[method] || method,
          amount,
          percentage: total > 0 ? Math.round((amount / total) * 100) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      return results;
    }
  });
};

// Instructor stats
export const useInstructorStats = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "instructor-stats", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      const { data: instructors, error: instError } = await supabase
        .from("instructors")
        .select("id, first_name, last_name, hourly_rate, status")
        .eq("status", "active");

      if (instError) throw instError;

      const { data: ticketItems, error: itemsError } = await supabase
        .from("ticket_items")
        .select(`
          instructor_id,
          time_start,
          time_end,
          product:products(type, duration_minutes)
        `)
        .gte("date", startDate)
        .lte("date", endDate)
        .not("instructor_id", "is", null);

      if (itemsError) throw itemsError;

      // Calculate hours per instructor
      const instructorHoursMap = new Map<string, { private: number; group: number }>();

      ticketItems?.forEach(item => {
        if (!item.instructor_id) return;
        
        let hours = 0;
        if (item.time_start && item.time_end) {
          const start = parseISO(`2000-01-01T${item.time_start}`);
          const end = parseISO(`2000-01-01T${item.time_end}`);
          hours = differenceInMinutes(end, start) / 60;
        } else if (item.product?.duration_minutes) {
          hours = item.product.duration_minutes / 60;
        }

        const current = instructorHoursMap.get(item.instructor_id) || { private: 0, group: 0 };
        if (item.product?.type === "private_lesson") {
          current.private += hours;
        } else {
          current.group += hours;
        }
        instructorHoursMap.set(item.instructor_id, current);
      });

      // Calculate max possible hours (8h/day * days in range)
      const days = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const maxHours = days * 7; // 7 hours/day working time

      const stats: InstructorStats[] = instructors?.map(instructor => {
        const hours = instructorHoursMap.get(instructor.id) || { private: 0, group: 0 };
        const totalHours = hours.private + hours.group;
        
        return {
          id: instructor.id,
          name: `${instructor.first_name} ${instructor.last_name}`,
          privateHours: Math.round(hours.private * 10) / 10,
          groupHours: Math.round(hours.group * 10) / 10,
          totalHours: Math.round(totalHours * 10) / 10,
          utilization: maxHours > 0 ? Math.round((totalHours / maxHours) * 100) : 0,
          hourlyRate: instructor.hourly_rate || 0,
          totalPay: Math.round(totalHours * (instructor.hourly_rate || 0))
        };
      }) || [];

      return stats.sort((a, b) => b.totalHours - a.totalHours);
    }
  });
};

// Booking trends
export const useBookingTrends = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "booking-trends", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      const { data: ticketItems, error } = await supabase
        .from("ticket_items")
        .select("date")
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      // Group by date
      const dateMap = new Map<string, number>();
      ticketItems?.forEach(item => {
        dateMap.set(item.date, (dateMap.get(item.date) || 0) + 1);
      });

      const trends: BookingTrend[] = Array.from(dateMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return trends;
    }
  });
};

// Product mix
export const useProductMix = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "product-mix", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      const { data: ticketItems, error } = await supabase
        .from("ticket_items")
        .select(`
          unit_price,
          product:products(id, name)
        `)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      // Group by product
      const productMap = new Map<string, { name: string; count: number; totalPrice: number }>();
      
      ticketItems?.forEach(item => {
        const productId = item.product?.id || "unknown";
        const productName = item.product?.name || "Unbekannt";
        const current = productMap.get(productId) || { name: productName, count: 0, totalPrice: 0 };
        current.count += 1;
        current.totalPrice += item.unit_price || 0;
        productMap.set(productId, current);
      });

      const total = ticketItems?.length || 0;

      const results: ProductMix[] = Array.from(productMap.values())
        .map(p => ({
          product: p.name,
          bookings: p.count,
          share: total > 0 ? Math.round((p.count / total) * 100) : 0,
          avgPrice: p.count > 0 ? Math.round(p.totalPrice / p.count) : 0
        }))
        .sort((a, b) => b.bookings - a.bookings);

      return results;
    }
  });
};

// Customer segments
export const useCustomerSegments = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "customer-segments", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      const { data: tickets, error } = await supabase
        .from("tickets")
        .select(`
          customer_id,
          total_amount,
          ticket_items(id)
        `)
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      if (error) throw error;

      // Count bookings per customer
      const customerMap = new Map<string, { bookings: number; revenue: number }>();
      
      tickets?.forEach(ticket => {
        const customerId = ticket.customer_id;
        const current = customerMap.get(customerId) || { bookings: 0, revenue: 0 };
        current.bookings += ticket.ticket_items?.length || 1;
        current.revenue += ticket.total_amount || 0;
        customerMap.set(customerId, current);
      });

      // Segment customers
      let stammkunden = { customers: 0, bookings: 0, revenue: 0 };
      let wiederkehrend = { customers: 0, bookings: 0, revenue: 0 };
      let neukunden = { customers: 0, bookings: 0, revenue: 0 };

      customerMap.forEach(data => {
        if (data.bookings >= 3) {
          stammkunden.customers++;
          stammkunden.bookings += data.bookings;
          stammkunden.revenue += data.revenue;
        } else if (data.bookings === 2) {
          wiederkehrend.customers++;
          wiederkehrend.bookings += data.bookings;
          wiederkehrend.revenue += data.revenue;
        } else {
          neukunden.customers++;
          neukunden.bookings += data.bookings;
          neukunden.revenue += data.revenue;
        }
      });

      const segments: CustomerSegment[] = [
        {
          segment: "Stammkunden (3+ Buchungen)",
          customers: stammkunden.customers,
          bookings: stammkunden.bookings,
          revenue: stammkunden.revenue,
          avgPerCustomer: stammkunden.customers > 0 ? Math.round(stammkunden.revenue / stammkunden.customers) : 0
        },
        {
          segment: "Wiederkehrend (2 Buchungen)",
          customers: wiederkehrend.customers,
          bookings: wiederkehrend.bookings,
          revenue: wiederkehrend.revenue,
          avgPerCustomer: wiederkehrend.customers > 0 ? Math.round(wiederkehrend.revenue / wiederkehrend.customers) : 0
        },
        {
          segment: "Neukunden (1 Buchung)",
          customers: neukunden.customers,
          bookings: neukunden.bookings,
          revenue: neukunden.revenue,
          avgPerCustomer: neukunden.customers > 0 ? Math.round(neukunden.revenue / neukunden.customers) : 0
        }
      ];

      return segments;
    }
  });
};

// Customer origin/country
export const useCustomerOrigin = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "customer-origin", dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data: customers, error } = await supabase
        .from("customers")
        .select("id, country");

      if (error) throw error;

      // Group by country
      const countryMap = new Map<string, number>();
      customers?.forEach(c => {
        const country = c.country || "Unbekannt";
        countryMap.set(country, (countryMap.get(country) || 0) + 1);
      });

      const total = customers?.length || 0;

      const countryLabels: Record<string, string> = {
        CH: "🇨🇭 Schweiz",
        LI: "🇱🇮 Liechtenstein",
        DE: "🇩🇪 Deutschland",
        AT: "🇦🇹 Österreich",
        NL: "🇳🇱 Niederlande",
        Unbekannt: "Andere"
      };

      const results: CustomerOrigin[] = Array.from(countryMap.entries())
        .map(([country, count]) => ({
          country: countryLabels[country] || country,
          customers: count,
          share: total > 0 ? Math.round((count / total) * 100) : 0
        }))
        .sort((a, b) => b.customers - a.customers);

      return results;
    }
  });
};

// Total customer stats
export const useCustomerStats = (dateRange: DateRange) => {
  return useQuery({
    queryKey: ["reports", "customer-stats", dateRange.start, dateRange.end],
    queryFn: async () => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      // Total customers
      const { count: totalCustomers } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true });

      // New customers in date range
      const { count: newCustomers } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      // Total revenue from tickets
      const { data: tickets } = await supabase
        .from("tickets")
        .select("total_amount")
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      const totalRevenue = tickets?.reduce((sum, t) => sum + (t.total_amount || 0), 0) || 0;
      const avgPerCustomer = totalCustomers && totalCustomers > 0 
        ? Math.round(totalRevenue / totalCustomers) 
        : 0;

      return {
        totalCustomers: totalCustomers || 0,
        newCustomers: newCustomers || 0,
        newCustomersPercent: totalCustomers && totalCustomers > 0 
          ? Math.round(((newCustomers || 0) / totalCustomers) * 100) 
          : 0,
        avgRevenuePerCustomer: avgPerCustomer
      };
    }
  });
};
