import { Card, CardContent } from "@/components/ui/card";
import { Banknote, ShoppingCart, Package, AlertTriangle } from "lucide-react";

interface ShopKPICardsProps {
  todayRevenue: number;
  salesCount: number;
  totalArticles: number;
  lowStockCount: number;
}

export function ShopKPICards({
  todayRevenue,
  salesCount,
  totalArticles,
  lowStockCount,
}: ShopKPICardsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);
  };

  const kpis = [
    {
      label: "Umsatz heute",
      value: formatCurrency(todayRevenue),
      icon: Banknote,
      iconColor: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      label: "Verkäufe heute",
      value: salesCount.toString(),
      icon: ShoppingCart,
      iconColor: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "Artikel im Sortiment",
      value: totalArticles.toString(),
      icon: Package,
      iconColor: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      label: "Niedriger Bestand",
      value: lowStockCount.toString(),
      icon: AlertTriangle,
      iconColor: lowStockCount > 0 ? "text-amber-600" : "text-muted-foreground",
      bgColor: lowStockCount > 0 ? "bg-amber-50" : "bg-muted/50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${kpi.bgColor}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
