import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Loader2 } from "lucide-react";
import { usePopularArticles, useShopArticles, ShopArticle } from "@/hooks/useShopData";

interface QuickPOSProps {
  onAddToCart: (article: ShopArticle) => void;
}

export function QuickPOS({ onAddToCart }: QuickPOSProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: popularArticles, isLoading: loadingPopular } = usePopularArticles();
  const { data: allArticles } = useShopArticles();

  const filteredArticles = searchQuery.trim()
    ? allArticles?.filter(
        (a) =>
          a.status === "active" &&
          (a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.sku.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const getStockColor = (article: ShopArticle) => {
    if (article.stock_quantity <= 1) return "text-red-600";
    if (article.stock_quantity <= article.min_stock) return "text-amber-600";
    return "text-green-600";
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);
  };

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Schnellverkauf</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Artikel suchen oder scannen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Search Results */}
        {searchQuery.trim() && filteredArticles && filteredArticles.length > 0 && (
          <div className="border rounded-lg divide-y max-h-48 overflow-auto">
            {filteredArticles.map((article) => (
              <div
                key={article.id}
                className="p-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                onClick={() => {
                  onAddToCart(article);
                  setSearchQuery("");
                }}
              >
                <div>
                  <p className="font-medium">{article.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {article.sku} · <span className={getStockColor(article)}>{article.stock_quantity} Stk.</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(article.price)}</p>
                  <Button size="sm" variant="ghost" className="h-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {searchQuery.trim() && filteredArticles?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Keine Artikel gefunden</p>
        )}

        {/* Popular Articles */}
        {!searchQuery.trim() && (
          <>
            <p className="text-sm font-medium text-muted-foreground">Beliebte Artikel</p>
            {loadingPopular ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {popularArticles?.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => onAddToCart(article)}
                    disabled={article.stock_quantity <= 0}
                    className="border rounded-lg p-3 text-center hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="text-2xl mb-1">{getCategoryEmoji(article.category)}</div>
                    <p className="font-medium text-sm truncate">{article.name}</p>
                    <p className="text-sm font-semibold text-primary">
                      {formatCurrency(article.price)}
                    </p>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs"
                        disabled={article.stock_quantity <= 0}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Hinzufügen
                      </Button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
