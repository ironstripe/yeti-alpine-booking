import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Package } from "lucide-react";
import { ShopArticle } from "@/hooks/useShopData";
import { Link } from "react-router-dom";

interface ProductCardProps {
  article: ShopArticle;
}

export function ProductCard({ article }: ProductCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);
  };

  const getStockIndicator = () => {
    if (article.stock_quantity <= 1) {
      return { color: "🔴", textColor: "text-red-600", label: "Kritisch" };
    }
    if (article.stock_quantity <= article.min_stock) {
      return { color: "🟡", textColor: "text-amber-600", label: "Niedrig" };
    }
    return { color: "🟢", textColor: "text-green-600", label: "Auf Lager" };
  };

  const stockIndicator = getStockIndicator();

  const getCategoryEmoji = (category: string) => {
    const emojis: Record<string, string> = {
      Bekleidung: "👕",
      Ausrüstung: "🎿",
      Accessoires: "🧢",
      Sonstiges: "📦",
    };
    return emojis[category] || "📦";
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Image placeholder */}
        <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center">
          {article.image_url ? (
            <img
              src={article.image_url}
              alt={article.name}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <span className="text-4xl">{getCategoryEmoji(article.category)}</span>
          )}
        </div>

        {/* Article Info */}
        <div className="space-y-2">
          <h3 className="font-semibold truncate">{article.name}</h3>
          <p className="text-lg font-bold text-primary">{formatCurrency(article.price)}</p>

          {/* Stock */}
          <div className="flex items-center gap-2">
            <span>{stockIndicator.color}</span>
            <span className={`text-sm ${stockIndicator.textColor}`}>
              {article.stock_quantity} Stk.
            </span>
          </div>

          {/* Category */}
          <Badge variant="secondary" className="text-xs">
            {article.category}
          </Badge>

          {/* Status Badge */}
          {article.status !== "active" && (
            <Badge variant={article.status === "inactive" ? "outline" : "destructive"}>
              {article.status === "inactive" ? "Inaktiv" : "Ausverkauft"}
            </Badge>
          )}

          {/* Edit Button */}
          <Button asChild variant="outline" className="w-full mt-2">
            <Link to={`/shop/products/${article.id}`}>
              <Edit className="mr-2 h-4 w-4" />
              Bearbeiten
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
