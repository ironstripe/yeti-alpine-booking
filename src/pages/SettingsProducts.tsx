import { useState } from "react";
import { Loader2, Plus, Package, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { useProducts } from "@/hooks/useProducts";
import { ProductFormModal } from "@/components/settings/ProductFormModal";
import { Product } from "@/hooks/useProducts";

const productTypeLabels: Record<string, string> = {
  private: "Privatstunde",
  group: "Gruppenkurs",
  addon: "Zusatzleistung",
};

const productTypeIcons: Record<string, string> = {
  private: "🎿",
  group: "👥",
  addon: "🍽️",
};

export default function SettingsProducts() {
  const { data: products, isLoading } = useProducts();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedProduct(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  if (isLoading) {
    return (
      <SettingsLayout title="Produkte" description="Verwalte die buchbaren Leistungen">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Produkte" description="Verwalte die buchbaren Leistungen">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Neues Produkt
          </Button>
        </div>

        {!products?.length ? (
          <EmptyState
            icon={Package}
            title="Keine Produkte"
            description="Erstelle dein erstes Produkt, um Buchungen zu ermöglichen."
            action={{
              label: "Neues Produkt",
              onClick: handleCreate,
            }}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Typ</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Preis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{productTypeIcons[product.type] || "📦"}</span>
                          <span className="text-sm text-muted-foreground">
                            {productTypeLabels[product.type] || product.type}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        CHF {product.price.toFixed(2)}
                        {product.duration_minutes && (
                          <span className="text-muted-foreground">
                            /{product.duration_minutes >= 60 ? `${product.duration_minutes / 60}h` : `${product.duration_minutes}min`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.is_active ? "default" : "secondary"}>
                          {product.is_active ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(product)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Bearbeiten
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <ProductFormModal
        open={isModalOpen}
        onOpenChange={handleCloseModal}
        product={selectedProduct}
      />
    </SettingsLayout>
  );
}
