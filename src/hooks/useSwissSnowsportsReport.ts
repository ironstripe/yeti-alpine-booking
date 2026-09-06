import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { isActiveItemStatus, minutesBetween, sessionKey } from "@/lib/finance";
import type { DateRange } from "./useReportsData";

export interface SwissSnowsportsRow {
  key: string;
  discipline: string;
  audience: string;
  category: string;
  /** true when the underlying products carry no reporting metadata */
  unclassified: boolean;
  lessons: number;
  participants: number;
  hours: number;
  revenue: number;
}

const DISCIPLINE_LABELS: Record<string, string> = {
  ski: "Ski",
  snowboard: "Snowboard",
  other: "Andere",
};
const AUDIENCE_LABELS: Record<string, string> = {
  kids: "Kinder",
  adults: "Erwachsene",
  mixed: "Gemischt",
};
const CATEGORY_LABELS: Record<string, string> = {
  private: "Privat",
  group: "Gruppe",
  other: "Andere",
};

/**
 * Swiss Snowsports statistics: unique lessons, participants and taught hours
 * per discipline / audience / course form. Products without reporting metadata
 * are reported explicitly as "Nicht klassifiziert" instead of being guessed.
 */
export function useSwissSnowsportsReport(dateRange: DateRange) {
  return useQuery({
    queryKey: ["reports", "swiss-snowsports", dateRange.start, dateRange.end],
    queryFn: async (): Promise<SwissSnowsportsRow[]> => {
      const startDate = format(dateRange.start, "yyyy-MM-dd");
      const endDate = format(dateRange.end, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("ticket_items")
        .select(
          `
          id, date, time_start, time_end, status, line_total,
          participant_id, instructor_id, actual_duration_minutes,
          product:products!ticket_items_product_id_fkey (
            name, type, duration_minutes, discipline, audience, reporting_category
          )
        `
        )
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      const items = (data || []).filter((i: any) => isActiveItemStatus(i.status));

      const groups = new Map<
        string,
        {
          discipline: string;
          audience: string;
          category: string;
          unclassified: boolean;
          sessions: Map<string, number>;
          participants: Set<string>;
          revenue: number;
        }
      >();

      items.forEach((item: any) => {
        const p = item.product || {};
        const unclassified = !p.discipline || !p.audience || !p.reporting_category;
        const discipline = p.discipline || "unclassified";
        const audience = p.audience || "unclassified";
        const category = p.reporting_category || "unclassified";
        const key = `${discipline}|${audience}|${category}`;

        let group = groups.get(key);
        if (!group) {
          group = {
            discipline,
            audience,
            category,
            unclassified,
            sessions: new Map(),
            participants: new Set(),
            revenue: 0,
          };
          groups.set(key, group);
        }

        group.revenue += Number(item.line_total || 0);
        if (item.participant_id) group.participants.add(item.participant_id);

        const sKey = sessionKey({
          instructorId: item.instructor_id,
          date: item.date,
          timeStart: item.time_start,
          timeEnd: item.time_end,
        });
        if (!group.sessions.has(sKey)) {
          const minutes =
            item.actual_duration_minutes ??
            (item.time_start && item.time_end
              ? minutesBetween(item.time_start, item.time_end)
              : p.duration_minutes ?? 0);
          group.sessions.set(sKey, minutes || 0);
        }
      });

      return Array.from(groups.entries())
        .map(([key, g]) => ({
          key,
          discipline: DISCIPLINE_LABELS[g.discipline] || "Nicht klassifiziert",
          audience: AUDIENCE_LABELS[g.audience] || "Nicht klassifiziert",
          category: CATEGORY_LABELS[g.category] || "Nicht klassifiziert",
          unclassified: g.unclassified,
          lessons: g.sessions.size,
          participants: g.participants.size,
          hours:
            Math.round(
              (Array.from(g.sessions.values()).reduce((s, m) => s + m, 0) / 60) * 10
            ) / 10,
          revenue: g.revenue,
        }))
        .sort((a, b) => b.hours - a.hours);
    },
  });
}
