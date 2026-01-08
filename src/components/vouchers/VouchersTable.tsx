import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, ExternalLink } from "lucide-react";
import { format, isPast } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import type { Voucher } from "@/hooks/useVouchers";

interface VouchersTableProps {
  vouchers: Voucher[] | undefined;
  isLoading: boolean;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; emoji: string }> = {
  active: { label: "Aktiv", variant: "default", emoji: "🟢" },
  partial: { label: "Teilweise", variant: "secondary", emoji: "🟡" },
  redeemed: { label: "Eingelöst", variant: "outline", emoji: "⚪" },
  expired: { label: "Abgelaufen", variant: "destructive", emoji: "🔴" },
  cancelled: { label: "Storniert", variant: "destructive", emoji: "❌" },
};

export function VouchersTable({ vouchers, isLoading }: VouchersTableProps) {
  const navigate = useNavigate();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getDisplayStatus = (voucher: Voucher) => {
    // Check if actually expired but status not updated
    if (voucher.status !== "cancelled" && voucher.status !== "redeemed" && isPast(new Date(voucher.expiry_date))) {
      return statusConfig.expired;
    }
    return statusConfig[voucher.status] || statusConfig.active;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!vouchers || vouchers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Gift className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Keine Gutscheine gefunden</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Erstellen Sie einen neuen Gutschein, um zu beginnen.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Käufer</TableHead>
          <TableHead className="text-right">Wert</TableHead>
          <TableHead className="text-right">Rest</TableHead>
          <TableHead>Gültig bis</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vouchers.map((voucher) => {
          const status = getDisplayStatus(voucher);
          return (
            <TableRow
              key={voucher.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/vouchers/${voucher.id}`)}
            >
              <TableCell className="font-mono font-medium">{voucher.code}</TableCell>
              <TableCell>{voucher.buyer_name || "—"}</TableCell>
              <TableCell className="text-right">{formatCurrency(voucher.original_value)}</TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(voucher.remaining_balance)}
              </TableCell>
              <TableCell>
                {format(new Date(voucher.expiry_date), "dd.MM.yyyy", { locale: de })}
              </TableCell>
              <TableCell>
                <Badge variant={status.variant} className="gap-1">
                  <span>{status.emoji}</span>
                  {status.label}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
