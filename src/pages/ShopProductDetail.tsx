import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Trash2, Package, Loader2 } from "lucide-react";
import { useShopArticle, useUpdateArticle, useDeleteArticle, useCreateArticle, useShopCategories } from "@/hooks/useShopData";
import { StockAdjustmentModal } from "@/components/shop/StockAdjustmentModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ShopProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new";

  const { data, isLoading } = useShopArticle(isNew ? undefined : id);
  const { data: categories } = useShopCategories();
  const updateArticle = useUpdateArticle();
  const deleteArticle = useDeleteArticle();
  const createArticle = useCreateArticle();

  const [stockModalOpen, setStockModalOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    description: "",
    category: "Bekleidung",
    price: "",
    cost_price: "",
    stock_quantity: "0",
    min_stock: "5",
    status: "active" as "active" | "inactive" | "sold_out",
    is_popular: false,
  });

  // Load existing data
  useState(() => {
    if (data?.article && !isNew) {
      setFormData({
        name: data.article.name,
        sku: data.article.sku,
        description: data.article.description || "",
        category: data.article.category,
        price: data.article.price.toString(),
        cost_price: data.article.cost_price?.toString() || "",
        stock_quantity: data.article.stock_quantity.toString(),
        min_stock: data.article.min_stock.toString(),
        status: data.article.status,
        is_popular: data.article.is_popular,
      });
    }
  });

  // Update form when data loads
  if (data?.article && formData.name === "" && !isNew) {
    setFormData({
      name: data.article.name,
      sku: data.article.sku,
      description: data.article.description || "",
      category: data.article.category,
      price: data.article.price.toString(),
      cost_price: data.article.cost_price?.toString() || "",
      stock_quantity: data.article.stock_quantity.toString(),
      min_stock: data.article.min_stock.toString(),
      status: data.article.status,
      is_popular: data.article.is_popular,
    });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const articleData = {
      name: formData.name,
      sku: formData.sku,
      description: formData.description || null,
      category: formData.category,
      price: parseFloat(formData.price),
      cost_price: formData.cost_price ? parseFloat(formData.cost_price) : null,
      stock_quantity: parseInt(formData.stock_quantity),
      min_stock: parseInt(formData.min_stock),
      status: formData.status,
      is_popular: formData.is_popular,
      has_variants: false,
      image_url: null,
    };

    if (isNew) {
      await createArticle.mutateAsync(articleData);
      navigate("/shop/products");
    } else if (id) {
      await updateArticle.mutateAsync({ id, ...articleData });
    }
  };

  const handleDelete = async () => {
    if (id) {
      await deleteArticle.mutateAsync(id);
      navigate("/shop/products");
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);
  };

  const calculateMargin = () => {
    const price = parseFloat(formData.price) || 0;
    const cost = parseFloat(formData.cost_price) || 0;
    if (cost === 0 || price === 0) return "–";
    return Math.round(((price - cost) / price) * 100) + "%";
  };

  if (isLoading && !isNew) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? "Neues Produkt" : "Produkt bearbeiten"}
        description={isNew ? "Neuen Artikel zum Katalog hinzufügen" : data?.article?.sku}
        actions={
          <Button variant="outline" asChild>
            <Link to="/shop/products">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zum Katalog
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Grunddaten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Artikelname *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">Artikelnummer (SKU) *</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Kategorie</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bekleidung">Bekleidung</SelectItem>
                    <SelectItem value="Ausrüstung">Ausrüstung</SelectItem>
                    <SelectItem value="Accessoires">Accessoires</SelectItem>
                    <SelectItem value="Sonstiges">Sonstiges</SelectItem>
                    {categories?.filter(c => !["Bekleidung", "Ausrüstung", "Accessoires", "Sonstiges"].includes(c)).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Image Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>Bild</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                <Package className="h-12 w-12 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Bildupload kommt bald
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Price & Stock */}
        <Card>
          <CardHeader>
            <CardTitle>Preis & Bestand</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Verkaufspreis (CHF) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.05"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost_price">Einkaufspreis (CHF)</Label>
                <Input
                  id="cost_price"
                  type="number"
                  step="0.05"
                  value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Marge</Label>
                <div className="h-10 flex items-center px-3 bg-muted rounded-md font-medium">
                  {calculateMargin()}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_stock">Mindestbestand</Label>
                <Input
                  id="min_stock"
                  type="number"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                />
              </div>
            </div>

            {!isNew && data?.article && (
              <div className="mt-4 p-4 bg-muted rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Aktueller Bestand</p>
                  <p className="text-2xl font-bold">{data.article.stock_quantity} Stück</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setStockModalOpen(true)}>
                  Bestand anpassen
                </Button>
              </div>
            )}

            {isNew && (
              <div className="mt-4 space-y-2">
                <Label htmlFor="stock_quantity">Anfangsbestand</Label>
                <Input
                  id="stock_quantity"
                  type="number"
                  value={formData.stock_quantity}
                  onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={formData.status}
              onValueChange={(v) => setFormData({ ...formData, status: v as typeof formData.status })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="active" id="active" />
                <Label htmlFor="active" className="font-normal">
                  Aktiv (im Verkauf)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="inactive" id="inactive" />
                <Label htmlFor="inactive" className="font-normal">
                  Inaktiv (nicht sichtbar)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sold_out" id="sold_out" />
                <Label htmlFor="sold_out" className="font-normal">
                  Ausverkauft (sichtbar aber nicht kaufbar)
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between">
          {!isNew && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Artikel löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Diese Aktion kann nicht rückgängig gemacht werden. Der Artikel wird dauerhaft aus dem Katalog entfernt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="flex-1" />
          <Button
            type="submit"
            disabled={updateArticle.isPending || createArticle.isPending}
          >
            {(updateArticle.isPending || createArticle.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <Save className="mr-2 h-4 w-4" />
            Speichern
          </Button>
        </div>
      </form>

      {/* Stock Adjustment Modal */}
      <StockAdjustmentModal
        open={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        article={data?.article || null}
      />
    </div>
  );
}
