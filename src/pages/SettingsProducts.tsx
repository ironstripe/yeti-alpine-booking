import { useState } from "react";
import { Loader2, Plus, Package, MoreHorizontal, Pencil, Trash2, Link2, TrendingDown } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { useProducts, useDeleteProduct, ProductWithTiers } from "@/hooks/useProducts";
import { ProductFormModal } from "@/components/settings/ProductFormModal";
import { getProductPriceDisplay, formatPriceCHF } from "@/lib/pricing-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const productTypeLabels: Record<string, string> = {
  private: "Privatstunde",
  group: "Gruppenkurs",
  group_toddler: "Windel-Wedelkurs",
  group_beginner: "Anfängerkurs",
  lunch: "Mittagsbetreuung",
  addon: "Zusatzleistung",
};

const productTypeIcons: Record<string, string> = {
  private: "🎿",
  group: "👥",
  group_toddler: "👶",
  group_beginner: "⭐",
  lunch: "🍽️",
  addon: "🎁",
};

const pricingTypeLabels: Record<string, { label: string; icon: string }> = {
  fixed: { label: "Fixpreis", icon: "💰" },
  tiered: { label: "Staffel", icon: "📊" },
  hourly: { label: "Stunde", icon: "⏱️" },
};

export default function SettingsProducts() {
  const { data: products, isLoading } = useProducts();
  const deleteProduct = useDeleteProduct();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithTiers | null>(null);
  const [productToDelete, setProductToDelete] = useState<ProductWithTiers | null>(null);

  const handleEdit = (product: ProductWithTiers) => {
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

  const handleDeleteConfirm = () => {
    if (productToDelete) {
      deleteProduct.mutate(productToDelete.id, {
        onSuccess: () => setProductToDelete(null),
      });
    }
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
                    <TableHead>Preismodell</TableHead>
                    <TableHead>Preis</TableHead>
                    <TableHead>Training</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const pricingType = (product.pricing_type as string) || "fixed";
                    const pricingInfo = pricingTypeLabels[pricingType] || pricingTypeLabels.fixed;
                    
                    return (
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
                          <Badge variant="outline" className="text-xs">
                            <span className="mr-1">{pricingInfo.icon}</span>
                            {pricingInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {pricingType === "tiered" && product.price_tiers?.length ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5 cursor-help">
                                    <span>{getProductPriceDisplay(product)}</span>
                                    <TrendingDown className="h-3.5 w-3.5 text-green-600" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <div className="space-y-1.5">
                                    <div className="font-medium mb-2">Staffelpreise:</div>
                                    {[...product.price_tiers]
                                      .sort((a, b) => a.day_count - b.day_count)
                                      .map(tier => (
                                        <div key={tier.day_count} className="flex justify-between gap-4 text-sm">
                                          <span>{tier.day_count} {tier.day_count === 1 ? "Tag" : "Tage"}:</span>
                                          <span className="font-medium">{formatPriceCHF(tier.cumulative_price)}</span>
                                        </div>
                                      ))
                                    }
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : pricingType === "hourly" ? (
                            <span>{formatPriceCHF(product.price)}/h</span>
                          ) : (
                            <span>{formatPriceCHF(product.price)}</span>
                          )}
                          {pricingType !== "tiered" && product.duration_minutes && (
                            <span className="text-muted-foreground">
                              /{product.duration_minutes >= 60 ? `${product.duration_minutes / 60}h` : `${product.duration_minutes}min`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.is_training_product && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-1 text-primary">
                                    <Link2 className="h-4 w-4" />
                                    <span className="text-sm">Verknüpfbar</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Kann mit Trainings verknüpft werden
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => setProductToDelete(product)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Löschen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      <AlertDialog open={!!productToDelete} onOpenChange={() => setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Produkt löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Bist du sicher, dass du "{productToDelete?.name}" löschen möchtest? 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProduct.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Löschen"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}
