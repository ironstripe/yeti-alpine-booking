import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { ShopKPICards } from "@/components/shop/ShopKPICards";
import { QuickPOS } from "@/components/shop/QuickPOS";
import { ShopCart } from "@/components/shop/ShopCart";
import { SaleSuccessModal } from "@/components/shop/SaleSuccessModal";
import { useShopStats, ShopArticle, CartItem } from "@/hooks/useShopData";

export default function Shop() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [successModal, setSuccessModal] = useState<{
    open: boolean;
    transactionNumber: string;
    total: number;
    paymentMethod: string;
  }>({
    open: false,
    transactionNumber: "",
    total: 0,
    paymentMethod: "",
  });

  const { data: stats } = useShopStats(new Date());

  const handleAddToCart = (article: ShopArticle) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.article.id === article.id);
      if (existing) {
        if (existing.quantity >= article.stock_quantity) return prev;
        return prev.map((item) =>
          item.article.id === article.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { article, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (articleId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.article.id === articleId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveItem = (articleId: string) => {
    setCart((prev) => prev.filter((item) => item.article.id !== articleId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleSaleComplete = (transactionNumber: string, total: number, paymentMethod: string) => {
    setSuccessModal({
      open: true,
      transactionNumber,
      total,
      paymentMethod,
    });
    setCart([]);
  };

  const handleNewSale = () => {
    setSuccessModal({ open: false, transactionNumber: "", total: 0, paymentMethod: "" });
    setCart([]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop"
        description="Point of Sale und Artikelverwaltung"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/shop/products">
                <Package className="mr-2 h-4 w-4" />
                Produkte verwalten
              </Link>
            </Button>
            <Button asChild>
              <Link to="/shop/products/new">
                <Plus className="mr-2 h-4 w-4" />
                Neuer Artikel
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <ShopKPICards
        todayRevenue={stats?.todayRevenue || 0}
        salesCount={stats?.salesCount || 0}
        totalArticles={stats?.totalArticles || 0}
        lowStockCount={stats?.lowStockCount || 0}
      />

      {/* POS Section */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <QuickPOS onAddToCart={handleAddToCart} />
        </div>
        <div>
          <ShopCart
            items={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onSaleComplete={handleSaleComplete}
          />
        </div>
      </div>

      {/* Success Modal */}
      <SaleSuccessModal
        open={successModal.open}
        onClose={() => setSuccessModal({ ...successModal, open: false })}
        onNewSale={handleNewSale}
        transactionNumber={successModal.transactionNumber}
        total={successModal.total}
        paymentMethod={successModal.paymentMethod}
      />
    </div>
  );
}
