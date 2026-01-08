import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ProductCard } from "@/components/shop/ProductCard";
import { useShopArticles, useShopCategories } from "@/hooks/useShopData";

export default function ShopProducts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: articles, isLoading } = useShopArticles(categoryFilter, statusFilter);
  const { data: categories } = useShopCategories();

  const filteredArticles = articles?.filter(
    (article) =>
      article.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produktkatalog"
        description="Alle Artikel im Shop verwalten"
      >
        <Button asChild>
          <Link to="/shop/products/new">
            <Plus className="mr-2 h-4 w-4" />
            Neues Produkt
          </Link>
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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="inactive">Inaktiv</SelectItem>
            <SelectItem value="sold_out">Ausverkauft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredArticles?.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Keine Produkte gefunden.</p>
          <Button asChild className="mt-4">
            <Link to="/shop/products/new">
              <Plus className="mr-2 h-4 w-4" />
              Erstes Produkt erstellen
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredArticles?.map((article) => (
            <ProductCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
