import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Loader2, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { useShopArticles, useShopCategories, ShopArticle } from "@/hooks/useShopData";
import { StockAdjustmentModal } from "@/components/shop/StockAdjustmentModal";

export default function ShopInventory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedArticle, setSelectedArticle] = useState<ShopArticle | null>(null);

  const { data: articles, isLoading } = useShopArticles();
  const { data: categories } = useShopCategories();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);
  };

  const filteredArticles = articles
    ?.filter((a) => {
      if (stockFilter === "low") return a.stock_quantity <= a.min_stock && a.stock_quantity > 0;
      if (stockFilter === "critical") return a.stock_quantity <= 1;
      if (stockFilter === "out") return a.stock_quantity === 0;
      return true;
    })
    ?.filter(
      (a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const getStockIndicator = (article: ShopArticle) => {
    if (article.stock_quantity === 0) return "🔴";
    if (article.stock_quantity <= 1) return "🔴";
    if (article.stock_quantity <= article.min_stock) return "🟡";
    return "🟢";
  };

  const getStockClass = (article: ShopArticle) => {
    if (article.stock_quantity === 0) return "text-red-600 font-bold";
    if (article.stock_quantity <= 1) return "text-red-600";
    if (article.stock_quantity <= article.min_stock) return "text-amber-600";
    return "text-green-600";
  };

  // Calculate totals
  const totalArticles = articles?.length || 0;
  const criticalCount = articles?.filter((a) => a.stock_quantity <= 1).length || 0;
  const totalValueCost = articles?.reduce((sum, a) => sum + (a.cost_price || 0) * a.stock_quantity, 0) || 0;
  const totalValueSale = articles?.reduce((sum, a) => sum + a.price * a.stock_quantity, 0) || 0;

  const handleExportCSV = () => {
    if (!filteredArticles) return;

    const headers = ["Artikel", "SKU", "Kategorie", "Bestand", "Min. Bestand", "EK-Preis", "VK-Preis", "Warenwert (EK)", "Warenwert (VK)"];
    const rows = filteredArticles.map((a) => [
      a.name,
      a.sku,
      a.category,
      a.stock_quantity,
      a.min_stock,
      a.cost_price || "",
      a.price,
      (a.cost_price || 0) * a.stock_quantity,
      a.price * a.stock_quantity,
    ]);

    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventar_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Inventar" description="Bestandsübersicht und -verwaltung">
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Bestandsfilter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Artikel</SelectItem>
            <SelectItem value="low">Niedriger Bestand</SelectItem>
            <SelectItem value="critical">Kritisch (&le; 1)</SelectItem>
            <SelectItem value="out">Ausverkauft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Artikel</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead className="text-right">Bestand</TableHead>
                  <TableHead className="text-right">Min.</TableHead>
                  <TableHead className="text-right">Wert (VK)</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArticles?.map((article) => (
                  <TableRow key={article.id}>
                    <TableCell>{getStockIndicator(article)}</TableCell>
                    <TableCell className="font-medium">{article.name}</TableCell>
                    <TableCell className="text-muted-foreground">{article.sku}</TableCell>
                    <TableCell>{article.category}</TableCell>
                    <TableCell className={`text-right ${getStockClass(article)}`}>
                      {article.stock_quantity}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {article.min_stock}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(article.price * article.stock_quantity)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedArticle(article)}
                      >
                        Anpassen
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredArticles?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Keine Artikel gefunden
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Zusammenfassung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Artikel gesamt</p>
              <p className="text-2xl font-bold">{totalArticles}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Artikel kritisch</p>
              <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Warenwert (EK)</p>
              <p className="text-2xl font-bold">{formatCurrency(totalValueCost)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Warenwert (VK)</p>
              <p className="text-2xl font-bold">{formatCurrency(totalValueSale)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock Adjustment Modal */}
      <StockAdjustmentModal
        open={!!selectedArticle}
        onClose={() => setSelectedArticle(null)}
        article={selectedArticle}
      />
    </div>
  );
}
