import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { PaymentMethodBreakdown } from "@/hooks/useReportsData";

interface PaymentMethodChartProps {
  data: PaymentMethodBreakdown[] | undefined;
  isLoading: boolean;
}

export function PaymentMethodChart({ data, isLoading }: PaymentMethodChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Zahlungsarten</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const colorMap: Record<string, string> = {
    "Bar": "bg-green-500",
    "Karte": "bg-blue-500",
    "TWINT": "bg-purple-500",
    "Rechnung": "bg-orange-500",
    "Gutschein": "bg-pink-500",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zahlungsarten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.map((method) => (
          <div key={method.method} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{method.method}</span>
              <span className="text-muted-foreground">
                {formatCurrency(method.amount)} ({method.percentage}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${colorMap[method.method] || "bg-primary"}`}
                style={{ width: `${method.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
