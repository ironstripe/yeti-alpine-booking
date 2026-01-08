import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, Users, BarChart3, ShoppingCart, Calendar } from "lucide-react";

interface ReportCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
}

const categories: ReportCategory[] = [
  {
    id: "revenue",
    title: "Umsatz & Einnahmen",
    description: "Umsatzentwicklung, Zahlungsarten, tägliche Einnahmen",
    icon: <TrendingUp className="h-8 w-8" />,
    path: "/reports/revenue",
  },
  {
    id: "instructors",
    title: "Skilehrer-Auswertung",
    description: "Stunden, Auslastung, Lohnabrechnung",
    icon: <Users className="h-8 w-8" />,
    path: "/reports/instructors",
  },
  {
    id: "bookings",
    title: "Buchungs-Analyse",
    description: "Trends, Produktmix, Stornierungen",
    icon: <BarChart3 className="h-8 w-8" />,
    path: "/reports/bookings",
  },
  {
    id: "customers",
    title: "Kunden-Statistik",
    description: "Segmente, Herkunft, Wiederkäufer",
    icon: <Users className="h-8 w-8" />,
    path: "/reports/customers",
  },
  {
    id: "shop",
    title: "Shop-Auswertung",
    description: "Verkäufe, Bestseller, Lagerbestand",
    icon: <ShoppingCart className="h-8 w-8" />,
    path: "/shop/transactions",
  },
  {
    id: "season",
    title: "Saison-Vergleich",
    description: "Jahr-zu-Jahr Entwicklung",
    icon: <Calendar className="h-8 w-8" />,
    path: "/reports/revenue",
  },
];

export function ReportCategoryCards() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Verfügbare Berichte</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <Card 
            key={category.id} 
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(category.path)}
          >
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-3 rounded-full bg-primary/10 text-primary">
                  {category.icon}
                </div>
                <div>
                  <h3 className="font-semibold">{category.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {category.description}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="gap-1">
                  Öffnen <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
