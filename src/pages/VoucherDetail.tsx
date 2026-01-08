import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ArrowLeft, Printer, Mail, Calendar, XCircle } from "lucide-react";
import { format, isPast } from "date-fns";
import { de } from "date-fns/locale";
import { useReactToPrint } from "react-to-print";
import { useVoucher, useVoucherRedemptions, useCancelVoucher } from "@/hooks/useVouchers";
import { VoucherRedemptionModal } from "@/components/vouchers/VoucherRedemptionModal";
import { VoucherExtendModal } from "@/components/vouchers/VoucherExtendModal";
import { VoucherPrintTemplate } from "@/components/vouchers/VoucherPrintTemplate";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; emoji: string }> = {
  active: { label: "Aktiv", variant: "default", emoji: "🟢" },
  partial: { label: "Teilweise eingelöst", variant: "secondary", emoji: "🟡" },
  redeemed: { label: "Eingelöst", variant: "outline", emoji: "⚪" },
  expired: { label: "Abgelaufen", variant: "destructive", emoji: "🔴" },
  cancelled: { label: "Storniert", variant: "destructive", emoji: "❌" },
};

const paymentLabels: Record<string, string> = {
  bar: "Bargeld",
  karte: "Kreditkarte",
  twint: "TWINT",
  rechnung: "Rechnung",
};

export default function VoucherDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);

  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);

  const { data: voucher, isLoading } = useVoucher(id!);
  const { data: redemptions, isLoading: redemptionsLoading } = useVoucherRedemptions(id!);
  const cancelVoucher = useCancelVoucher();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Gutschein-${voucher?.code}`,
  });

  // Auto-print if coming from create with print flag
  useEffect(() => {
    if (searchParams.get("print") === "true" && voucher) {
      setTimeout(() => handlePrint(), 500);
    }
  }, [voucher, searchParams]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getDisplayStatus = () => {
    if (!voucher) return statusConfig.active;
    if (voucher.status !== "cancelled" && voucher.status !== "redeemed" && isPast(new Date(voucher.expiry_date))) {
      return statusConfig.expired;
    }
    return statusConfig[voucher.status] || statusConfig.active;
  };

  const canRedeem = voucher && 
    voucher.status !== "cancelled" && 
    voucher.status !== "redeemed" && 
    voucher.remaining_balance > 0 &&
    !isPast(new Date(voucher.expiry_date));

  const handleEmail = () => {
    if (!voucher) return;
    const subject = encodeURIComponent(`Ihr Gutschein ${voucher.code}`);
    const body = encodeURIComponent(
      `Guten Tag,\n\nAnbei Ihr Gutschein der Schneesportschule Malbun:\n\nCode: ${voucher.code}\nWert: ${formatCurrency(voucher.original_value)}\nGültig bis: ${format(new Date(voucher.expiry_date), "dd.MM.yyyy")}\n\nFreundliche Grüsse\nSchneesportschule Malbun`
    );
    window.location.href = `mailto:${voucher.buyer_email || ""}?subject=${subject}&body=${body}`;
  };

  const handleCancel = () => {
    if (!voucher) return;
    cancelVoucher.mutate(voucher.id);
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="Gutschein" description="Laden..." />
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </>
    );
  }

  if (!voucher) {
    return (
      <>
        <PageHeader title="Gutschein" description="Nicht gefunden" />
        <Card>
          <CardContent className="p-6 text-center">
            <p>Gutschein nicht gefunden.</p>
            <Button className="mt-4" onClick={() => navigate("/vouchers")}>
              Zurück zur Übersicht
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const status = getDisplayStatus();

  return (
    <>
      <PageHeader
        title={`Gutschein ${voucher.code}`}
        description={`Erstellt am ${format(new Date(voucher.created_at), "dd.MM.yyyy", { locale: de })}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/vouchers")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Drucken
            </Button>
            {voucher.buyer_email && (
              <Button variant="outline" onClick={handleEmail}>
                <Mail className="h-4 w-4 mr-2" />
                E-Mail
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-6">
        {/* Main Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <Badge variant={status.variant} className="text-base py-1 px-3 gap-1">
                <span>{status.emoji}</span>
                {status.label}
              </Badge>
            </div>

            <div className="bg-muted/50 rounded-lg p-6 text-center">
              <p className="text-sm text-muted-foreground mb-1">GUTSCHEIN</p>
              <p className="font-mono text-lg font-bold mb-4">{voucher.code}</p>
              
              <div className="space-y-1">
                <div className="flex justify-between max-w-xs mx-auto">
                  <span className="text-muted-foreground">Ursprünglicher Wert:</span>
                  <span>{formatCurrency(voucher.original_value)}</span>
                </div>
                <div className="flex justify-between max-w-xs mx-auto">
                  <span className="text-muted-foreground">Bereits eingelöst:</span>
                  <span>{formatCurrency(voucher.original_value - voucher.remaining_balance)}</span>
                </div>
                <div className="border-t my-2 max-w-xs mx-auto"></div>
                <div className="flex justify-between max-w-xs mx-auto font-bold text-lg">
                  <span>RESTGUTHABEN:</span>
                  <span className="text-primary">{formatCurrency(voucher.remaining_balance)}</span>
                </div>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                Gültig bis: {format(new Date(voucher.expiry_date), "dd. MMMM yyyy", { locale: de })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Käufer</p>
              <p className="font-medium">
                {voucher.buyer_name || "—"}
                {voucher.buyer_email && <span className="text-muted-foreground ml-1">({voucher.buyer_email})</span>}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Kaufdatum</p>
              <p className="font-medium">{format(new Date(voucher.created_at), "dd.MM.yyyy", { locale: de })}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Zahlungsart</p>
              <p className="font-medium">{paymentLabels[voucher.payment_method || ""] || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Bezahlt</p>
              <p className="font-medium">{voucher.is_paid ? "Ja" : "Nein"}</p>
            </div>
            {voucher.recipient_name && (
              <div>
                <p className="text-muted-foreground">Empfänger</p>
                <p className="font-medium">{voucher.recipient_name}</p>
              </div>
            )}
            {voucher.internal_note && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Interne Notiz</p>
                <p className="font-medium">{voucher.internal_note}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Redemption History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Einlösungshistorie</CardTitle>
          </CardHeader>
          <CardContent>
            {redemptionsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : redemptions && redemptions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="text-right">Restguthaben</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redemptions.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.redeemed_at), "dd.MM.yyyy HH:mm", { locale: de })}</TableCell>
                      <TableCell>
                        {r.ticket?.ticket_number || r.reason || "Manuelle Einlösung"}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(r.amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.balance_after)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Noch keine Einlösungen.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktionen</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              onClick={() => setShowRedeemModal(true)}
              disabled={!canRedeem}
            >
              Manuell einlösen
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowExtendModal(true)}
              disabled={voucher.status === "cancelled" || voucher.status === "redeemed"}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Verlängern
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={voucher.status === "cancelled" || voucher.status === "redeemed"}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Stornieren
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Gutschein stornieren?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Der Gutschein {voucher.code} mit einem Restguthaben von {formatCurrency(voucher.remaining_balance)} wird storniert und kann nicht mehr eingelöst werden.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Stornieren
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      {showRedeemModal && (
        <VoucherRedemptionModal
          voucher={voucher}
          open={showRedeemModal}
          onOpenChange={setShowRedeemModal}
        />
      )}
      {showExtendModal && (
        <VoucherExtendModal
          voucher={voucher}
          open={showExtendModal}
          onOpenChange={setShowExtendModal}
        />
      )}

      {/* Print Template */}
      <VoucherPrintTemplate ref={printRef} voucher={voucher} />
    </>
  );
}
