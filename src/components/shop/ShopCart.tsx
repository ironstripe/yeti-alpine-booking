import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Minus, Trash2, Banknote, CreditCard, Smartphone, FileText, Loader2 } from "lucide-react";
import { CartItem, useProcessSale } from "@/hooks/useShopData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ShopCartProps {
  items: CartItem[];
  onUpdateQuantity: (articleId: string, delta: number) => void;
  onRemoveItem: (articleId: string) => void;
  onClearCart: () => void;
  onSaleComplete: (transactionNumber: string, total: number, paymentMethod: string) => void;
}

export function ShopCart({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onSaleComplete,
}: ShopCartProps) {
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "twint" | "invoice">("cash");
  const [linkToBooking, setLinkToBooking] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string>("");

  const processSale = useProcessSale();

  // Fetch recent tickets for linking
  const { data: recentTickets } = useQuery({
    queryKey: ["recent-tickets-for-shop"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          ticket_number,
          customers (first_name, last_name)
        `)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: linkToBooking,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);
  };

  const subtotal = items.reduce(
    (sum, item) => sum + (item.variant?.price || item.article.price) * item.quantity,
    0
  );

  const discountAmount = discountValue
    ? discountType === "percent"
      ? (subtotal * parseFloat(discountValue)) / 100
      : parseFloat(discountValue)
    : 0;

  const total = Math.max(0, subtotal - discountAmount);

  const handleProcessSale = async () => {
    if (items.length === 0) return;

    const result = await processSale.mutateAsync({
      items,
      subtotal,
      discountAmount,
      discountPercent: discountType === "percent" && discountValue ? parseFloat(discountValue) : null,
      discountReason: discountReason || null,
      total,
      paymentMethod,
      linkedTicketId: linkToBooking && selectedTicketId ? selectedTicketId : null,
    });

    onSaleComplete(result.transaction_number, total, paymentMethod);
  };

  const paymentMethods = [
    { value: "cash", label: "Bar", icon: Banknote },
    { value: "card", label: "Karte", icon: CreditCard },
    { value: "twint", label: "TWINT", icon: Smartphone },
    { value: "invoice", label: "Rechnung", icon: FileText },
  ] as const;

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Warenkorb</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Der Warenkorb ist leer. Fügen Sie Artikel hinzu, um einen Verkauf zu starten.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Warenkorb</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClearCart}>
          Leeren
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cart Items */}
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.article.id + (item.variant?.id || "")}
              className="flex items-center justify-between gap-3 pb-3 border-b"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.article.name}</p>
                {item.variant && (
                  <p className="text-sm text-muted-foreground">{item.variant.name}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(item.variant?.price || item.article.price)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onUpdateQuantity(item.article.id, -1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-8 text-center font-medium">{item.quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onUpdateQuantity(item.article.id, 1)}
                  disabled={item.quantity >= item.article.stock_quantity}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-right min-w-[80px]">
                <p className="font-semibold">
                  {formatCurrency((item.variant?.price || item.article.price) * item.quantity)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onRemoveItem(item.article.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Discount */}
        <div className="space-y-2">
          <Label>Rabatt</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="w-24"
            />
            <Select
              value={discountType}
              onValueChange={(v) => setDiscountType(v as "percent" | "fixed")}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">%</SelectItem>
                <SelectItem value="fixed">CHF</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Grund (optional)"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              className="flex-1"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-2 pt-4 border-t">
          <div className="flex justify-between text-sm">
            <span>Zwischensumme</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>
                Rabatt {discountType === "percent" && discountValue ? `(${discountValue}%)` : ""}
              </span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold pt-2 border-t">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <Label>Zahlungsart</Label>
          <div className="grid grid-cols-4 gap-2">
            {paymentMethods.map((method) => (
              <Button
                key={method.value}
                variant={paymentMethod === method.value ? "default" : "outline"}
                className="flex-col h-auto py-3"
                onClick={() => setPaymentMethod(method.value)}
              >
                <method.icon className="h-5 w-5 mb-1" />
                <span className="text-xs">{method.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Link to Booking */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="linkBooking"
              checked={linkToBooking}
              onCheckedChange={(checked) => setLinkToBooking(checked === true)}
            />
            <Label htmlFor="linkBooking" className="text-sm font-normal">
              Mit Buchung verknüpfen
            </Label>
          </div>
          {linkToBooking && (
            <Select value={selectedTicketId} onValueChange={setSelectedTicketId}>
              <SelectTrigger>
                <SelectValue placeholder="Buchung auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {recentTickets?.map((ticket) => (
                  <SelectItem key={ticket.id} value={ticket.id}>
                    {ticket.ticket_number} - {ticket.customers?.first_name} {ticket.customers?.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          size="lg"
          onClick={handleProcessSale}
          disabled={processSale.isPending}
        >
          {processSale.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verarbeite...
            </>
          ) : (
            "Verkauf abschliessen"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
