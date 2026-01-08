import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingTrend } from "@/hooks/useReportsData";

interface BookingTrendsChartProps {
  data: BookingTrend[] | undefined;
  isLoading: boolean;
}

export function BookingTrendsChart({ data, isLoading }: BookingTrendsChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Buchungstrends</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data?.map((d) => ({
    ...d,
    dateLabel: format(parseISO(d.date), "dd.MM", { locale: de }),
  }));

  const peakDay = data?.reduce((max, d) => d.count > max.count ? d : max, { date: "", count: 0 });
  const avgBookings = data?.length 
    ? Math.round(data.reduce((sum, d) => sum + d.count, 0) / data.length) 
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buchungstrends</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value: number) => [`${value} Buchungen`, "Anzahl"]}
              labelFormatter={(label) => `Datum: ${label}`}
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary) / 0.2)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
        
        <div className="mt-4 flex gap-6 text-sm text-muted-foreground">
          {peakDay?.date && (
            <span>
              Spitzentag: {format(parseISO(peakDay.date), "dd.MM.yyyy", { locale: de })} ({peakDay.count} Buchungen)
            </span>
          )}
          <span>Durchschnitt: {avgBookings} Buchungen/Tag</span>
        </div>
      </CardContent>
    </Card>
  );
}
