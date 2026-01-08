import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { ShopArticle, useAdjustStock } from "@/hooks/useShopData";

interface StockAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  article: ShopArticle | null;
}

export function StockAdjustmentModal({ open, onClose, article }: StockAdjustmentModalProps) {
  const [adjustmentType, setAdjustmentType] = useState<"purchase" | "adjustment" | "return">("purchase");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const adjustStock = useAdjustStock();

  const handleSubmit = async () => {
    if (!article || !quantity) return;

    let adjustedQuantity = parseInt(quantity);
    if (adjustmentType === "adjustment" && adjustedQuantity > 0) {
      // For corrections, calculate the difference
      adjustedQuantity = adjustedQuantity - article.stock_quantity;
    } else if (adjustmentType === "adjustment" && adjustedQuantity < 0) {
      // Negative adjustment (loss)
      adjustedQuantity = -Math.abs(adjustedQuantity);
    }

    await adjustStock.mutateAsync({
      articleId: article.id,
      quantity: adjustmentType === "purchase" || adjustmentType === "return" 
        ? Math.abs(parseInt(quantity)) 
        : adjustedQuantity,
      type: adjustmentType,
      reason: reason || getDefaultReason(),
    });

    handleClose();
  };

  const handleClose = () => {
    setAdjustmentType("purchase");
    setQuantity("");
    setReason("");
    onClose();
  };

  const getDefaultReason = () => {
    switch (adjustmentType) {
      case "purchase":
        return "Wareneingang";
      case "adjustment":
        return "Inventurkorrektur";
      case "return":
        return "Rückgabe";
      default:
        return "";
    }
  };

  const getNewStock = () => {
    if (!article || !quantity) return article?.stock_quantity || 0;
    const qty = parseInt(quantity);
    if (isNaN(qty)) return article.stock_quantity;

    switch (adjustmentType) {
      case "purchase":
      case "return":
        return article.stock_quantity + Math.abs(qty);
      case "adjustment":
        return qty; // Direct set for inventory correction
      default:
        return article.stock_quantity;
    }
  };

  if (!article) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bestand anpassen · {article.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Aktueller Bestand</p>
            <p className="text-2xl font-bold">{article.stock_quantity} Stück</p>
          </div>

          <div className="space-y-2">
            <Label>Anpassungsart</Label>
            <RadioGroup
              value={adjustmentType}
              onValueChange={(v) => setAdjustmentType(v as typeof adjustmentType)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="purchase" id="purchase" />
                <Label htmlFor="purchase" className="font-normal">
                  Zugang (Wareneingang)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="return" id="return" />
                <Label htmlFor="return" className="font-normal">
                  Rückgabe
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="adjustment" id="adjustment" />
                <Label htmlFor="adjustment" className="font-normal">
                  Korrektur (Inventur)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">
                {adjustmentType === "adjustment" ? "Neuer Bestand" : "Menge"}
              </Label>
              <Input
                id="quantity"
                type="number"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Neuer Bestand</Label>
              <div className="h-10 flex items-center px-3 bg-muted rounded-md font-bold">
                {getNewStock()} Stück
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Grund</Label>
            <Textarea
              id="reason"
              placeholder={getDefaultReason()}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!quantity || adjustStock.isPending}
          >
            {adjustStock.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Anpassen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
